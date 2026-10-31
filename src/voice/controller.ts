/**
 * Voice input as a different way to type, not a different way to edit. One click starts one
 * listening session for one utterance; the final transcript is normalised and handed to the same
 * `send` the text box uses, exactly once. Spoken "apply" / "reject" act on the pending proposal
 * like the buttons. Recognition never touches the project: everything after `send` is Phase 2.
 *
 * Guards: interim results never submit; a session submits at most one final transcript (duplicate
 * or revised finals are ignored); cancel, a project switch or dispose make a session's late events
 * and replies inert; listening stops after `maxListenMs`.
 */
import type { ChatMessage } from '@/ai/conversation';
import { normaliseSpokenRequest, voiceIntent } from './normalize';
import { SPEECH_MESSAGES, SpeechError, type SpeechErrorCode, type SpeechToTextProvider } from './speech';
import type { TextToSpeech } from './synthesis';

export type VoiceStatus = 'idle' | 'requesting-permission' | 'listening' | 'processing' | 'speaking' | 'error';

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
  notice: string;
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
}

export class VoiceController {
  state: VoiceState;
  private listeners = new Set<(s: VoiceState) => void>();
  private session = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly deps: VoiceDeps, prefs: { speakReplies: boolean; reviewBeforeSending: boolean } = { speakReplies: true, reviewBeforeSending: false }) {
    this.state = {
      status: deps.provider ? 'idle' : 'error',
      supported: deps.provider !== null,
      interim: '',
      heard: null,
      sent: null,
      error: deps.provider ? null : { code: 'unsupported', message: SPEECH_MESSAGES.unsupported },
      speakReplies: prefs.speakReplies,
      reviewBeforeSending: prefs.reviewBeforeSending,
      notice: deps.provider?.notice ?? '',
    };
  }

  subscribe(fn: (s: VoiceState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setPrefs(patch: Partial<Pick<VoiceState, 'speakReplies' | 'reviewBeforeSending'>>): void {
    if (patch.speakReplies === false) this.deps.tts.stop();
    this.update(patch);
  }

  /** Starts one listening session (always from a click or key press). */
  async start(): Promise<void> {
    if (this.disposed || !this.deps.provider) return;
    if (this.state.status === 'listening' || this.state.status === 'requesting-permission' || this.state.status === 'processing') return;
    this.deps.tts.stop();
    const id = ++this.session;
    const projectId = this.deps.projectId();
    let submitted = false;
    let lastInterim = '';
    let errored = false;
    this.update({ status: 'requesting-permission', interim: '', error: null });
    const live = () => id === this.session && !this.disposed;
    try {
      await this.deps.provider.start({
        language: this.deps.language(),
        onStart: () => {
          if (!live()) return;
          this.update({ status: 'listening' });
          this.clearTimer();
          this.timer = setTimeout(() => {
            if (live() && this.state.status === 'listening') void this.deps.provider?.stop();
          }, this.deps.maxListenMs ?? 15_000);
        },
        onResult: (r) => {
          if (!live() || submitted) return;
          if (!r.isFinal) {
            lastInterim = r.transcript;
            if (this.state.status === 'requesting-permission') this.update({ status: 'listening' });
            this.update({ interim: r.transcript });
            return;
          }
          submitted = true;
          this.clearTimer();
          void this.deps.provider?.stop();
          void this.finish(id, r.transcript, projectId);
        },
        onError: (e: SpeechError) => {
          if (!live() || submitted) return;
          if (e.code === 'aborted') return;
          errored = true;
          this.clearTimer();
          this.update({ status: 'error', interim: '', error: { code: e.code, message: e.message } });
        },
        onEnd: () => {
          if (!live()) return;
          this.clearTimer();
          if (submitted || errored) return;
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
      if (!live()) return;
      const err = e instanceof SpeechError ? e : new SpeechError('unknown', SPEECH_MESSAGES.unknown);
      this.update({ status: 'error', error: { code: err.code, message: err.message } });
    }
  }

  /** Stops listening; a final result already on its way is still used. */
  async stop(): Promise<void> {
    this.clearTimer();
    if (this.state.status === 'listening' || this.state.status === 'requesting-permission') await this.deps.provider?.stop();
  }

  /** Cancels everything: listening, an in-flight request and speech. Nothing is submitted. */
  async cancel(): Promise<void> {
    this.session++;
    this.clearTimer();
    this.deps.tts.stop();
    await this.deps.provider?.cancel();
    if (this.state.status === 'processing') this.deps.cancelRequest();
    this.update({ status: 'idle', interim: '' });
  }

  stopSpeaking(): void {
    this.deps.tts.stop();
    if (this.state.status === 'speaking') this.update({ status: 'idle' });
  }

  dismissError(): void {
    if (this.state.status === 'error' && this.state.supported) this.update({ status: 'idle', error: null });
    else if (this.state.error && this.state.supported) this.update({ error: null });
  }

  /** Releases the microphone; late events are ignored (component unmount, project closed). */
  dispose(): void {
    this.disposed = true;
    void this.cancel();
    this.listeners.clear();
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
    if (intent === 'stop' || intent === 'cancel') {
      this.update({ status: 'idle', sent: null });
      return;
    }
    if (intent === 'approve' || intent === 'reject') {
      const pending = this.deps.pendingProposal();
      if (!pending) {
        this.update({ status: 'idle', error: { code: 'nothing-pending', message: `There is no change waiting for approval, so “${heard}” did nothing.` } });
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
    if (this.state.reviewBeforeSending) {
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

  private say(id: number, text: string | null): void {
    if (!text || !this.state.speakReplies || !this.deps.tts.supported) {
      this.update({ status: 'idle' });
      return;
    }
    this.update({ status: 'speaking' });
    this.deps.tts.speak(text, {
      language: this.deps.language(),
      onEnd: () => {
        if (id === this.session && this.state.status === 'speaking') this.update({ status: 'idle' });
      },
    });
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
    case 'layouts': {
      const r = m.result;
      if (m.status === 'applied') return 'The layout was applied.';
      const head = r.infeasible.length ? `${firstSentence(r.infeasible[0]!)} ` : '';
      if (!r.candidates.length) return `${head}I found no option that meets every requirement.`;
      return `${head}I found ${r.candidates.length} option${r.candidates.length === 1 ? '' : 's'}. Option one is ${r.candidates[0]!.name.split(' · ')[0]}. Preview them in the panel, then say apply option one, or another number.`;
    }
  }
}
