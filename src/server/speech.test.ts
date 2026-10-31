// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ProviderError } from '@/ai/providers/types';
import { createSpeechHandler, pcmToWav, synthesizer } from './speech';

const post = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost:5173/api/speech', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b) });
const quiet = () => undefined;
const line = { text: 'Applied.', engine: 'gemini', voice: 'Kore', language: 'en-GB' };
const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

/** Records each request (URL and JSON body, whether the SDK passes a Request or a URL) and answers in order. */
function fakeApi(responses: { status?: number; body: unknown }[]) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const text = input instanceof Request ? await input.text() : String(init?.body ?? '{}');
    requests.push({ url, body: JSON.parse(text || '{}') as Record<string, unknown> });
    const next = responses.shift() ?? { status: 500, body: { error: { message: 'no more' } } };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe('/api/speech', () => {
  it('returns audio for a listed voice and logs no text', async () => {
    const logs: Record<string, unknown>[] = [];
    const handler = createSpeechHandler({ env: {}, log: (e) => logs.push(e), synthesize: async () => ({ data: new Uint8Array([1, 2, 3]), mimeType: 'audio/wav' }) });
    const res = await handler(post(line));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(logs[0]).toMatchObject({ status: 200, engine: 'gemini', voice: 'Kore', chars: 8 });
    expect(JSON.stringify(logs)).not.toContain('Applied');
  });

  it('rejects unlisted voices, long text, other origins and non-POST requests', async () => {
    const handler = createSpeechHandler({ env: {}, log: quiet, synthesize: async () => ({ data: new Uint8Array(), mimeType: 'audio/wav' }) });
    expect((await handler(post({ ...line, voice: 'Darth' }))).status).toBe(400);
    expect((await handler(post({ ...line, engine: 'openai' }))).status).toBe(400);
    expect((await handler(post({ ...line, text: 'x'.repeat(301) }))).status).toBe(400);
    expect((await handler(post(line, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(new Request('http://localhost/api/speech'))).status).toBe(405);
  });

  it('says which key is missing and maps provider failures', async () => {
    const missing = await createSpeechHandler({ env: {}, log: quiet })(post({ ...line, engine: 'openai', voice: 'marin' }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: 'unavailable', message: expect.stringContaining('OPENAI_API_KEY') } });
    const limited = await createSpeechHandler({ env: {}, log: quiet, synthesize: () => Promise.reject(new ProviderError('rate_limited', 'slow', true, 7)) })(post(line));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('7');
  });
});

describe('speech synthesis', () => {
  const signal = new AbortController().signal;

  it('asks Gemini for the chosen voice and returns its WAV', async () => {
    const api = fakeApi([{ body: { id: 'i1', object: 'interaction', status: 'completed', model: 'gemini-3.8-flash-tts', steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: b64([82, 73, 70, 70]) }] }] } }]);
    const audio = await synthesizer({ GEMINI_API_KEY: 'g-test' }, 5_000, api.fetchImpl)({ text: 'Applied.', engine: 'gemini', voice: 'Puck', language: 'en-GB' }, signal);
    expect(audio).toEqual({ data: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav' });
    expect(api.requests[0]!.url).toContain('interactions');
    expect(api.requests[0]!.body).toMatchObject({ model: 'gemini-3.8-flash-tts', response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: 'Puck', language: 'en-GB' }] } });
    expect(JSON.stringify(api.requests[0]!.body.input)).toContain('Applied.');
  });

  it('wraps raw PCM from Gemini in a WAV header', async () => {
    const api = fakeApi([{ body: { id: 'i1', object: 'interaction', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/l16', sample_rate: 24000, data: b64([0, 0, 1, 0]) }] }] } }]);
    const audio = await synthesizer({ GOOGLE_API_KEY: 'g-test' }, 5_000, api.fetchImpl)({ text: 'Hi', engine: 'gemini', voice: 'Kore' }, signal);
    expect(audio.mimeType).toBe('audio/wav');
    expect(new TextDecoder().decode(audio.data.slice(0, 4))).toBe('RIFF');
    expect(audio.data.length).toBe(48);
  });

  it('asks OpenAI to read the line verbatim in the chosen voice', async () => {
    const api = fakeApi([{ body: { id: 'c1', object: 'chat.completion', created: 0, model: 'gpt-audio-1.5', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null, audio: { id: 'a1', data: b64([9, 9]), transcript: 'Applied.', expires_at: 0 } } }] } }]);
    const audio = await synthesizer({ OPENAI_API_KEY: 'o-test' }, 5_000, api.fetchImpl)({ text: 'Applied.', engine: 'openai', voice: 'cedar', language: 'en-IN' }, signal);
    expect(audio).toEqual({ data: new Uint8Array([9, 9]), mimeType: 'audio/wav' });
    expect(api.requests[0]!.body).toMatchObject({ model: 'gpt-audio-1.5', modalities: ['text', 'audio'], audio: { voice: 'cedar', format: 'wav' }, store: false });
    expect(JSON.stringify(api.requests[0]!.body.messages)).toMatch(/exactly as written.*Indian English accent/);
  });

  it('maps a Gemini quota error', async () => {
    const api = fakeApi([{ status: 429, body: { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } } }]);
    await expect(synthesizer({ GEMINI_API_KEY: 'g' }, 5_000, api.fetchImpl)({ text: 'Hi', engine: 'gemini', voice: 'Kore' }, signal)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('builds a valid WAV header', () => {
    const wav = new DataView(pcmToWav(new Uint8Array(100), 24_000).buffer);
    expect(wav.getUint32(24, true)).toBe(24_000);
    expect(wav.getUint32(40, true)).toBe(100);
    expect(wav.getUint16(34, true)).toBe(16);
  });
});
