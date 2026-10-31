import { describe, expect, it } from 'vitest';
import { BrowserSpeechProvider, browserRecognition, recognitionNotice, speechErrorFromBrowser, type BrowserRecognition, type SpeechResult } from './speech';
import { BrowserTextToSpeech } from './synthesis';

/** A stand-in for the browser's recognition object, driven by the test. */
class MockRecognition implements BrowserRecognition {
  static last: MockRecognition | null = null;
  lang = '';
  continuous = true;
  interimResults = false;
  maxAlternatives = 5;
  onstart: ((ev: Event) => void) | null = null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: ((ev: Event) => void) | null = null;
  started = false;
  aborted = false;
  constructor() {
    MockRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.(new Event('end'));
  }
  abort() {
    this.aborted = true;
    this.onerror?.({ error: 'aborted' } as SpeechRecognitionErrorEvent);
    this.onend?.(new Event('end'));
  }
  emit(segments: [string, boolean][]) {
    const results = segments.map(([t, f]) => Object.assign([{ transcript: t, confidence: 0.8 }], { isFinal: f }));
    this.onresult?.({ results } as unknown as SpeechRecognitionEvent);
  }
}

describe('browser speech recognition adapter', () => {
  it('feature-detects the standard and prefixed constructors', () => {
    expect(browserRecognition({})).toBeNull();
    expect(browserRecognition({ webkitSpeechRecognition: MockRecognition })).toBe(MockRecognition);
    expect(browserRecognition({ SpeechRecognition: MockRecognition, webkitSpeechRecognition: class {} })).toBe(MockRecognition);
  });

  it('listens for one utterance in the chosen language with live interim text', async () => {
    const results: SpeechResult[] = [];
    let ends = 0;
    const p = new BrowserSpeechProvider(MockRecognition, 'Chrome/140');
    await p.start({ language: 'en-GB', onResult: (r) => results.push(r), onError: () => undefined, onEnd: () => ends++ });
    const r = MockRecognition.last!;
    expect(r).toMatchObject({ lang: 'en-GB', continuous: false, interimResults: true, started: true });
    r.emit([['move the', false]]);
    r.emit([['move the sink ', true], ['left', false]]);
    r.emit([['move the sink ', true], ['left', true]]);
    r.onend?.(new Event('end'));
    r.onend?.(new Event('end'));
    expect(results).toEqual([
      { transcript: 'move the', isFinal: false, confidence: undefined },
      { transcript: 'move the sink left', isFinal: false, confidence: 0.8 },
      { transcript: 'move the sink left', isFinal: true, confidence: 0.8 },
    ]);
    expect(ends).toBe(1);
  });

  it('cancel aborts silently; errors are mapped to clear messages', async () => {
    const errors: string[] = [];
    const p = new BrowserSpeechProvider(MockRecognition);
    await p.start({ language: 'en-US', onResult: () => undefined, onError: (e) => errors.push(e.code), onEnd: () => undefined });
    await p.cancel();
    expect(MockRecognition.last!.aborted).toBe(true);
    expect(errors).toEqual([]);
    expect(speechErrorFromBrowser('not-allowed')).toMatchObject({ code: 'permission-denied', message: expect.stringMatching(/blocked/) });
    expect(speechErrorFromBrowser('audio-capture').code).toBe('no-microphone');
    expect(speechErrorFromBrowser('no-speech').code).toBe('no-speech');
    expect(speechErrorFromBrowser('network').code).toBe('network');
    expect(speechErrorFromBrowser('something-new').code).toBe('unknown');
  });

  it('says where speech is processed', () => {
    expect(recognitionNotice('Mozilla/5.0 Chrome/140.0 Safari/537.36')).toMatch(/Google/);
    expect(recognitionNotice('Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0')).toMatch(/Microsoft/);
    expect(recognitionNotice('Mozilla/5.0 Version/18.0 Safari/605.1.15')).toMatch(/Apple/);
  });

  it('speech synthesis is optional', () => {
    const silent = new BrowserTextToSpeech(undefined);
    let ended = false;
    silent.speak('hello', { onEnd: () => (ended = true) });
    expect(silent.supported).toBe(false);
    expect(ended).toBe(true);
  });
});
