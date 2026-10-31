import { describe, expect, it } from 'vitest';
import { BrowserTextToSpeech, RemoteTextToSpeech, type AudioPlayer, type SpeakOptions, type TextToSpeech } from './synthesis';
import { DEFAULT_REPLY_VOICE, parseReplyVoice, REMOTE_VOICES, SpeechRequestSchema, type ReplyVoice } from './voices';

describe('reply voices', () => {
  it('lists Gemini and ChatGPT voices and defaults to a Gemini voice', () => {
    expect(REMOTE_VOICES.gemini.voices).toHaveLength(30);
    expect(REMOTE_VOICES.openai.voices).toHaveLength(10);
    expect(DEFAULT_REPLY_VOICE).toEqual({ engine: 'gemini', voice: 'Kore' });
    expect(SpeechRequestSchema.safeParse({ text: 'Hi', engine: 'openai', voice: 'marin' }).success).toBe(true);
    expect(SpeechRequestSchema.safeParse({ text: 'Hi', engine: 'openai', voice: 'Kore' }).success).toBe(false);
  });

  it('reads saved choices, dropping unknown engines and voices', () => {
    expect(parseReplyVoice(undefined)).toEqual(DEFAULT_REPLY_VOICE);
    expect(parseReplyVoice({ engine: 'openai', voice: 'cedar' })).toEqual({ engine: 'openai', voice: 'cedar' });
    expect(parseReplyVoice({ engine: 'openai', voice: 'Kore' })).toEqual({ engine: 'openai', voice: 'marin' });
    expect(parseReplyVoice({ engine: 'browser', voice: 'Samantha' })).toEqual({ engine: 'browser', voice: 'Samantha' });
    expect(parseReplyVoice({ engine: 'siri' })).toEqual(DEFAULT_REPLY_VOICE);
  });
});

/** A browser voice that records what it was asked to say and finishes at once. */
function recorder(): TextToSpeech & { said: [string, SpeakOptions][] } {
  const said: [string, SpeakOptions][] = [];
  return { said, supported: true, speaking: false, speak: (t, o = {}) => (said.push([t, o]), o.onEnd?.()), stop: () => undefined };
}

function setup(choice: ReplyVoice, respond: () => Response | Promise<Response>, autoplay = true) {
  const fallback = recorder();
  const requests: Record<string, unknown>[] = [];
  const played: string[] = [];
  const notices: string[] = [];
  let player: AudioPlayer | null = null;
  const tts = new RemoteTextToSpeech({
    choice: () => choice,
    fallback,
    onFallback: (m) => notices.push(m),
    fetchImpl: (async (_u: string, init: RequestInit) => (requests.push(JSON.parse(String(init.body)) as Record<string, unknown>), respond())) as unknown as typeof fetch,
    createUrl: () => `blob:${requests.length}`,
    revokeUrl: () => undefined,
    createPlayer: (url) => {
      player = { onended: null, onerror: null, pause: () => undefined, play: () => (played.push(url), autoplay ? Promise.resolve() : Promise.reject(new Error('NotAllowedError'))) };
      return player;
    },
  });
  return { tts, fallback, requests, played, notices, end: () => player?.onended?.() };
}
const wav = () => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'content-type': 'audio/wav' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('server reply voices', () => {
  it('plays the server clip, reports the end, and replays repeated lines from the cache', async () => {
    const s = setup({ engine: 'gemini', voice: 'Puck' }, wav);
    let ended = 0;
    s.tts.speak('Applied.', { language: 'en-GB', onEnd: () => ended++ });
    await flush();
    expect(s.requests).toEqual([{ text: 'Applied.', engine: 'gemini', voice: 'Puck', language: 'en-GB' }]);
    expect(s.played).toHaveLength(1);
    expect(s.tts.speaking).toBe(true);
    s.end();
    expect(ended).toBe(1);
    expect(s.tts.speaking).toBe(false);
    s.tts.speak('Applied.', { language: 'en-GB' });
    await flush();
    expect(s.requests).toHaveLength(1);
    expect(s.played).toHaveLength(2);
    expect(s.fallback.said).toHaveLength(0);
  });

  it('falls back to the browser voice with the reason when the server cannot speak', async () => {
    const s = setup({ engine: 'openai', voice: 'marin' }, () => new Response(JSON.stringify({ ok: false, error: { message: 'ChatGPT voices are not configured on this server (set OPENAI_API_KEY).' } }), { status: 503, headers: { 'content-type': 'application/json' } }));
    let ended = 0;
    s.tts.speak('Preview ready.', { onEnd: () => ended++ });
    await flush();
    await flush();
    expect(s.fallback.said.map(([t]) => t)).toEqual(['Preview ready.']);
    expect(s.notices[0]).toContain('OPENAI_API_KEY');
    expect(ended).toBe(1);
  });

  it('uses the browser voice when autoplay is blocked, and the chosen browser voice directly', async () => {
    const blocked = setup({ engine: 'gemini', voice: 'Kore' }, wav, false);
    blocked.tts.speak('Applied.');
    await flush();
    await flush();
    expect(blocked.fallback.said.map(([t]) => t)).toEqual(['Applied.']);

    const local = setup({ engine: 'browser', voice: 'Samantha' }, wav);
    local.tts.speak('Applied.', { language: 'en-US' });
    expect(local.requests).toHaveLength(0);
    expect(local.fallback.said[0]).toEqual(['Applied.', expect.objectContaining({ voiceName: 'Samantha', language: 'en-US' })]);
  });

  it('a newer line or stop() cancels a clip that is still loading', async () => {
    let release!: (r: Response) => void;
    const s = setup({ engine: 'gemini', voice: 'Kore' }, () => new Promise<Response>((r) => (release = r)));
    s.tts.speak('First.');
    s.tts.stop();
    release(wav());
    await flush();
    await flush();
    expect(s.played).toHaveLength(0);
    expect(s.fallback.said).toHaveLength(0);
  });

  it('the browser engine picks the named browser voice', () => {
    const voices = [{ name: 'Daniel', lang: 'en-GB' }, { name: 'Samantha', lang: 'en-US' }] as SpeechSynthesisVoice[];
    const spoken: SpeechSynthesisUtterance[] = [];
    const synth = { getVoices: () => voices, cancel: () => undefined, speak: (u: SpeechSynthesisUtterance) => spoken.push(u), speaking: false } as unknown as SpeechSynthesis;
    const tts = new BrowserTextToSpeech(synth);
    expect(tts.voices('en-GB').map((v) => v.name)).toEqual(['Daniel']);
    expect(tts.voices('en-IN').map((v) => v.name)).toEqual(['Daniel', 'Samantha']);
    if (typeof SpeechSynthesisUtterance === 'undefined') return;
    tts.speak('Hi', { voiceName: 'Samantha' });
    expect(spoken[0]!.voice?.name).toBe('Samantha');
  });
});
