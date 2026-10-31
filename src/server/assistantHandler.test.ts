// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '@/ai/providers/anthropic';
import { HttpAssistantProvider } from '@/ai/providers/http';
import { ProviderError, type AssistantProvider } from '@/ai/providers/types';
import type { AssistantRequest } from '@/ai/schema';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { createAssistantHandler, defaultSelectionFromEnv, providerFor, RateLimiter } from './assistantHandler';

const project = createProject({ name: 'Server', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
const body = (message = 'Create a 900 mm base cabinet', over: Partial<AssistantRequest> = {}): AssistantRequest => ({
  message,
  history: [],
  context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 3 },
  project,
  ...over,
});
const post = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost:5173/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof b === 'string' ? b : JSON.stringify(b) });
const quiet = () => undefined;

describe('/api/assistant', () => {
  it('answers with the deterministic provider by default and logs no message text', async () => {
    const logs: Record<string, unknown>[] = [];
    const handler = createAssistantHandler({ env: {}, log: (e) => logs.push(e) });
    const res = await handler(post(body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, provider: 'rules', response: { kind: 'plan', operations: [{ op: 'create_cabinet', cabinetType: 'base' }] } });
    expect(logs[0]).toMatchObject({ status: 200, provider: 'rules', kind: 'plan', operations: ['create_cabinet'] });
    expect(JSON.stringify(logs)).not.toContain('Create a 900');
  });

  it('rejects bad input, oversize messages, other origins and non-POST requests', async () => {
    const handler = createAssistantHandler({ env: {}, log: quiet });
    expect((await handler(post('{nope'))).status).toBe(400);
    expect((await handler(post(body('x'.repeat(1001))))).status).toBe(400);
    expect((await handler(post({ ...body(), project: { ...project, room: { ...project.room, width: -1 } } }))).status).toBe(400);
    expect((await handler(post(body(), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(new Request('http://localhost/api/assistant', { method: 'PUT' }))).status).toBe(405);
    expect((await handler(post({ ...body(), ai: { provider: 'openai', model: 'gpt-1-free' } }))).status).toBe(400);
  });

  it('rate-limits per client', async () => {
    const handler = createAssistantHandler({ env: {}, limiter: new RateLimiter(2, 60_000), log: quiet });
    expect((await handler(post(body()))).status).toBe(200);
    expect((await handler(post(body()))).status).toBe(200);
    const limited = await handler(post(body()));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await limited.json()).toMatchObject({ ok: false, error: { code: 'rate_limited', retryable: true } });
  });

  it('maps provider failures and never passes on an invalid answer', async () => {
    const provider = (respond: AssistantProvider['respond']): AssistantProvider => ({ id: 'fake', respond });
    const cases: [AssistantProvider, number, string][] = [
      [provider(() => Promise.reject(new ProviderError('rate_limited', 'slow down', true, 5))), 429, 'rate_limited'],
      [provider(() => Promise.reject(new ProviderError('timeout', 'too slow', true))), 504, 'timeout'],
      [provider(() => Promise.reject(new Error('crash'))), 502, 'malformed_output'],
      [provider(() => Promise.resolve({ kind: 'plan', explanation: 'x', operations: [{ op: 'format_disk' }] } as never)), 502, 'malformed_output'],
    ];
    for (const [p, status, code] of cases) {
      const res = await createAssistantHandler({ env: {}, provider: p, log: quiet })(post(body()));
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('builds the chosen provider from server-side keys and never reads a VITE_ variable', () => {
    expect(providerFor({ ANTHROPIC_API_KEY: 'sk-test' }, { provider: 'anthropic', model: 'claude-sonnet-5-5' }).provider).toMatchObject({ id: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(providerFor({ GEMINI_API_KEY: 'g' }, { provider: 'gemini', model: 'gemini-4-argon' }).provider).toMatchObject({ id: 'gemini', model: 'gemini-4-argon' });
    expect(providerFor({ GOOGLE_API_KEY: 'g' }, { provider: 'gemini', model: 'gemini-3.8-flash' }).provider.id).toBe('gemini');
    expect(providerFor({ OPENAI_API_KEY: 'o' }, { provider: 'openai', model: 'gpt-6.1-sol' }).provider).toMatchObject({ id: 'openai', model: 'gpt-6.1-sol' });
    expect(providerFor({ VITE_OPENAI_API_KEY: 'o' } as never, { provider: 'openai', model: 'gpt-6.1-sol' }).provider.id).toBe('rules');
    expect(() => providerFor({}, { provider: 'openai', model: 'claude-opus-5-5' })).toThrow(/not offered/);
  });

  it('defaults to Gemini and honours ASSISTANT_PROVIDER / ASSISTANT_MODEL only for offered models', () => {
    expect(defaultSelectionFromEnv({})).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(defaultSelectionFromEnv({ ASSISTANT_PROVIDER: 'anthropic' })).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(defaultSelectionFromEnv({ ASSISTANT_PROVIDER: 'openai', ASSISTANT_MODEL: 'gpt-6-luna' })).toEqual({ provider: 'openai', model: 'gpt-6-luna' });
    expect(defaultSelectionFromEnv({ ASSISTANT_PROVIDER: 'openai', ASSISTANT_MODEL: 'nope' }).model).toBe('gpt-6.1-sol');
    expect(defaultSelectionFromEnv({ ASSISTANT_PROVIDER: 'mock' }).provider).toBe('rules');
  });

  it('falls back to the built-in rules with a notice when the chosen provider has no key', async () => {
    const res = await createAssistantHandler({ env: {}, log: quiet })(post({ ...body(), ai: { provider: 'anthropic', model: 'claude-opus-5-5' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, provider: 'rules', notice: expect.stringMatching(/Anthropic Claude is not configured.*ANTHROPIC_API_KEY/) });
    const strict = await createAssistantHandler({ env: { ASSISTANT_FALLBACK_TO_RULES: 'off' }, log: quiet })(post({ ...body(), ai: { provider: 'gemini', model: 'gemini-3.8-flash' } }));
    expect(strict.status).toBe(503);
    expect(await strict.json()).toMatchObject({ ok: false, error: { code: 'unavailable', message: expect.stringContaining('GEMINI_API_KEY') } });
  });

  it('reports which providers are configured without exposing keys', async () => {
    const res = await createAssistantHandler({ env: { OPENAI_API_KEY: 'sk-secret', ASSISTANT_PROVIDER: 'openai' }, log: quiet })(new Request('http://localhost/api/assistant'));
    const text = await res.text();
    expect(text).not.toContain('sk-secret');
    expect(JSON.parse(text)).toEqual({
      defaultProvider: 'openai',
      providers: [
        { id: 'gemini', configured: false },
        { id: 'anthropic', configured: false },
        { id: 'openai', configured: true },
        { id: 'rules', configured: true },
      ],
    });
  });
});

/** A fake Messages API: returns the queued responses in order and records each request. */
function fakeApi(responses: (Record<string, unknown> | { status: number; headers?: Record<string, string>; body: unknown })[]) {
  const requests: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    const next = responses.shift() ?? { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'no more' } } };
    if ('status' in next && typeof next.status === 'number') return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json', ...(next.headers as Record<string, string>) } });
    return new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, ...next }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}
const toolUse = (name: string, input: unknown, id = 'tu1') => ({ content: [{ type: 'tool_use', id, name, input }] });
const anthropic = (fetchImpl: typeof fetch) => new AnthropicProvider({ apiKey: 'sk-test', model: 'claude-opus-5-5', timeoutMs: 10_000, maxSteps: 4, fallbacks: true, effort: 'medium', fetch: fetchImpl });

describe('Anthropic adapter', () => {
  it('inspects the project with read-only tools, then returns a validated proposal', async () => {
    const sink = project.cabinets.find((c) => c.type === 'sink')!;
    const api = fakeApi([toolUse('list_objects', { type: 'sink' }), toolUse('propose_changes', { explanation: 'Raise the sink to 750 mm.', operations: [{ op: 'resize', target: { id: sink.id }, height: 750 }] }, 'tu2')]);
    const r = await anthropic(api.fetchImpl).respond(body('make the sink 750 high'));
    expect(r).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', target: { id: sink.id }, height: 750 }] });
    expect(api.requests).toHaveLength(2);
    const second = api.requests[1]! as { messages: { role: string; content: unknown }[]; model: string; fallbacks: string; tool_choice: unknown };
    expect(second).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', tool_choice: { type: 'auto' } });
    expect(JSON.stringify(second.messages.at(-1))).toContain(sink.id);
    expect(JSON.stringify(api.requests[0])).toContain('<project_state>');
  });

  it('sends malformed tool input and unknown ids back for one repair, then gives up cleanly', async () => {
    const api = fakeApi([
      toolUse('propose_changes', { explanation: 'x', operations: [{ op: 'explode' }] }),
      toolUse('propose_changes', { explanation: 'x', operations: [{ op: 'delete', target: { id: 'cab_999' } }] }, 'tu2'),
      toolUse('propose_changes', { explanation: 'x', operations: [{ op: 'set_units', unit: 'cm' }] }, 'tu3'),
    ]);
    const r = await anthropic(api.fetchImpl).respond(body('switch to cm'));
    expect(r).toMatchObject({ kind: 'plan', operations: [{ op: 'set_units', unit: 'cm' }] });
    expect(JSON.stringify(api.requests[1])).toMatch(/Invalid input/);
    expect(JSON.stringify(api.requests[2])).toMatch(/no object with id/i);

    const never = fakeApi(Array.from({ length: 4 }, (_, i) => toolUse('propose_changes', { nope: true }, `t${i}`)));
    await expect(anthropic(never.fetchImpl).respond(body('x'))).rejects.toMatchObject({ code: 'malformed_output' });
  });

  it('maps rate limits, overload, refusals and plain-text answers', async () => {
    await expect(anthropic(fakeApi([{ status: 429, headers: { 'retry-after': '12' }, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow' } } }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 12 });
    await expect(anthropic(fakeApi([{ status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'busy' } } }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'provider_error', retryable: true });
    await expect(anthropic(fakeApi([{ stop_reason: 'refusal', content: [] }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'refused' });
    expect(await anthropic(fakeApi([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello!' }] }]).fetchImpl).respond(body('hi'))).toEqual({ kind: 'answer', text: 'Hello!' });
  });
});

describe('browser HTTP provider', () => {
  const reply = (status: number, b: unknown) => (async () => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status })) as unknown as typeof fetch;

  it('returns validated responses and maps errors', async () => {
    const ok = new HttpAssistantProvider('/api/assistant', 5_000, reply(200, { ok: true, provider: 'rules', response: { kind: 'answer', text: 'hi' } }));
    expect(await ok.respond(body())).toEqual({ kind: 'answer', text: 'hi' });
    expect(ok.lastServed).toEqual({ provider: 'rules', model: undefined });
    await expect(new HttpAssistantProvider('/x', 5_000, reply(429, { ok: false, error: { code: 'rate_limited', message: 'wait', retryable: true, retryAfterSeconds: 3 } })).respond(body())).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 3 });
    await expect(new HttpAssistantProvider('/x', 5_000, reply(200, { ok: true, provider: 'x', response: { kind: 'plan', operations: 'rm -rf' } })).respond(body())).rejects.toMatchObject({ code: 'malformed_output' });
    await expect(new HttpAssistantProvider('/x', 5_000, reply(502, '<html>')).respond(body())).rejects.toMatchObject({ code: 'malformed_output' });
    await expect(new HttpAssistantProvider('/x', 5_000, reply(404, 'Not found')).respond(body())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('times out', async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    await expect(new HttpAssistantProvider('/x', 50, hang).respond(body())).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('Anthropic adapter: layout goals', () => {
  it('passes a validated layout objective to the planner', async () => {
    const api = fakeApi([toolUse('plan_layout', { explanation: 'U-shape keeping the sink wall.', objective: { goal: 'Convert to U', topology: 'u-shaped', keepSinkWall: true, preserve: [{ id: 'fridge' }] } })]);
    const r = await anthropic(api.fetchImpl).respond(body('convert this into a U-shaped kitchen'));
    expect(r).toMatchObject({ kind: 'design', objective: { topology: 'u-shaped', keepSinkWall: true, priorities: [], clearances: 'hard' } });
    const bad = fakeApi([toolUse('plan_layout', { explanation: 'x', objective: { goal: 'x', topology: 'h-shaped' } }), toolUse('reply', { text: 'ok' }, 'tu2')]);
    expect(await anthropic(bad.fetchImpl).respond(body('x'))).toEqual({ kind: 'answer', text: 'ok' });
    expect(JSON.stringify(bad.requests[1])).toMatch(/Invalid input/);
  });
});
