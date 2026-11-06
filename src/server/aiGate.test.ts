// @vitest-environment node
// Spec 045, User Stories 1–2, through the real handlers: nobody reaches a provider without a signed-in,
// non-viewer member of a studio with credits; each endpoint charges its own op, only after its request
// is valid, and a provider failure is refunded. Fakes stand in for Supabase and the providers.
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRequest } from '@/ai/schema';
import { ProviderError, type AssistantProvider } from '@/ai/providers/types';
import { RuleBasedProvider } from '@/ai/providers/rules';
import { LIVE_MODEL } from '@/ai/live';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { createAssistantHandler } from './assistantHandler';
import { createLiveTokenHandler } from './liveToken';
import { createSpeechHandler } from './speech';
import { createReferenceHandler, createRenderHandler } from './vision';
import { AUTH_HEADERS, TEST_AI_ENV, fakeAiCall, type FakeAiCall } from './testAiCall';

const quiet = () => undefined;
const img = 'A'.repeat(400);
const project = createProject({ name: 'Gate', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
const assistantBody: AssistantRequest = {
  message: 'Create a 900 mm base cabinet',
  history: [],
  context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 3 },
  project,
};
const rules = new RuleBasedProvider();
/** A "paid" provider: the rules' answer under a real provider id, counting its calls. */
const paid = (counter: { n: number }, fail = false): AssistantProvider => ({
  id: 'gemini',
  model: 'gemini-test',
  respond: async (req, signal) => {
    counter.n++;
    if (fail) throw new ProviderError('timeout', 'too slow', true);
    return rules.respond(req, signal);
  },
});

type Endpoint = {
  name: string;
  op: string;
  path: string;
  valid: unknown;
  invalid: unknown;
  build: (gate: FakeAiCall, providerCalls: { n: number }, fail?: boolean) => (req: Request) => Promise<Response>;
};

const endpoints: Endpoint[] = [
  {
    name: 'assistant',
    op: 'assistant',
    path: '/api/assistant',
    valid: assistantBody,
    invalid: { message: '' },
    build: (gate, calls, fail) => createAssistantHandler({ aiCall: gate.deps, env: { ...TEST_AI_ENV }, provider: paid(calls, fail), log: quiet }),
  },
  {
    name: 'speech',
    op: 'speech',
    path: '/api/speech',
    valid: { text: 'Applied.', engine: 'gemini', voice: 'Kore', language: 'en-GB' },
    invalid: { text: '' },
    build: (gate, calls, fail) =>
      createSpeechHandler({
        aiCall: gate.deps,
        env: { ...TEST_AI_ENV },
        log: quiet,
        synthesize: async () => {
          calls.n++;
          if (fail) throw new ProviderError('timeout', 'too slow', true);
          return { data: new Uint8Array([1]), mimeType: 'audio/wav' };
        },
      }),
  },
  {
    name: 'reference',
    op: 'reference',
    path: '/api/reference',
    valid: { images: [img], kind: 'photo' },
    invalid: { images: [] },
    build: (gate, calls, fail) =>
      createReferenceHandler({
        aiCall: gate.deps,
        env: { ...TEST_AI_ENV },
        log: quiet,
        run: async () => {
          calls.n++;
          if (fail) throw new ProviderError('timeout', 'too slow', true);
          return {} as never;
        },
      }),
  },
  {
    name: 'render',
    op: 'render',
    path: '/api/render',
    valid: { image: img, mimeType: 'image/jpeg' },
    invalid: { image: img, mimeType: 'image/gif' },
    build: (gate, calls, fail) =>
      createRenderHandler({
        aiCall: gate.deps,
        env: { ...TEST_AI_ENV },
        log: quiet,
        run: async () => {
          calls.n++;
          if (fail) throw new ProviderError('timeout', 'too slow', true);
          return { data: new Uint8Array([255, 216, 255]), mimeType: 'image/jpeg' };
        },
      }),
  },
  {
    name: 'live-token',
    op: 'live',
    path: '/api/live-token',
    valid: { voice: 'Puck' },
    invalid: { voice: 'marin' },
    build: (gate, calls, fail) =>
      createLiveTokenHandler({
        aiCall: gate.deps,
        env: { ...TEST_AI_ENV },
        log: quiet,
        mint: async (voice) => {
          calls.n++;
          if (fail) throw new ProviderError('unavailable', 'no key');
          return { token: 'auth_tokens/abc', model: LIVE_MODEL, voice, expiresAt: '2026-11-06T12:00:00.000Z' };
        },
      }),
  },
];

const request = (path: string, body: unknown, headers: Record<string, string> = AUTH_HEADERS) =>
  new Request(`http://localhost:5173${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe.each(endpoints)('$path behind the AI gate', (e) => {
  it('without a sign-in: 401, and the provider is never called', async () => {
    const calls = { n: 0 };
    const res = await e.build(fakeAiCall(), calls)(request(e.path, e.valid, { 'x-studio-id': AUTH_HEADERS['x-studio-id'] }));
    expect(res.status).toBe(401);
    expect(calls.n).toBe(0);
  });

  it('a token that fails verification: 401, provider not called', async () => {
    const calls = { n: 0 };
    expect((await e.build(fakeAiCall({ verify: { kind: 'invalid' } }), calls)(request(e.path, e.valid))).status).toBe(401);
    expect(calls.n).toBe(0);
  });

  it('a viewer, or a user outside the studio: 403, provider not called', async () => {
    const calls = { n: 0 };
    const viewer = await e.build(fakeAiCall({ startError: { code: 'PT403', message: 'viewer', hint: 'viewer' } }), calls)(request(e.path, e.valid));
    expect(viewer.status).toBe(403);
    expect(await viewer.json()).toMatchObject({ error: { code: 'forbidden', message: "Viewers can't use AI. Ask a studio owner for designer access." } });
    const outsider = await e.build(fakeAiCall({ startError: { code: 'PT403', message: 'not a member of this studio' } }), calls)(request(e.path, e.valid));
    expect(outsider.status).toBe(403);
    expect(calls.n).toBe(0);
  });

  it('no credits: 402 no_credits, provider not called (SC-003)', async () => {
    const calls = { n: 0 };
    const res = await e.build(fakeAiCall({ startError: { code: 'PT402', message: 'not enough AI credits' } }), calls)(request(e.path, e.valid));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'no_credits', message: 'Your studio has no AI credits left. Contact Interior Studio to add credits.' } });
    expect(calls.n).toBe(0);
  });

  it(`charges "${e.op}" for the header studio, then finishes the job as succeeded`, async () => {
    const gate = fakeAiCall({ balance: 480 });
    const calls = { n: 0 };
    const res = await e.build(gate, calls)(request(e.path, e.valid));
    expect(res.status).toBe(200);
    expect(gate.charged()).toEqual([e.op]);
    expect(gate.calls[0]?.args).toEqual({ p_org: AUTH_HEADERS['x-studio-id'], p_op: e.op });
    expect(gate.finished()).toEqual([true]);
    expect(res.headers.get('x-ai-credits')).toBe('480');
    expect(calls.n).toBe(1);
  });

  it('an invalid request costs nothing', async () => {
    const gate = fakeAiCall();
    const res = await e.build(gate, { n: 0 })(request(e.path, e.invalid));
    expect(res.status).toBe(400);
    expect(gate.calls).toHaveLength(0);
  });

  it('a provider failure finishes the job as failed, so it is refunded', async () => {
    const gate = fakeAiCall();
    const res = await e.build(gate, { n: 0 }, true)(request(e.path, e.valid));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(gate.charged()).toEqual([e.op]);
    expect(gate.finished()).toEqual([false]);
  });
});

describe('/api/assistant specifics', () => {
  it('when the built-in rules answer (no provider key), the call is charged as assistant_rules (0 credits)', async () => {
    const gate = fakeAiCall();
    const res = await createAssistantHandler({ aiCall: gate.deps, env: { ...TEST_AI_ENV }, log: quiet })(request('/api/assistant', assistantBody));
    expect(res.status).toBe(200);
    expect(gate.charged()).toEqual(['assistant_rules']);
  });

  it('GET (provider status) needs a sign-in but charges nothing', async () => {
    const gate = fakeAiCall();
    const handler = createAssistantHandler({ aiCall: gate.deps, env: { ...TEST_AI_ENV }, log: quiet });
    expect((await handler(new Request('http://localhost/api/assistant'))).status).toBe(401);
    expect((await handler(new Request('http://localhost/api/assistant', { headers: { authorization: 'Bearer t' } }))).status).toBe(200);
    expect(gate.calls).toHaveLength(0);
  });

  it('a body naming a user, cost or studio changes nothing', async () => {
    const gate = fakeAiCall();
    const calls = { n: 0 };
    await createAssistantHandler({ aiCall: gate.deps, env: { ...TEST_AI_ENV }, provider: paid(calls), log: quiet })(
      request('/api/assistant', { ...assistantBody, user_id: 'x', cost: 0, studio: 'bbbbbbbb-0000-4000-8000-000000000000' }),
    );
    expect(gate.calls[0]?.args).toEqual({ p_org: AUTH_HEADERS['x-studio-id'], p_op: 'assistant' });
  });

  it('the courtesy rate limit is per signed-in user, not per IP', async () => {
    const gate = fakeAiCall();
    const log = vi.fn();
    const handler = createAssistantHandler({ aiCall: gate.deps, env: { ...TEST_AI_ENV, ASSISTANT_RATE_LIMIT: '1' }, log });
    const fromOneIp = { ...AUTH_HEADERS, 'x-forwarded-for': '203.0.113.9' };
    expect((await handler(request('/api/assistant', assistantBody, fromOneIp))).status).toBe(200);
    expect((await handler(request('/api/assistant', assistantBody, fromOneIp))).status).toBe(429);
    // A different user behind the same IP is not limited by the first user's calls.
    const other = createAssistantHandler({ aiCall: fakeAiCall({ verify: { kind: 'ok', userId: 'user-2' } }).deps, env: { ...TEST_AI_ENV, ASSISTANT_RATE_LIMIT: '1' }, log });
    expect((await other(request('/api/assistant', assistantBody, fromOneIp))).status).toBe(200);
  });
});
