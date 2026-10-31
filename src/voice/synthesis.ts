/**
 * Spoken feedback behind a small interface. Only short status lines are spoken (what was heard,
 * preview ready, the reason a change failed, applied); never tables or whole projects.
 * `BrowserTextToSpeech` uses the browser's own voices and sends nothing anywhere;
 * `RemoteTextToSpeech` plays Gemini or ChatGPT voices from `/api/speech` and falls back to the
 * browser's voices when that fails.
 */
import { SPEECH_MAX_CHARS, type ReplyVoice } from './voices';

export interface SpeakOptions {
  language?: string;
  /** A browser voice name; ignored when the browser has no such voice. */
  voiceName?: string;
  onEnd?: () => void;
}

export interface TextToSpeech {
  readonly supported: boolean;
  speak(text: string, options?: SpeakOptions): void;
  stop(): void;
  readonly speaking: boolean;
}

export class BrowserTextToSpeech implements TextToSpeech {
  constructor(private readonly synth: SpeechSynthesis | undefined = typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis) {}

  get supported(): boolean {
    return this.synth !== undefined && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  get speaking(): boolean {
    return this.synth?.speaking ?? false;
  }

  /** The browser's voices for a language (all English voices when none match exactly). */
  voices(language?: string): SpeechSynthesisVoice[] {
    const all = this.synth?.getVoices?.() ?? [];
    const exact = language ? all.filter((v) => v.lang.replace('_', '-') === language) : [];
    return exact.length ? exact : all.filter((v) => v.lang.startsWith('en'));
  }

  speak(text: string, options: SpeakOptions = {}): void {
    if (!this.supported) {
      options.onEnd?.();
      return;
    }
    this.synth!.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, SPEECH_MAX_CHARS));
    if (options.language) u.lang = options.language;
    const voice = options.voiceName ? this.synth!.getVoices?.().find((v) => v.name === options.voiceName) : undefined;
    if (voice) u.voice = voice;
    u.rate = 1.05;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      options.onEnd?.();
    };
    u.onend = end;
    u.onerror = end;
    this.synth!.speak(u);
  }

  stop(): void {
    this.synth?.cancel();
  }
}

/** A silent stand-in for browsers (and tests) without speech synthesis. */
export const SILENT_SPEECH: TextToSpeech = { supported: false, speaking: false, speak: (_t, o) => o?.onEnd?.(), stop: () => undefined };

/** The parts of an audio element the remote voice needs (tests pass a fake). */
export interface AudioPlayer {
  play(): Promise<void>;
  pause(): void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

export interface RemoteSpeechDeps {
  /** The current reply voice. */
  choice: () => ReplyVoice;
  /** Browser voices: used for the "browser" choice and whenever the server cannot speak. */
  fallback: BrowserTextToSpeech | TextToSpeech;
  /** Called when a server voice failed and the browser's voice spoke instead. */
  onFallback?: (message: string) => void;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  createPlayer?: (url: string) => AudioPlayer;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

/**
 * Gemini or ChatGPT voices, synthesised on the server. Recent clips are cached, so repeated lines
 * ("Applied.") play at once. A failed request falls back to the browser's voice for that line.
 */
export class RemoteTextToSpeech implements TextToSpeech {
  private player: AudioPlayer | null = null;
  private url: string | null = null;
  private abort: AbortController | null = null;
  private turn = 0;
  private playing = false;
  private readonly cache = new Map<string, Blob>();

  constructor(private readonly deps: RemoteSpeechDeps) {}

  get supported(): boolean {
    return this.deps.choice().engine === 'browser' ? this.deps.fallback.supported : true;
  }

  get speaking(): boolean {
    return this.playing || this.deps.fallback.speaking;
  }

  speak(text: string, options: SpeakOptions = {}): void {
    this.stop();
    const choice = this.deps.choice();
    if (choice.engine === 'browser') {
      this.deps.fallback.speak(text, { ...options, voiceName: choice.voice || undefined });
      return;
    }
    const turn = this.turn;
    const line = text.slice(0, SPEECH_MAX_CHARS);
    void this.fetchClip(line, choice, options.language).then(
      (blob) => {
        if (turn !== this.turn) return;
        this.play(blob, options.onEnd, () => this.deps.fallback.speak(line, options));
      },
      (e: unknown) => {
        if (turn !== this.turn) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        this.deps.onFallback?.(e instanceof Error ? e.message : 'The voice could not be loaded.');
        this.deps.fallback.speak(line, options);
      },
    );
  }

  stop(): void {
    this.turn++;
    this.abort?.abort();
    this.abort = null;
    this.player?.pause();
    this.release();
    this.deps.fallback.stop();
  }

  private async fetchClip(text: string, choice: ReplyVoice, language?: string): Promise<Blob> {
    const key = `${choice.engine}|${choice.voice}|${language ?? ''}|${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    this.abort = new AbortController();
    const res = await (this.deps.fetchImpl ?? fetch)(this.deps.endpoint ?? '/api/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, engine: choice.engine, voice: choice.voice, ...(language ? { language } : {}) }),
      signal: this.abort.signal,
    });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio/')) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? `The voice service is not available (HTTP ${res.status}).`);
    }
    const blob = await res.blob();
    this.cache.set(key, blob);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
    return blob;
  }

  private play(blob: Blob, onEnd: (() => void) | undefined, onFail: () => void): void {
    this.url = (this.deps.createUrl ?? URL.createObjectURL)(blob);
    const player = (this.deps.createPlayer ?? ((url) => new Audio(url) as unknown as AudioPlayer))(this.url);
    this.player = player;
    this.playing = true;
    const turn = this.turn;
    const done = () => {
      if (turn !== this.turn) return;
      this.release();
      onEnd?.();
    };
    player.onended = done;
    player.onerror = done;
    // Autoplay can be blocked until the page has been interacted with: say it with the browser instead.
    player.play().catch(() => {
      if (turn !== this.turn) return;
      this.release();
      onFail();
    });
  }

  private release(): void {
    this.playing = false;
    this.player = null;
    if (this.url) (this.deps.revokeUrl ?? URL.revokeObjectURL)(this.url);
    this.url = null;
  }
}
