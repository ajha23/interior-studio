/**
 * Voice input as a different way to type, not a different way to edit. One click starts one
 * listening session for one utterance; the final transcript is normalised and handed to the same
 * `send` the text box uses, exactly once. Spoken "apply" / "reject" act on the pending proposal
 * like the buttons. Recognition never touches the project: everything after `send` is Phase 2.
 *
 * Hands-free conversation (like Gemini Live or ChatGPT voice) has two engines:
 * - realtime (default when the server has a Gemini key): a streamed speech-to-speech session with
 *   Gemini Live (src/voice/live). Turn detection, barge-in and echo cancellation are handled by the
 *   model's server and the browser; the model's tool calls go through the normal preview/approval path.
 * - standard (any provider, or when realtime is unavailable): this controller listens, sends, speaks
 *   the reply and then listens again. It is half-duplex — the microphone is off while a reply plays,
 *   so the assistant never hears itself; the Stop button interrupts a reply.
 * Either ends on End / Esc, a spoken "goodbye" or "end conversation", after a set time without
 * speech, after a maximum length, on a project switch or on a microphone error; Hold pauses it.
 *
 * Guards: interim results never submit; a session submits at most one final transcript (duplicate
 * or revised finals are ignored); cancel, a project switch or dispose make a session's late events
 * and replies inert; listening stops after `maxListenMs`.
 */
import type { ChatMessage } from '@/ai/conversation';
import { normaliseSpokenRequest, voiceIntent } from './normalize';
import { SPEECH_MESSAGES, SpeechError, type SpeechErrorCode, type SpeechToTextProvider } from './speech';
import type { LiveCallbacks, LiveHandle, LiveToolCall } from './live/session';
import type { TextToSpeech } from './synthesis';

export type VoiceStatus = 'idle' | 'requesting-permission' | 'listening' | 'processing' | 'speaking' | 'error';

export type ConversationEnd = 'user' | 'voice' | 'idle' | 'limit' | 'error' | 'project';

export interface ConversationState {
  active: boolean;
  /** Microphone paused; the conversation continues on Resume. */
  held: boolean;
  /** Seconds until the conversation ends for lack of speech; shown in the last 15 s. */
  idleSecondsLeft: number | null;
  /** Why the last conversation ended, for the panel. */
  ended: { reason: ConversationEnd; message: string } | null;
  /** Realtime (Gemini Live, streamed) or the standard listen → reply → speak loop. */
  mode: 'realtime' | 'standard' | null;
  /** What the assistant is saying (realtime captions). */
  reply: string;
  /** Why the standard loop is used instead of realtime, or that echo cancellation is unavailable. */
  notice: string | null;
}

export interface VoiceState {
  status: VoiceStatus;
  supported: boolean;
  /** Live (interim) words while listening. */
  interim: string;
  /** The last finished utterance as heard, and as sent after normalisation. */
  heard: string | null;
  sent: string | null;
  error: { code: SpeechErrorCode | 'project-changed' | 'nothing-pending'; message: string } | null;
  /** Spoken feedback for voice requests. */
  speakReplies: boolean;
  /** Put the transcript in the text box for editing instead of sending it straight away. */
  reviewBeforeSending: boolean;
  /** How long a hands-free conversation waits for speech before ending. */
  idleTimeoutMs: number;
  notice: string;
  conversation: ConversationState;
}

export interface VoiceDeps {
  provider: SpeechToTextProvider | null;
  tts: TextToSpeech;
  /** Recognition language (BCP 47), read at the start of each session. */
  language: () => string;
  /** The shared Phase 2 submission path. */
  submit: (text: string) => Promise<ChatMessage | null>;
  /** Cancels an in-flight assistant request. */
  cancelRequest: () => void;
  pendingProposal: () => string | null;
  approve: (id: string) => void;
  reject: (id: string) => void;
  /** The proposal message by id after approval, to report the outcome. */
  message: (id: string) => ChatMessage | undefined;
  projectId: () => string | null;
  /** Puts a transcript into the text box (review mode, or a partial utterance). */
  draft: (text: string) => void;
  maxListenMs?: number;
  /** Longest hands-free conversation (default 30 minutes). */
  maxConversationMs?: number;
  /** Delay before listening again in a conversation (lets the audio device settle). */
  relistenDelayMs?: number;
  now?: () => number;
  /** The realtime engine (Gemini Live). Without it, conversations use the standard loop. */
  live?: {
    /** The designer's choice in settings. */
    enabled: () => boolean;
    start: (callbacks: LiveCallbacks) => Promise<LiveHandle>;
    runTool: (call: LiveToolCall, turn: { userText: string }) => Promise<{ output: string } | { error: string }>;
    context: LiveCallbacks['context'];
    /** Puts a spoken exchange that used no tool into the chat history. */
    logExchange: (userText: string, modelText: string) => void;
  };
}

