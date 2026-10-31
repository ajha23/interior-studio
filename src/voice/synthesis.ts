/**
 * Spoken feedback through the browser's `speechSynthesis`, behind a small interface. Only short
 * status lines are spoken (what was heard, preview ready, the reason a change failed, applied);
 * never tables or whole projects. Nothing is sent anywhere by the app itself.
 */
export interface TextToSpeech {
  readonly supported: boolean;
  speak(text: string, options?: { language?: string; onEnd?: () => void }): void;
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

  speak(text: string, options: { language?: string; onEnd?: () => void } = {}): void {
    if (!this.supported) {
      options.onEnd?.();
      return;
    }
    this.synth!.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 300));
    if (options.language) u.lang = options.language;
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
