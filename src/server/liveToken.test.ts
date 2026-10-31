// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ProviderError } from '@/ai/providers/types';
import { LIVE_MODEL, LIVE_TOOLS, liveConfig } from '@/ai/live';
import { createLiveTokenHandler, tokenMinter } from './liveToken';

const post = (b: unknown, headers: Record<string, string> = {}) => new Request('http://localhost:5173/api/live-token', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b) });
const quiet = () => undefined;
const mint = async (voice: string) => ({ token: 'auth_tokens/abc', model: LIVE_MODEL, voice, expiresAt: '2026-10-31T12:00:00.000Z' });

describe('/api/live-token', () => {
  it('returns a token for a listed Gemini voice and never the key', async () => {
    const res = await createLiveTokenHandler({ env: { GEMINI_API_KEY: 'secret-key' }, log: quiet, mint })(post({ voice: 'Puck' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('secret-key');
    expect(JSON.parse(text)).toEqual({ ok: true, token: 'auth_tokens/abc', model: LIVE_MODEL, voice: 'Puck', expiresAt: '2026-10-31T12:00:00.000Z' });
    expect(await (await createLiveTokenHandler({ env: {}, log: quiet, mint })(post({}))).json()).toMatchObject({ voice: 'Kore' });
  });

  it('rejects unknown voices, other origins and non-POST; says when the key is missing', async () => {
    const handler = createLiveTokenHandler({ env: {}, log: quiet, mint });
    expect((await handler(post({ voice: 'marin' }))).status).toBe(400);
    expect((await handler(post({ voice: 'Kore', extra: 1 }))).status).toBe(400);
    expect((await handler(post({}, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(new Request('http://localhost/api/live-token'))).status).toBe(405);
    const missing = await createLiveTokenHandler({ env: {}, log: quiet })(post({}));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: 'unavailable', message: expect.stringContaining('GEMINI_API_KEY') } });
    const limited = await createLiveTokenHandler({ env: {}, log: quiet, mint: () => Promise.reject(new ProviderError('rate_limited', 'slow', true, 4)) })(post({}));
    expect(limited.status).toBe(429);
  });

  it('locks the model, instructions, tools and voice into the token', async () => {
    const requests: Record<string, unknown>[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = input instanceof Request ? await input.text() : String(init?.body ?? '');
      requests.push({ url: input instanceof Request ? input.url : String(input), body: JSON.parse(body) });
      return new Response(JSON.stringify({ name: 'auth_tokens/xyz' }), { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const token = await tokenMinter({ GEMINI_API_KEY: 'k' }, fetchImpl)('Aoede');
    expect(token).toMatchObject({ token: 'auth_tokens/xyz', model: LIVE_MODEL, voice: 'Aoede' });
    expect(String(requests[0]!.url)).toContain('v1alpha/auth_tokens');
    const sent = JSON.stringify(requests[0]!.body);
    expect(sent).toContain(LIVE_MODEL);
    expect(sent).toContain('Aoede');
    expect(sent).toContain('apply_pending_change');
    expect(sent).toContain('"uses":1');
  });

  it('offers the chat tools plus the voice approval tools', () => {
    expect(LIVE_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(['list_objects', 'propose_changes', 'plan_layout', 'apply_pending_change', 'reject_pending_change', 'choose_layout_option', 'end_conversation']));
    expect(liveConfig('Kore')).toMatchObject({ responseModalities: ['AUDIO'], inputAudioTranscription: {}, outputAudioTranscription: {}, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } });
  });
});
