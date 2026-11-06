/**
 * The one gate every AI endpoint goes through (spec 045, FR-001–FR-008).
 *
 * 1. The Supabase URL and publishable/anon key must be configured, or the endpoint answers 503 (fail closed).
 * 2. `Authorization: Bearer <access token>` is verified with `supabase.auth.getClaims`. It must
 *    belong to a signed-in user (role `authenticated`); the anon key itself is not enough. No
 *    hand-written JWT code. Verification errors → 401; Auth or its keys unreachable → 503.
 * 3. POSTs name the paying studio in `x-studio-id`.
 * 4. The handler validates its request and then calls `call.charge(op)`. The database
 *    (`ai_start_call`) decides membership, role and balance, and debits the cost from its own table.
 *    A refusal comes back as the Response to return; the provider is never called.
 * 5. After the handler returns, the job is finished: a 2xx → succeeded; anything else, or a thrown
 *    error → failed and refunded. Only this request holds the job's finish token.
 *
 * Every database call runs as the user, through a per-request client carrying their token. These
 * endpoints never use a secret or service key.
 */
import { createClient } from '@supabase/supabase-js';

export type AiOp = 'assistant' | 'assistant_rules' | 'speech' | 'reference' | 'render' | 'live';

export interface AiCallEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface SupabaseTarget {
  url: string;
  key: string;
}

export type VerifyResult = { kind: 'ok'; userId: string } | { kind: 'invalid' } | { kind: 'unavailable' };

type RpcResponse = { data: unknown; error: { code?: string; message: string; hint?: string | null } | null };
/** The slice of a supabase-js client this module needs (structural, so tests can fake it). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResponse>;
}

export interface AiCallDeps {
  env: AiCallEnv;
  verify?: (token: string, target: SupabaseTarget) => Promise<VerifyResult>;
  clientFor?: (token: string, target: SupabaseTarget) => RpcClient;
  log?: (entry: Record<string, unknown>) => void;
}

export interface AiCall {
  /** The verified user (`sub`). */
  readonly userId: string;
  /** The paying studio from `x-studio-id`, or null on a GET. */
  readonly studioId: string | null;
  /** Charges the studio for `op`; returns a Response to send back when refused, else null. Once per request. */
  charge(op: AiOp): Promise<Response | null>;
  /** Records which provider served the call, for the job row. */
  setProvider(name: string): void;
}

type ErrorCode = 'unauthorized' | 'forbidden' | 'no_credits' | 'unavailable' | 'bad_request' | 'provider_error';

export const AI_MESSAGES = {
  unauthorized: 'Sign in to use AI.',
  notMember: 'You are not a member of this studio.',
  viewer: "Viewers can't use AI. Ask a studio owner for designer access.",
  noCredits: 'Your studio has no AI credits left. Contact Interior Studio to add credits.',
  unavailable: 'AI is not available right now. Try again shortly.',
  notConfigured: 'AI is not configured on this server.',
  noStudio: 'Choose the studio that pays for AI (x-studio-id).',
} as const;

