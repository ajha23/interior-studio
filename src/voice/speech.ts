/**
 * Provider-neutral speech recognition. The browser adapter wraps the Web Speech API
 * (`SpeechRecognition`, `webkitSpeechRecognition` in Chrome/Edge/Safari) behind
 * `SpeechToTextProvider`; a cloud provider can implement the same interface later.
 *
 * Privacy: the app never records or stores audio. Recognition happens inside the browser's own
 * speech service — Chrome and Edge send the audio to their vendor's servers, Safari uses Apple's
 * service (on-device where available). `recognitionNotice()` says which, for the UI.
 */

export type SpeechErrorCode = 'permission-denied' | 'no-microphone' | 'no-speech' | 'network' | 'unsupported-language' | 'unsupported' | 'aborted' | 'timeout' | 'unknown';

export class SpeechError extends Error {
  constructor(
    readonly code: SpeechErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SpeechError';
  }
}

export interface SpeechResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface SpeechStartOptions {
  /** BCP 47 language tag, e.g. "en-GB". */
  language: string;
  onResult: (result: SpeechResult) => void;
  onError: (error: SpeechError) => void;
  /** Recognition has the microphone and is listening. */
  onStart?: () => void;
  /** The session is over (after a final result, stop, cancel or error). Always called once. */
  onEnd: () => void;
}

export interface SpeechToTextProvider {
  readonly id: string;
  /** Where audio goes, in one sentence for the UI. */
  readonly notice: string;
  start(options: SpeechStartOptions): Promise<void>;
  /** Stop listening and deliver any final result. */
  stop(): Promise<void>;
  /** Stop listening and discard everything. */
  cancel(): Promise<void>;
}

export const SPEECH_MESSAGES: Record<SpeechErrorCode, string> = {
  'permission-denied': 'Microphone access is blocked. Allow the microphone for this site (the icon in the address bar), or type your request instead.',
  'no-microphone': 'No microphone was found. Connect one, or type your request instead.',
  'no-speech': "I didn't hear anything. Press the microphone and try again.",
  network: 'Speech recognition needs a network connection in this browser. Check the connection, or type instead.',
  'unsupported-language': 'Speech recognition does not support the selected language in this browser.',
  unsupported: 'Voice input is not supported in this browser. Type your request instead (Chrome, Edge and Safari support voice).',
  aborted: 'Listening was cancelled.',
  timeout: 'Listening timed out. Press the microphone and try again.',
  unknown: 'Voice input failed. Type your request instead, or try again.',
};

/** Maps Web Speech API error codes to ours. */
export function speechErrorFromBrowser(code: string): SpeechError {
  const mapped: SpeechErrorCode =
    code === 'not-allowed' || code === 'service-not-allowed' ? 'permission-denied'
    : code === 'audio-capture' ? 'no-microphone'
    : code === 'no-speech' ? 'no-speech'
    : code === 'network' ? 'network'
    : code === 'language-not-supported' ? 'unsupported-language'
    : code === 'aborted' ? 'aborted'
    : 'unknown';
  return new SpeechError(mapped, SPEECH_MESSAGES[mapped]);
}

/** The part of the (not yet standard everywhere) recognition object this adapter uses. */
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => BrowserRecognition;

/** The browser's recognition constructor, if any. */
export function browserRecognition(scope: unknown = globalThis): RecognitionCtor | null {
  const w = scope as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

export function recognitionNotice(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge sends your speech to Microsoft’s speech service to turn it into text. Audio is not stored by Interior Studio.';
  if (/Chrome\//.test(userAgent)) return 'Chrome sends your speech to Google’s speech service to turn it into text. Audio is not stored by Interior Studio.';
  if (/Safari\//.test(userAgent)) return 'Safari turns your speech into text with Apple’s speech service. Audio is not stored by Interior Studio.';
  return 'Your browser’s speech service turns your speech into text. Audio is not stored by Interior Studio.';
}

/**
 * One utterance per session (not continuous), with interim results for live transcription. The
 * browser asks for microphone permission on the first `start()`, which always follows a click.
 */
export class BrowserSpeechProvider implements SpeechToTextProvider {
  readonly id = 'browser';
  readonly notice: string;
  private recognition: BrowserRecognition | null = null;
  private cancelled = false;

  constructor(
    private readonly Ctor: RecognitionCtor,
    userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  ) {
    this.notice = recognitionNotice(userAgent);
  }

  async start(options: SpeechStartOptions): Promise<void> {
    await this.cancel();
    const r = new this.Ctor();
    this.recognition = r;
    this.cancelled = false;
    r.lang = options.language;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (this.recognition === r) this.recognition = null;
      options.onEnd();
    };
    r.onstart = () => options.onStart?.();
    r.onresult = (event: SpeechRecognitionEvent) => {
      if (this.cancelled) return;
      // Report the whole utterance so far; it is final once every segment is.
      let text = '';
      let final = true;
      let confidence: number | undefined;
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i]!;
        text += res[0]?.transcript ?? '';
        final &&= res.isFinal;
        if (res.isFinal) confidence = res[0]?.confidence;
      }
      options.onResult({ transcript: text.trim(), isFinal: final, confidence });
    };
    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (this.cancelled && event.error === 'aborted') return;
      options.onError(speechErrorFromBrowser(event.error));
    };
    r.onend = end;
    try {
      r.start();
    } catch (e) {
      this.recognition = null;
      ended = true;
      throw new SpeechError('unknown', e instanceof Error ? e.message : SPEECH_MESSAGES.unknown);
    }
  }

  async stop(): Promise<void> {
    this.recognition?.stop();
  }

  async cancel(): Promise<void> {
    if (!this.recognition) return;
    this.cancelled = true;
    this.recognition.abort();
  }
}

/** The browser provider when the API exists, otherwise null (text-only operation). */
export function createSpeechProvider(scope: unknown = globalThis): SpeechToTextProvider | null {
  const Ctor = browserRecognition(scope);
  return Ctor ? new BrowserSpeechProvider(Ctor) : null;
}
