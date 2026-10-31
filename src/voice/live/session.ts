/**
 * One realtime voice conversation with Gemini Live. The browser gets a single-use token locked to
 * the model, instructions and tools from `/api/live-token`, connects to Google directly over a
 * WebSocket, streams microphone audio in and plays the model's audio as it arrives. Turn detection
 * and barge-in happen on the server; an interruption flushes playback at once.
 *
 * The SDK is loaded on first use so it is not part of the main bundle. Tool calls are handed to
 * `onToolCall` (the app runs them: read-only inspection, or proposals through the normal preview and
 * approval path) and the result goes back to the model.
 */
import { liveConfig, LiveTokenSchema } from '@/ai/live';
import { openMicrophone, PcmPlayer, type MicCapture } from './audio';

export type LivePhase = 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface LiveToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface LiveCallbacks {
  onPhase: (phase: LivePhase) => void;
  /** What the designer is saying in this turn so far (live transcription). */
  onUserSpeech: (text: string) => void;
  /** What the model is saying in this turn so far. */
  onModelSpeech: (text: string) => void;
  onToolCall: (call: LiveToolCall, turn: { userText: string }) => Promise<{ output: string } | { error: string }>;
  /** A turn finished; `toolUsed` says whether it went through a tool already logged in the chat. */
  onTurnComplete: (turn: { userText: string; modelText: string; toolUsed: boolean }) => void;
  onClose: (reason: { kind: 'error' | 'closed'; message: string }) => void;
  /** The project as the model should know it; resent between turns when `key` (the revision) changes. */
  context: () => { key: string; text: string } | null;
}

export interface LiveHandle {
  readonly model: string;
  readonly voice: string;
  /** Whether the assistant's voice is removed from the microphone (full duplex). */
  readonly echoCancelled: boolean;
  pause(): void;
  resume(): void;
  close(): void;
}

export class LiveUnavailable extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LiveUnavailable';
  }
}

interface SessionLike {
  sendRealtimeInput(p: { audio?: { data: string; mimeType: string }; audioStreamEnd?: boolean }): void;
  sendToolResponse(p: { functionResponses: { id?: string; name?: string; response?: Record<string, unknown> }[] }): void;
  sendClientContent(p: { turns: { role: string; parts: { text: string }[] }[]; turnComplete: boolean }): void;
  close(): void;
}

/** The subset of a Live server message this session reads. */
export interface LiveMessage {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    interimInputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
  goAway?: { timeLeft?: string };
}

export type Connect = (token: string, model: string, config: Record<string, unknown>, handlers: { onmessage: (m: LiveMessage) => void; onclose: (e: { code: number; reason: string }) => void; onerror: (e: { message?: string }) => void }) => Promise<SessionLike>;

/** Connects with the official SDK (loaded lazily). */
const sdkConnect: Connect = async (token, model, config, handlers) => {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
  return ai.live.connect({
    model,
    config: config as never,
    callbacks: { onmessage: (m) => handlers.onmessage(m as LiveMessage), onclose: (e) => handlers.onclose(e), onerror: (e) => handlers.onerror(e) },
  }) as unknown as Promise<SessionLike>;
};

export interface LiveDeps {
  fetchImpl?: typeof fetch;
  connect?: Connect;
  openMic?: typeof openMicrophone;
  createPlayer?: () => Pick<PcmPlayer, 'echoCancelled' | 'onIdle' | 'playing' | 'enqueue' | 'flush' | 'suspend' | 'resume' | 'close' | 'start'>;
}

/**
 * Starts a session. Call from a click handler: the audio output is created synchronously so the
 * browser allows it to play. Throws `LiveUnavailable` when the server cannot issue a token.
 */