export const aiError = (status: number, code: ErrorCode, message: string) =>
  new Response(JSON.stringify({ ok: false, error: { code, message, retryable: status === 503 } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;

/** The Supabase URL and publishable key; an empty value counts as missing. */
function target(env: AiCallEnv): SupabaseTarget | { missing: string[] } {
  const url = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim();
  const key = env.SUPABASE_ANON_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim();
  if (url && key) return { url, key };
  return { missing: [...(url ? [] : ['SUPABASE_URL']), ...(key ? [] : ['SUPABASE_ANON_KEY'])] };
}

/** Verifies the token with the official client. Only a signed-in user's token passes. */
async function verifyWithSupabase(token: string, t: SupabaseTarget): Promise<VerifyResult> {
  try {
    const { data, error } = await createClient(t.url, t.key, noSession).auth.getClaims(token);
    if (error) {
      const status = (error as { status?: number }).status ?? 0;
      return error.name === 'AuthRetryableFetchError' || status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
    }
    const claims = data?.claims;
    // getClaims('') resolves with data: null and no error (research R1); the anon key verifies but has no user.
    if (!claims || claims.role !== 'authenticated' || typeof claims.sub !== 'string' || !claims.sub) return { kind: 'invalid' };
    return { kind: 'ok', userId: claims.sub };
  } catch {
    return { kind: 'unavailable' };
  }
}

function clientWithToken(token: string, t: SupabaseTarget): RpcClient {
  return createClient(t.url, t.key, { ...noSession, global: { headers: { Authorization: `Bearer ${token}` } } });
}

function refusal(error: NonNullable<RpcResponse['error']>): Response {
  if (error.code === 'PT401') return aiError(401, 'unauthorized', AI_MESSAGES.unauthorized);
  if (error.code === 'PT403') return error.hint === 'viewer' || error.message === 'viewer' ? aiError(403, 'forbidden', AI_MESSAGES.viewer) : aiError(403, 'forbidden', AI_MESSAGES.notMember);
  if (error.code === 'PT402') return aiError(402, 'no_credits', AI_MESSAGES.noCredits);
  return aiError(503, 'unavailable', AI_MESSAGES.unavailable);
}

function withHeader(res: Response, name: string, value: string): Response {
  const headers = new Headers(res.headers);
  headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function withAiCall(handler: (req: Request, call: AiCall) => Promise<Response>, deps: AiCallDeps): (req: Request) => Promise<Response> {
  const verify = deps.verify ?? verifyWithSupabase;
  const clientFor = deps.clientFor ?? clientWithToken;
  const log = deps.log ?? ((entry) => console.info(JSON.stringify(entry)));

  return async (req) => {
    const configured = target(deps.env);
    if ('missing' in configured) {
      // Names only (never values), so a misconfigured deployment says what to set.
      log({ event: 'ai_not_configured', missing: configured.missing });
      return aiError(503, 'unavailable', `${AI_MESSAGES.notConfigured} Missing: ${configured.missing.join(', ')}.`);
    }
    const t = configured;

    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim();
    if (!token) return aiError(401, 'unauthorized', AI_MESSAGES.unauthorized);
    const verified = await verify(token, t);
    if (verified.kind === 'unavailable') return aiError(503, 'unavailable', AI_MESSAGES.unavailable);
    if (verified.kind === 'invalid') return aiError(401, 'unauthorized', AI_MESSAGES.unauthorized);

    const studio = req.headers.get('x-studio-id')?.trim() ?? '';
    if (req.method === 'POST' && !UUID.test(studio)) return aiError(400, 'bad_request', AI_MESSAGES.noStudio);

    let db: RpcClient | null = null;
    let job: { id: string; token: string; balance: number; cost: number } | null = null;
    let provider: string | null = null;

    const call: AiCall = {
      userId: verified.userId,
      studioId: UUID.test(studio) ? studio : null,
      setProvider: (name) => {
        provider = name;
      },
      charge: async (op) => {
        if (job) throw new Error('An AI call can be charged only once.');
        if (!call.studioId) return aiError(400, 'bad_request', AI_MESSAGES.noStudio);
        db ??= clientFor(token, t);
        const { data, error } = await db.rpc('ai_start_call', { p_org: call.studioId, p_op: op });
        if (error) {
          log({ event: 'ai_charge_refused', op, code: error.code });
          return refusal(error);
        }
        const started = data as { job_id: string; finish_token: string; balance: number; cost: number };
        job = { id: started.job_id, token: started.finish_token, balance: started.balance, cost: started.cost };
        return null;
      },
    };

    const finish = async (ok: boolean, detail: string | null) => {
      if (!job || !db) return;
      const { error } = await db.rpc('ai_finish_call', { p_job: job.id, p_finish_token: job.token, p_ok: ok, p_provider: provider, p_error: ok ? null : detail });
      if (error) log({ event: 'ai_finish_failed', job: job.id, code: error.code });
    };

    let res: Response;
    try {
      res = await handler(req, call);
    } catch {
      await finish(false, 'handler error');
      return aiError(502, 'provider_error', 'The AI request failed. Your credits were refunded.');
    }
    if (!job) return res;
    const charged = job as { balance: number; cost: number };
    const ok = res.status < 400;
    await finish(ok, ok ? null : `HTTP ${res.status}`);
    return withHeader(res, 'x-ai-credits', String(ok ? charged.balance : charged.balance + charged.cost));
  };
}
