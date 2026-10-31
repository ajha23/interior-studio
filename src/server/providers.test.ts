// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, AiSelectionSchema, DEFAULT_PROVIDER, defaultSelection, PROVIDER_CATALOG } from '@/ai/providers/catalog';
import { GeminiProvider } from '@/ai/providers/gemini';
import { HttpAssistantProvider } from '@/ai/providers/http';
import { OpenAIProvider } from '@/ai/providers/openai';
import type { AssistantRequest } from '@/ai/schema';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';

const project = createProject({ name: 'Providers', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
const body = (message = 'Create a 900 mm base cabinet'): AssistantRequest => ({
  message,
  history: [],
  context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 3 },
  project,
});

type Queued = Record<string, unknown> | { status: number; headers?: Record<string, string>; body: unknown };
/** A fake HTTP API: returns the queued JSON bodies in order and records each request. */
function fakeApi(responses: Queued[], wrap: (b: Record<string, unknown>) => unknown = (b) => b) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url instanceof Request ? url.url : url), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    const next = responses.shift() ?? { status: 500, body: { error: { message: 'no more' } } };
    if ('status' in next && typeof next.status === 'number') return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json', ...(next.headers as Record<string, string>) } });
    return new Response(JSON.stringify(wrap(next)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe('provider catalog', () => {
  it('offers five models per AI provider, defaults to Gemini and rejects unlisted models', () => {
    expect(DEFAULT_PROVIDER).toBe('gemini');
    expect(defaultSelection()).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    for (const id of AI_PROVIDERS.filter((p) => p !== 'rules')) {
      const info = PROVIDER_CATALOG[id];
      expect(info.models).toHaveLength(5);
      expect(info.models.map((m) => m.id)).toContain(info.defaultModel);
      expect(info.keyEnv.length).toBeGreaterThan(0);
    }
    expect(AiSelectionSchema.safeParse({ provider: 'anthropic', model: 'claude-opus-5-5' }).success).toBe(true);
    expect(AiSelectionSchema.safeParse({ provider: 'anthropic', model: 'gpt-6-astra' }).success).toBe(false);
  });
});

describe('Gemini adapter', () => {
  const candidate = (parts: unknown[], finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts }, finishReason }] });
  const gemini = (fetchImpl: typeof fetch) => new GeminiProvider({ apiKey: 'g-test', model: 'gemini-3.8-flash', timeoutMs: 10_000, maxSteps: 4, fetch: fetchImpl });

  it('inspects with read-only tools, replays thought signatures and returns a validated proposal', async () => {
    const sink = project.cabinets.find((c) => c.type === 'sink')!;
    const api = fakeApi([
      candidate([{ functionCall: { id: 'fc1', name: 'list_objects', args: { type: 'sink' } }, thoughtSignature: 'sig-1' }]),
      candidate([{ functionCall: { name: 'propose_changes', args: { explanation: 'Raise the sink.', operations: [{ op: 'resize', target: { id: sink.id }, height: 750 }] } } }]),
    ]);
    const r = await gemini(api.fetchImpl).respond(body('make the sink 750 high'));
    expect(r).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', target: { id: sink.id }, height: 750 }] });
    expect(api.requests[0]!.url).toContain('models/gemini-3.8-flash:generateContent');
    const second = api.requests[1]!.body as { contents: { role: string; parts: Record<string, unknown>[] }[] };
    const model = second.contents.at(-2)!;
    expect(model.role).toBe('model');
    expect(model.parts[0]).toMatchObject({ thoughtSignature: 'sig-1', functionCall: { id: 'fc1', name: 'list_objects' } });
    expect(second.contents.at(-1)!.parts[0]).toMatchObject({ functionResponse: { id: 'fc1', name: 'list_objects' } });
    expect(JSON.stringify(second.contents.at(-1))).toContain(sink.id);
    expect(JSON.stringify(api.requests[0]!.body)).toContain('<project_state>');
  });

  it('maps quota errors, bad requests, safety blocks and plain-text answers', async () => {
    const quota = { status: 429, body: { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }] } } };
    await expect(gemini(fakeApi([quota]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 17 });
    await expect(gemini(fakeApi([{ status: 400, body: { error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT' } } }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'provider_error', retryable: false });
    await expect(gemini(fakeApi([{ candidates: [{ finishReason: 'SAFETY' }] }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'refused' });
    await expect(gemini(fakeApi([{ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'refused' });
    expect(await gemini(fakeApi([candidate([{ text: 'thinking…', thought: true }, { text: 'Hello!' }])]).fetchImpl).respond(body('hi'))).toEqual({ kind: 'answer', text: 'Hello!' });
  });
});

describe('OpenAI adapter', () => {
  const response = (output: unknown[], extra: Record<string, unknown> = {}) => ({ id: 'resp_1', object: 'response', status: 'completed', model: 'gpt-6.1-sol', output, ...extra });
  const openai = (fetchImpl: typeof fetch) => new OpenAIProvider({ apiKey: 'o-test', model: 'gpt-6.1-sol', timeoutMs: 10_000, maxSteps: 4, effort: 'medium', fetch: fetchImpl });

  it('inspects with read-only tools, passes reasoning back and returns a validated proposal', async () => {
    const sink = project.cabinets.find((c) => c.type === 'sink')!;
    const api = fakeApi([
      response([
        { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'enc-1' },
        { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'list_objects', arguments: '{"type":"sink"}' },
      ]),
      response([{ type: 'function_call', id: 'fc_2', call_id: 'call_2', name: 'propose_changes', arguments: JSON.stringify({ explanation: 'Raise the sink.', operations: [{ op: 'resize', target: { id: sink.id }, height: 750 }] }) }]),
    ]);
    const r = await openai(api.fetchImpl).respond(body('make the sink 750 high'));
    expect(r).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', target: { id: sink.id }, height: 750 }] });
    expect(api.requests[0]!.url).toContain('/responses');
    expect(api.requests[0]!.body).toMatchObject({ model: 'gpt-6.1-sol', store: false, include: ['reasoning.encrypted_content'], reasoning: { effort: 'medium' } });
    const input = api.requests[1]!.body.input as Record<string, unknown>[];
    expect(input).toContainEqual(expect.objectContaining({ type: 'reasoning', encrypted_content: 'enc-1' }));
    const output = input.find((i) => i.type === 'function_call_output')!;
    expect(output).toMatchObject({ call_id: 'call_1' });
    expect(String(output.output)).toContain(sink.id);
  });

  it('sends invalid JSON arguments back for repair and maps rate limits and refusals', async () => {
    const api = fakeApi([
      response([{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'propose_changes', arguments: '{not json' }]),
      response([{ type: 'function_call', id: 'fc_2', call_id: 'call_2', name: 'reply', arguments: '{"text":"ok"}' }]),
    ]);
    expect(await openai(api.fetchImpl).respond(body('x'))).toEqual({ kind: 'answer', text: 'ok' });
    expect(JSON.stringify(api.requests[1]!.body)).toMatch(/Invalid input|ERROR/);
    await expect(openai(fakeApi([{ status: 429, headers: { 'retry-after': '9' }, body: { error: { message: 'slow', type: 'rate_limit_error' } } }]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 9 });
    await expect(openai(fakeApi([response([{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'no' }] }])]).fetchImpl).respond(body())).rejects.toMatchObject({ code: 'refused' });
  });
});

describe('browser HTTP provider: model selection', () => {
  it('sends the chosen provider and model and reports who answered', async () => {
    const sent: unknown[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      if (init.method === 'GET') return new Response(JSON.stringify({ defaultProvider: 'gemini', providers: [{ id: 'gemini', configured: true }] }));
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true, provider: 'rules', notice: 'OpenAI is not configured on this server.', response: { kind: 'answer', text: 'hi' } }));
    }) as unknown as typeof fetch;
    const http = new HttpAssistantProvider('/api/assistant', 5_000, fetchImpl, () => ({ provider: 'openai', model: 'gpt-6-luna' }));
    await http.respond(body());
    expect(sent[0]).toMatchObject({ ai: { provider: 'openai', model: 'gpt-6-luna' } });
    expect(http.model).toBe('gpt-6-luna');
    expect(http.lastServed).toEqual({ provider: 'rules', model: undefined, notice: 'OpenAI is not configured on this server.' });
    expect(await http.status()).toMatchObject({ defaultProvider: 'gemini' });
  });
});