export async function startLiveSession(voice: string, cb: LiveCallbacks, deps: LiveDeps = {}): Promise<LiveHandle> {
  const player = (deps.createPlayer ?? (() => new PcmPlayer()))();
  let mic: MicCapture | null = null;
  let session: SessionLike | null = null;
  let closed = false;
  let held = false;
  // Final transcription segments are appended; the interim one is the current guess for the rest.
  let userFinal = '';
  let userInterim = '';
  const userSaid = () => `${userFinal}${userInterim}`.replace(/\s+/g, ' ').trim();
  // A tool repair round is a new model turn without new speech: it still answers the same words.
  let lastUserText = '';
  const userWords = () => userSaid() || lastUserText;
  let modelText = '';
  /** A non-inspection tool ran since the designer last spoke (that exchange is already in the chat). */
  let toolUsed = false;
  let toolsRunning = 0;
  let phase: LivePhase = 'connecting';
  let resumeHandle: string | null = null;
  let reconnecting = false;
  let contextKey: string | null = null;
  /** Tells the model the current project without asking it to answer (between turns only). */
  const sendContext = () => {
    const ctx = cb.context();
    if (!ctx || ctx.key === contextKey || !session) return;
    contextKey = ctx.key;
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: ctx.text }] }], turnComplete: false });
  };
  const setPhase = (p: LivePhase) => {
    if (p !== phase) cb.onPhase((phase = p));
  };

  const shutdown = () => {
    if (closed) return;
    closed = true;
    mic?.close();
    player.close();
    try {
      session?.close();
    } catch {
      // Already closed.
    }
  };
  const fail = (message: string) => {
    if (closed) return;
    shutdown();
    cb.onClose({ kind: 'error', message });
  };

  try {
    cb.onPhase('connecting');
    const res = await (deps.fetchImpl ?? fetch)('/api/live-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice }) });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: { code?: string; message?: string } } | null;
    const token = LiveTokenSchema.safeParse(body);
    if (!res.ok || !token.success) throw new LiveUnavailable(body?.error?.message ?? `Realtime voice is not available (HTTP ${res.status}).`, body?.error?.code ?? 'unavailable');
    const { model } = token.data;
    const config = liveConfig(token.data.voice) as Record<string, unknown>;

    const onmessage = (m: LiveMessage) => {
      if (closed) return;
      if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) resumeHandle = m.sessionResumptionUpdate.newHandle;
      if (m.goAway) void reconnect();
      const sc = m.serverContent;
      if (sc) {
        if (sc.interrupted) {
          // The designer talked over the reply: stop it now.
          player.flush();
          setPhase('listening');
        }
        // A new utterance starts a new exchange.
        if ((sc.inputTranscription?.text || sc.interimInputTranscription?.text) && !userFinal && !userInterim) toolUsed = false;
        if (sc.inputTranscription?.text) {
          userFinal += sc.inputTranscription.text;
          userInterim = '';
        } else if (sc.interimInputTranscription?.text) userInterim = sc.interimInputTranscription.text;
        if (sc.inputTranscription?.text || sc.interimInputTranscription?.text) {
          cb.onUserSpeech(userSaid());
          if (phase !== 'speaking') setPhase('listening');
        }
        for (const part of sc.modelTurn?.parts ?? []) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
            player.enqueue(part.inlineData.data);
            setPhase('speaking');
          }
        }
        if (sc.outputTranscription?.text) {
          modelText += sc.outputTranscription.text;
          cb.onModelSpeech(modelText.trim());
        }
        if (sc.turnComplete && (userSaid() || modelText.trim())) {
          if (userSaid()) lastUserText = userSaid();
          cb.onTurnComplete({ userText: userWords(), modelText: modelText.trim(), toolUsed });
          userFinal = '';
          userInterim = '';
          modelText = '';
          sendContext();
          // The turn is over on the server, but its audio may still be playing here.
          setPhase(player.playing ? 'speaking' : 'listening');
        }
      }
      if (m.toolCall?.functionCalls?.length) void runTools(m.toolCall.functionCalls);
    };

    const runTools = async (calls: { id?: string; name?: string; args?: unknown }[]) => {
      setPhase('thinking');
      toolsRunning++;
      const responses = [];
      for (const c of calls) {
        const result = await cb.onToolCall({ id: c.id ?? '', name: c.name ?? '', args: c.args ?? {} }, { userText: userWords() });
        if (!['list_objects', 'get_object', 'get_walls', 'get_issues'].includes(c.name ?? '')) toolUsed = true;
        responses.push({ id: c.id, name: c.name, response: 'error' in result ? { error: result.error } : { output: result.output } });
      }
      toolsRunning--;
      if (!closed) session?.sendToolResponse({ functionResponses: responses });
    };

    const handlers = {
      onmessage,
      onerror: (e: { message?: string }) => fail(`The realtime connection failed${e.message ? `: ${e.message}` : ''}.`),
      onclose: (e: { code: number; reason: string }) => {
        if (closed || reconnecting) return;
        fail(e.code === 1000 ? 'The realtime session ended.' : `The realtime session closed (${e.reason || e.code}).`);
      },
    };

    // Long conversations: when Google asks the client to reconnect, resume the same session.
    const reconnect = async () => {
      if (reconnecting || closed || !resumeHandle) return;
      reconnecting = true;
      const old = session;
      try {
        session = await (deps.connect ?? sdkConnect)(token.data.token, model, { ...config, sessionResumption: { handle: resumeHandle } }, handlers);
        old?.close();
      } catch {
        fail('The realtime session could not be resumed.');
      } finally {
        reconnecting = false;
      }
    };

    await player.start();
    session = await (deps.connect ?? sdkConnect)(token.data.token, model, config, handlers);
    sendContext();
    mic = await (deps.openMic ?? openMicrophone)((data) => {
      if (closed || held || !session) return;
      // Without echo cancellation, the microphone is muted while the assistant speaks (no barge-in by voice).
      if (!player.echoCancelled && player.playing) return;
      session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } });
    });
    player.onIdle = () => {
      if (!closed && (phase === 'speaking' || (phase === 'thinking' && !toolsRunning))) setPhase('listening');
    };
    setPhase('listening');

    return {
      model,
      voice: token.data.voice,
      get echoCancelled() {
        return player.echoCancelled;
      },
      pause: () => {
        held = true;
        player.flush();
        void player.suspend();
        session?.sendRealtimeInput({ audioStreamEnd: true });
      },
      resume: () => {
        held = false;
        void player.resume();
        setPhase('listening');
      },
      close: shutdown,
    };
  } catch (e) {
    shutdown();
    if (e instanceof LiveUnavailable) throw e;
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new LiveUnavailable('Microphone access is blocked. Allow the microphone for this site, or type instead.', 'permission-denied');
    if (name === 'NotFoundError') throw new LiveUnavailable('No microphone was found. Connect one, or type instead.', 'no-microphone');
    throw new LiveUnavailable(`Realtime voice could not start (${e instanceof Error ? e.message : 'unknown error'}).`, 'error');
  }
}
