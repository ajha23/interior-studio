// Spec 045, FR-001–FR-008: the one wrapper every AI endpoint goes through. Fakes stand in for
// supabase.auth.getClaims and the per-request database client; the real ones are covered by pgTAP,
// the concurrency script and e2e.
import { describe, expect, it, vi } from 'vitest';
import { withAiCall, type AiCallDeps, type AiCall, type RpcClient } from './aiCall';

const ALPHA = 'aaaaaaaa-0000-4000-8000-000000000000';
const env = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'anon-key' };

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

function fakeRpc(results: Partial<Record<'ai_start_call' | 'ai_finish_call', RpcResult>> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'ai_start_call') return results.ai_start_call ?? { data: { job_id: 'job-1', finish_token: 'tok-1', balance: 499, cost: 1 }, error: null };
      return results.ai_finish_call ?? { data: 'succeeded', error: null };
    },
  };
  return { client, calls };
}

function setup(options: { verify?: AiCallDeps['verify']; rpc?: ReturnType<typeof fakeRpc>; env?: AiCallDeps['env']; handler?: (req: Request, call: AiCall) => Promise<Response> } = {}) {
  const rpc = options.rpc ?? fakeRpc();
  const clientFor = vi.fn((_token: string) => rpc.client);
  const provider = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const handler =
    options.handler ??
    (async (_req: Request, call: AiCall) => {
      const refused = await call.charge('assistant');
      if (refused) return refused;
      return provider();
    });
  const log = vi.fn();
  const handle = withAiCall(handler, {
    env: options.env ?? env,
    verify: options.verify ?? (async () => ({ kind: 'ok', userId: 'user-1' })),
    clientFor,
    log,
  });
  return { handle, rpc, clientFor, provider, log };
}