export const IDLE_TIMEOUTS = [30_000, 60_000, 120_000, 300_000] as const;
export const DEFAULT_IDLE_TIMEOUT = 60_000;

const IDLE: ConversationState = { active: false, held: false, idleSecondsLeft: null, ended: null, mode: null, reply: '', notice: null };

/** Realtime errors after which the standard loop is tried instead (the microphone itself works). */
const FALL_BACK = new Set(['unavailable', 'provider_error', 'rate_limited', 'error', 'malformed_output', 'timeout']);

const minutes = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} minute${ms >= 120_000 ? 's' : ''}` : `${Math.round(ms / 1000)} seconds`);

export class VoiceController {
  state: VoiceState;
  private listeners = new Set<(s: VoiceState) => void>();
  private session = 0;
  /** Identifies the reply being spoken, independent of listening sessions (barge-in listens while it plays). */
  private speech = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private relistenTimer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private listening = false;
  private live: LiveHandle | null = null;
  /** The realtime model said goodbye: end once it has finished speaking. */
  private endAfterReply = false;
  private lastActivity = 0;
  private startedAt = 0;
  private quickEnds = 0;

  constructor(
    private readonly deps: VoiceDeps,
    prefs: { speakReplies: boolean; reviewBeforeSending: boolean; idleTimeoutMs?: number } = { speakReplies: true, reviewBeforeSending: false },
  ) {
    this.state = {
      status: deps.provider ? 'idle' : 'error',
      supported: deps.provider !== null,
      interim: '',
      heard: null,
      sent: null,
      error: deps.provider ? null : { code: 'unsupported', message: SPEECH_MESSAGES.unsupported },
      speakReplies: prefs.speakReplies,
      reviewBeforeSending: prefs.reviewBeforeSending,
      idleTimeoutMs: prefs.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT,
      notice: deps.provider?.notice ?? '',
      conversation: IDLE,
    };
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private get inConversation(): boolean {
    return this.state.conversation.active;
  }

  subscribe(fn: (s: VoiceState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setPrefs(patch: Partial<Pick<VoiceState, 'speakReplies' | 'reviewBeforeSending' | 'idleTimeoutMs'>>): void {
    if (patch.speakReplies === false) this.deps.tts.stop();
    this.update(patch);
  }

  /** Starts a hands-free conversation (always from a click). */
  async startConversation(): Promise<void> {
    const live = this.deps.live;
    const realtime = !!live && live.enabled();
    if (this.disposed || this.inConversation || (!this.deps.provider && !realtime)) return;
    this.startedAt = this.lastActivity = this.now();
    this.quickEnds = 0;
    this.endAfterReply = false;
    this.update({ conversation: { ...IDLE, active: true, mode: realtime ? 'realtime' : 'standard' }, error: null });
    this.clearTick();
    this.tick = setInterval(() => this.checkIdle(), 1000);
    if (this.state.status === 'speaking') this.deps.tts.stop();
    if (!realtime) {
      await this.start();
      return;
    }
    const session = ++this.session;
    this.update({ status: 'requesting-permission', interim: '' });
    try {
      const handle = await live.start(this.liveCallbacks(session));
      if (session !== this.session || !this.inConversation) {
        handle.close();
        return;
      }
      this.live = handle;
      if (!handle.echoCancelled) this.patchConversation({ notice: 'Echo cancellation is not available in this browser, so the microphone pauses while the assistant speaks. Headphones work best.' });
    } catch (e) {
      if (session !== this.session || !this.inConversation) return;
      const code = (e as { code?: string }).code ?? 'error';
      const message = e instanceof Error ? e.message : 'Realtime voice could not start.';
      if (FALL_BACK.has(code) && this.deps.provider) {
        // The server has no Gemini key (or Live failed): carry on with the standard loop.
        this.patchConversation({ mode: 'standard', notice: `${message} Using the standard voice loop instead.` });
        this.update({ status: 'idle' });
        await this.start();
        return;
      }
      this.update({ status: 'error', error: { code: code === 'permission-denied' || code === 'no-microphone' ? code : 'unknown', message } });
      this.endConversation('error', `Voice conversation ended: ${message}`);
    }
  }

  private patchConversation(patch: Partial<ConversationState>): void {
    this.update({ conversation: { ...this.state.conversation, ...patch } });
  }

  /** Maps the realtime session onto this controller's state. */
  private liveCallbacks(session: number): LiveCallbacks {
    const live = this.deps.live!;
    const current = () => session === this.session && this.inConversation;
    // Ends after a goodbye only once its audio has played out (the session reports listening then).
    const finishIfDone = () => {
      if (this.endAfterReply && this.state.status === 'listening' && current()) this.endConversation('voice');
    };
    return {
      context: live.context,
      onPhase: (phase) => {
        if (!current()) return;
        const status = phase === 'connecting' ? 'requesting-permission' : phase === 'thinking' ? 'processing' : phase;
        if (phase === 'thinking' || phase === 'speaking') this.lastActivity = this.now();
        this.update({ status });
        if (phase === 'listening') {
          // The idle timer runs from the end of the reply.
          this.lastActivity = this.now();
          finishIfDone();
        }
      },
      onUserSpeech: (text) => {
        if (!current()) return;
        this.lastActivity = this.now();
        this.update({ interim: text });
      },
      onModelSpeech: (text) => {
        if (current()) this.patchConversation({ reply: text });
      },
      onToolCall: (call, turn) => {
        if (call.name === 'end_conversation') this.endAfterReply = true;
        return live.runTool(call, turn);
      },
      onTurnComplete: ({ userText, modelText, toolUsed }) => {
        if (!current()) return;
        if (userText) this.update({ heard: userText, sent: userText, interim: '' });
        if (!toolUsed && userText && modelText) live.logExchange(userText, modelText);
        if (voiceIntent(userText) === 'end') this.endAfterReply = true;
        finishIfDone();
      },
      onClose: ({ message }) => {
        if (current()) this.endConversation('error', `Voice conversation ended: ${message}`);
      },
    };
  }

  /** Ends the conversation: microphone off, reply silenced. A request already sent still completes. */
  endConversation(reason: ConversationEnd = 'user', message?: string): void {
    if (!this.inConversation) return;
    this.clearTick();
    this.clearRelisten();
    this.live?.close();
    this.live = null;
    this.endAfterReply = false;
    this.session++;
    this.speech++;
    this.clearTimer();
    if (reason !== 'voice') this.deps.tts.stop();
    void this.deps.provider?.cancel();
    this.listening = false;
    const text =
      message ??
      {
        user: 'Voice conversation ended.',
        voice: 'Voice conversation ended.',
        idle: `Voice conversation ended after ${minutes(this.state.idleTimeoutMs)} without speech.`,
        limit: `Voice conversation ended after ${minutes(this.deps.maxConversationMs ?? 1_800_000)}. Start a new one to keep talking.`,
        error: 'Voice conversation ended.',
        project: 'Voice conversation ended because another project was opened.',
      }[reason];
    this.update({ conversation: { ...IDLE, ended: { reason, message: text } }, interim: '', ...(this.state.status === 'processing' || this.state.status === 'error' || (reason === 'voice' && this.state.status === 'speaking') ? {} : { status: 'idle' }) });
  }

  /** Pauses the microphone and any reply; the conversation resumes where it was. */
  hold(): void {
    if (!this.inConversation || this.state.conversation.held) return;
    if (this.live) {
      this.live.pause();
      this.update({ conversation: { ...this.state.conversation, held: true, idleSecondsLeft: null }, interim: '', status: 'idle' });
      return;
    }
    this.clearRelisten();
    this.session++;
    this.speech++;
    this.clearTimer();
    this.deps.tts.stop();
    void this.deps.provider?.cancel();
    this.listening = false;
    this.update({ conversation: { ...this.state.conversation, held: true, idleSecondsLeft: null }, interim: '', ...(this.state.status === 'processing' ? {} : { status: 'idle' }) });
  }

  resume(): void {
    if (!this.inConversation || !this.state.conversation.held) return;
    this.lastActivity = this.now();
    this.update({ conversation: { ...this.state.conversation, held: false } });
    if (this.live) {
      this.live.resume();
      this.update({ status: 'listening' });
      return;
    }
    this.continueConversation(0);
  }

  /** Starts one listening session (from a click or key press, or by the conversation loop). */
  async start(): Promise<void> {
    if (this.disposed || !this.deps.provider || this.listening || this.live) return;
    if (this.state.status === 'listening' || this.state.status === 'requesting-permission' || this.state.status === 'processing') return;
    this.speech++;
    this.deps.tts.stop();
    const id = ++this.session;
    const projectId = this.deps.projectId();
    const conversation = this.inConversation;
    let submitted = false;
    let lastInterim = '';
    let errored = false;
    const opened = this.now();
    this.listening = true;
    this.update({ status: conversation ? 'listening' : 'requesting-permission', interim: '', error: null });
    const live = () => id === this.session && !this.disposed;
    try {
      await this.deps.provider.start({
        language: this.deps.language(),
        onStart: () => {
          if (!live()) return;
          this.update({ status: 'listening' });
          this.clearTimer();
          this.timer = setTimeout(() => {
            if (live() && this.listening) void this.deps.provider?.stop();
          }, this.deps.maxListenMs ?? (conversation ? 30_000 : 15_000));
        },
        onResult: (r) => {
          if (!live() || submitted) return;
          this.lastActivity = this.now();
          if (!r.isFinal) {
            lastInterim = r.transcript;
            if (this.state.status === 'requesting-permission') this.update({ status: 'listening' });
            this.update({ interim: r.transcript });
            return;
          }
          submitted = true;
          this.clearTimer();
          void this.deps.provider?.stop();
          void this.finish(id, r.transcript, projectId).then(() => this.afterTurn());
        },
        onError: (e: SpeechError) => {
          if (!live() || submitted) return;
          if (e.code === 'aborted') return;
          // In a conversation, silence is expected: keep listening until the idle limit.
          if (this.inConversation && (e.code === 'no-speech' || e.code === 'timeout')) return;
          errored = true;
          this.listening = false;
          this.clearTimer();
          this.update({ status: 'error', interim: '', error: { code: e.code, message: e.message } });
          if (this.inConversation) this.endConversation('error', `Voice conversation ended: ${e.message}`);
        },
        onEnd: () => {
          if (!live()) return;
          this.listening = false;
          this.clearTimer();
          if (submitted || errored) return;
          if (this.inConversation) {
            // An utterance cut off without a final result is still the designer's turn.
            if (lastInterim.trim()) {
              submitted = true;
              void this.finish(id, lastInterim, projectId).then(() => this.afterTurn());
              return;
            }
            this.quickEnds = this.now() - opened < 300 ? this.quickEnds + 1 : 0;
            if (this.quickEnds >= 5) {
              this.endConversation('error', 'Voice conversation ended: the microphone keeps stopping. Check it, or type instead.');
              return;
            }
            if (this.state.status === 'listening' || this.state.status === 'requesting-permission') this.update({ status: 'idle', interim: '' });
            this.continueConversation();
            return;
          }
          // Ended without a final result. A partial utterance is offered for editing, never sent.
          if (lastInterim.trim()) {
            this.deps.draft(normaliseSpokenRequest(lastInterim));
            this.update({ status: 'idle', interim: '', heard: lastInterim, error: { code: 'no-speech', message: 'I only caught part of that. Check it in the message box and press Send.' } });
          } else if (this.state.status === 'listening' || this.state.status === 'requesting-permission') {
            this.update({ status: 'idle', interim: '' });
          }
        },
      });
    } catch (e) {
      this.listening = false;
      if (!live()) return;
      const err = e instanceof SpeechError ? e : new SpeechError('unknown', SPEECH_MESSAGES.unknown);
      this.update({ status: 'error', error: { code: err.code, message: err.message } });
      if (this.inConversation) this.endConversation('error', `Voice conversation ended: ${err.message}`);
    }
  }

  /** Stops listening; a final result already on its way is still used. */
  async stop(): Promise<void> {
    this.clearTimer();
    if (this.listening || this.state.status === 'listening' || this.state.status === 'requesting-permission') await this.deps.provider?.stop();
  }

  /** Cancels everything: listening, an in-flight request and speech. Nothing is submitted. Ends a conversation. */
  async cancel(): Promise<void> {
    if (this.inConversation) this.endConversation('user');
    this.session++;
    this.speech++;
    this.clearTimer();
    this.clearRelisten();
    this.listening = false;
    this.deps.tts.stop();
    await this.deps.provider?.cancel();
    if (this.state.status === 'processing') this.deps.cancelRequest();
    this.update({ status: 'idle', interim: '' });
  }

  stopSpeaking(): void {
    this.speech++;
    this.deps.tts.stop();
    if (this.state.status === 'speaking') this.update({ status: this.listening ? 'listening' : 'idle' });
    this.lastActivity = this.now();
    this.continueConversation();
  }

  dismissError(): void {
    if (this.state.status === 'error' && this.state.supported) this.update({ status: 'idle', error: null });
    else if (this.state.error && this.state.supported) this.update({ error: null });
    if (this.state.conversation.ended) this.update({ conversation: { ...this.state.conversation, ended: null } });
  }

  /** Releases the microphone; late events are ignored (component unmount, project closed). */
  dispose(): void {
    this.disposed = true;
    this.clearTick();
    void this.cancel();
    this.listeners.clear();
  }

  /** After a turn: listen again once the reply has finished playing. */
  private afterTurn(): void {
    if (!this.inConversation || this.state.conversation.held) return;
    this.continueConversation();
  }

  private continueConversation(delay = this.deps.relistenDelayMs ?? 400): void {
    if (!this.inConversation || this.state.conversation.held || this.disposed || this.listening || this.live) return;
    // Half-duplex: never listen while a reply plays, so the assistant cannot hear itself.
    if (this.state.status === 'processing' || this.state.status === 'error' || this.state.status === 'speaking') return;
    this.clearRelisten();
    const go = () => {
      this.relistenTimer = null;
      if (!this.inConversation || this.state.conversation.held || this.listening) return;
      if (this.state.status === 'processing' || this.state.status === 'speaking') return;
      void this.start();
    };
    if (delay <= 0) go();
    else this.relistenTimer = setTimeout(go, delay);
  }

  /** Ends the conversation after the idle limit without speech, or at the maximum length. */
  private checkIdle(): void {
    if (!this.inConversation) return;
    const now = this.now();
    if (now - this.startedAt >= (this.deps.maxConversationMs ?? 1_800_000)) {
      this.endConversation('limit');
      return;
    }
    // Waiting for the assistant or hearing its reply is not inactivity; neither is being on hold.
    if (this.state.conversation.held || this.state.status === 'processing' || this.state.status === 'speaking') {
      this.lastActivity = now;
      if (this.state.conversation.idleSecondsLeft !== null) this.update({ conversation: { ...this.state.conversation, idleSecondsLeft: null } });
      return;
    }
    const left = Math.ceil((this.state.idleTimeoutMs - (now - this.lastActivity)) / 1000);
    if (left <= 0) {
      this.endConversation('idle');
      return;
    }
    const shown = left <= 15 ? left : null;
    if (shown !== this.state.conversation.idleSecondsLeft) this.update({ conversation: { ...this.state.conversation, idleSecondsLeft: shown } });
  }

  private async finish(id: number, transcript: string, projectId: string | null): Promise<void> {
    const heard = transcript.trim();
    if (!heard) {
      this.update({ status: 'idle', interim: '' });
      return;
    }
    this.update({ interim: '', heard });
    if (this.deps.projectId() !== projectId) {
      this.update({ status: 'error', error: { code: 'project-changed', message: 'A different project was opened while you were speaking, so nothing was sent.' } });
      return;
    }
    const intent = voiceIntent(heard);
    if (intent === 'end') {
      if (this.inConversation) {
        this.endConversation('voice');
        this.say(id, 'Okay. Talk to you later.');
      } else this.update({ status: 'idle', sent: null });
      return;
    }
    if (intent === 'stop' || intent === 'cancel') {
      this.update({ status: 'idle', sent: null });
      return;
    }
    if (intent === 'approve' || intent === 'reject') {
      const pending = this.deps.pendingProposal();
      if (!pending) {
        this.update({ status: 'idle', error: { code: 'nothing-pending', message: `There is no change waiting for approval, so “${heard}” did nothing.` } });
        if (this.inConversation) this.say(id, 'There is no change waiting for approval.');
        return;
      }
      if (intent === 'reject') {
        this.deps.reject(pending);
        this.say(id, 'Rejected. Nothing was changed.');
        return;
      }
      this.deps.approve(pending);
      const m = this.deps.message(pending);
      const applied = m?.role === 'assistant' && m.kind === 'proposal' && m.status === 'applied';
      this.say(id, applied ? 'The change was applied.' : 'The project changed since that preview, so I checked it again. Review it and say apply.');
      return;
    }
    const text = normaliseSpokenRequest(heard);
    // In a conversation there is no pause to edit: requests are sent as heard.
    if (this.state.reviewBeforeSending && !this.inConversation) {
      this.deps.draft(text);
      this.update({ status: 'idle', sent: null });
      return;
    }
    this.update({ status: 'processing', sent: text });
    const reply = await this.deps.submit(text);
    if (id !== this.session || this.disposed) return;
    if (this.deps.projectId() !== projectId) {
      this.update({ status: 'idle' });
      return;
    }
    this.say(id, reply ? spokenSummary(reply) : null);
  }

  private say(_id: number, text: string | null): void {
    if (!text || !this.state.speakReplies || !this.deps.tts.supported) {
      this.update({ status: 'idle' });
      return;
    }
    const turn = ++this.speech;
    this.update({ status: 'speaking' });
    this.deps.tts.speak(text, {
      language: this.deps.language(),
      onEnd: () => {
        if (turn !== this.speech) return;
        this.lastActivity = this.now();
        if (this.state.status === 'speaking') this.update({ status: 'idle' });
        this.afterTurn();
      },
    });
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private clearRelisten(): void {
    if (this.relistenTimer) clearTimeout(this.relistenTimer);
    this.relistenTimer = null;
  }

  private clearTick(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  private update(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}

const firstSentence = (s: string) => (/^.*?[.?!](\s|$)/.exec(s)?.[0] ?? s).trim().slice(0, 200);

/** A short spoken line for an assistant reply: never tables or long lists. */
export function spokenSummary(m: ChatMessage): string | null {
  if (m.role !== 'assistant') return null;
  switch (m.kind) {
    case 'proposal':
      if (m.status === 'applied') return 'The change was applied.';
      if (m.status === 'proposed') return `The change is ready to preview. ${firstSentence(m.proposal.explanation)} Say apply, or reject.`;
      return `That change can't be made. ${firstSentence(m.proposal.errors[0] ?? '')}${m.proposal.alternatives.length ? ' I found an alternative you can choose in the panel.' : ''}`;
    case 'clarify':
      return m.question;
    case 'answer':
      return firstSentence(m.text);
    case 'history':
      return m.text.startsWith('Undid') ? 'Undone.' : m.text.startsWith('Redid') ? 'Redone.' : firstSentence(m.text);
    case 'error':
      return firstSentence(m.text);
    case 'deliverable':
      return `${m.reply.title}. ${firstSentence(m.reply.lines[0] ?? '')}`;
    case 'package':
      return `${m.reply.title}. ${firstSentence(m.reply.lines[0] ?? '')}${m.reply.actions.some((a) => a.action.startsWith('package:apply')) ? ' Press Apply in the panel to make the change.' : ''}`;
    case 'layouts': {
      const r = m.result;
      if (m.status === 'applied') return 'The layout was applied.';
      const head = r.infeasible.length ? `${firstSentence(r.infeasible[0]!)} ` : '';
      if (!r.candidates.length) return `${head}I found no option that meets every requirement.`;
      return `${head}I found ${r.candidates.length} option${r.candidates.length === 1 ? '' : 's'}. Option one is ${r.candidates[0]!.name.split(' · ')[0]}. Preview them in the panel, then say apply option one, or another number.`;
    }
  }
}