const post = (headers: Record<string, string> = {}, body: unknown = { message: 'hi' }) =>
  new Request('http://localhost/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const authed = (extra: Record<string, string> = {}) => post({ authorization: 'Bearer good-token', 'x-studio-id': ALPHA, ...extra });

async function bodyOf(res: Response) {
  return (await res.json()) as { ok: boolean; error?: { code: string; message: string } };
}

describe('withAiCall — authentication (US1, FR-001, FR-002)', () => {
  it('no Authorization header → 401 unauthorized, and the provider is never called', async () => {
    const { handle, provider, rpc } = setup();
    const res = await handle(post({ 'x-studio-id': ALPHA }));
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'unauthorized', message: 'Sign in to use AI.' });
    expect(provider).not.toHaveBeenCalled();
    expect(rpc.calls).toHaveLength(0);
  });

  it('an empty bearer token → 401', async () => {
    const verify = vi.fn(async () => ({ kind: 'ok' as const, userId: 'x' }));
    const { handle } = setup({ verify });
    expect((await handle(post({ authorization: 'Bearer ', 'x-studio-id': ALPHA }))).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it('a token the verifier rejects (bad signature, expired, or no claims) → 401', async () => {
    const { handle, provider } = setup({ verify: async () => ({ kind: 'invalid' }) });
    expect((await handle(authed())).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });

  it('Auth or its keys unreachable → 503, never skipping verification', async () => {
    const { handle, provider } = setup({ verify: async () => ({ kind: 'unavailable' }) });
    const res = await handle(authed());
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).error?.code).toBe('unavailable');
    expect(provider).not.toHaveBeenCalled();
  });

  it('the real verifier (supabase.auth.getClaims) is used when none is injected', async () => {
    // No reachable Supabase at this URL: verification cannot happen, so the call fails closed.
    const handle = withAiCall(async () => new Response('{}'), { env: { SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'k' } });
    expect([401, 503]).toContain((await handle(authed())).status);
  });

  it('missing Supabase settings on the server → 503 before anything else', async () => {
    const verify = vi.fn(async () => ({ kind: 'ok' as const, userId: 'x' }));
    const { handle } = setup({ env: {}, verify });
    expect((await handle(authed())).status).toBe(503);
    expect(verify).not.toHaveBeenCalled();
  });

  it('reads the VITE_ names when the plain ones are absent', async () => {
    const { handle } = setup({ env: { VITE_SUPABASE_URL: env.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'anon' } });
    expect((await handle(authed())).status).toBe(200);
  });

  it('a POST without a valid x-studio-id → 400', async () => {
    const { handle } = setup();
    expect((await handle(post({ authorization: 'Bearer good-token' }))).status).toBe(400);
    expect((await handle(post({ authorization: 'Bearer good-token', 'x-studio-id': 'alpha' }))).status).toBe(400);
  });

  it('the per-request client carries the user token; the wrapper holds no secret key', async () => {
    const { handle, clientFor } = setup();
    await handle(authed());
    expect(clientFor).toHaveBeenCalledWith('good-token', { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY });
    expect(JSON.stringify(env)).not.toMatch(/service|secret/i);
  });
});

describe('withAiCall — charging (US2, FR-004–FR-008)', () => {
  it('charges the header studio and the handler op only, ignoring user, cost or studio in the body', async () => {
    const { handle, rpc } = setup();
    await handle(post({ authorization: 'Bearer good-token', 'x-studio-id': ALPHA }, { message: 'hi', user_id: 'evil', cost: 0, credits: 9999, studio: 'bbbbbbbb-0000-4000-8000-000000000000' }));
    expect(rpc.calls[0]).toEqual({ fn: 'ai_start_call', args: { p_org: ALPHA, p_op: 'assistant' } });
  });

  it.each([
    ['PT403', 'not a member', 403, 'forbidden', 'You are not a member of this studio.'],
    ['PT403', 'viewer', 403, 'forbidden', "Viewers can't use AI. Ask a studio owner for designer access."],
    ['PT402', 'insufficient', 402, 'no_credits', 'Your studio has no AI credits left. Contact Interior Studio to add credits.'],
    ['PT401', 'no user', 401, 'unauthorized', 'Sign in to use AI.'],
  ])('a %s (%s) refusal → %i %s, and the provider is never called', async (code, message, status, errorCode, text) => {
    const rpc = fakeRpc({ ai_start_call: { data: null, error: { code, message } } });
    const { handle, provider } = setup({ rpc });
    const res = await handle(authed());
    expect(res.status).toBe(status);
    expect((await bodyOf(res)).error).toMatchObject({ code: errorCode, message: text });
    expect(provider).not.toHaveBeenCalled();
    expect(rpc.calls.map((c) => c.fn)).toEqual(['ai_start_call']);
  });

  it('any other database error while charging → 503, provider not called', async () => {
    const rpc = fakeRpc({ ai_start_call: { data: null, error: { code: '08006', message: 'connection failure' } } });
    const { handle, provider } = setup({ rpc });
    expect((await handle(authed())).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });

  it('after a successful call: finishes the job as succeeded and reports the balance', async () => {
    const { handle, rpc } = setup();
    const res = await handle(authed());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ai-credits')).toBe('499');
    expect(rpc.calls[1]).toEqual({ fn: 'ai_finish_call', args: { p_job: 'job-1', p_finish_token: 'tok-1', p_ok: true, p_provider: null, p_error: null } });
  });

  it('after a provider failure: finishes the job as failed (refunded) and reports the refunded balance', async () => {
    const { handle, rpc } = setup({
      handler: async (_req, call) => {
        const refused = await call.charge('assistant');
        if (refused) return refused;
        call.setProvider('gemini');
        return new Response(JSON.stringify({ ok: false, error: { code: 'timeout', message: 'slow' } }), { status: 504 });
      },
    });
    const res = await handle(authed());
    expect(res.status).toBe(504);
    expect(res.headers.get('x-ai-credits')).toBe('500');
    expect(rpc.calls[1]).toEqual({ fn: 'ai_finish_call', args: { p_job: 'job-1', p_finish_token: 'tok-1', p_ok: false, p_provider: 'gemini', p_error: 'HTTP 504' } });
  });

  it('a handler that throws after charging still refunds, then returns 502', async () => {
    const { handle, rpc } = setup({
      handler: async (_req, call) => {
        await call.charge('render');
        throw new Error('boom');
      },
    });
    expect((await handle(authed())).status).toBe(502);
    expect(rpc.calls[1]?.args).toMatchObject({ p_ok: false });
  });

  it('a handler that never charges (for example a 400) → no job is finished', async () => {
    const { handle, rpc } = setup({ handler: async () => new Response('{}', { status: 400 }) });
    expect((await handle(authed())).status).toBe(400);
    expect(rpc.calls).toHaveLength(0);
  });

  it('a refused finish (PT409) is logged and does not change the response', async () => {
    const rpc = fakeRpc({ ai_finish_call: { data: null, error: { code: 'PT409', message: 'already finished' } } });
    const { handle, log } = setup({ rpc });
    expect((await handle(authed())).status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'ai_finish_failed', code: 'PT409' }));
  });

  it('charging twice in one request is a programming error', async () => {
    const { handle } = setup({
      handler: async (_req, call) => {
        await call.charge('assistant');
        await call.charge('assistant');
        return new Response('{}');
      },
    });
    expect((await handle(authed())).status).toBe(502);
  });

  it('GET needs a signed-in user but no studio, and charges nothing', async () => {
    const { handle, rpc } = setup({ handler: async () => new Response('{"providers":[]}') });
    const res = await handle(new Request('http://localhost/api/assistant', { headers: { authorization: 'Bearer good-token' } }));
    expect(res.status).toBe(200);
    expect(rpc.calls).toHaveLength(0);
    expect((await handle(new Request('http://localhost/api/assistant'))).status).toBe(401);
  });

  it('exposes the verified user to the handler (for the courtesy rate limit)', async () => {
    let seen = '';
    const { handle } = setup({
      handler: async (_req, call) => {
        seen = call.userId;
        return new Response('{}');
      },
    });
    await handle(authed());
    expect(seen).toBe('user-1');
  });
});
