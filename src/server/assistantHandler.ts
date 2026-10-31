/**
 * `POST /api/assistant`: the only place the AI provider's key is used. Shared by the Vite dev
 * server (vite.config.ts) and the Vercel function (src/server/vercel.ts).
 *
 * It enforces the limits (body size, message length, operation count), validates the request and
 * the submitted project with the same Zod schema as saved files, rate-limits per client, picks the configured provider, validates
 * the provider's answer again, and logs one line per request without message text or secrets.
 */
import { AnthropicProvider } from '@/ai/providers/anthropic';
import { RuleBasedProvider } from '@/ai/providers/rules';
import { ProviderError, type AssistantProvider } from '@/ai/providers/types';
import { AssistantRequestSchema, AssistantResponseSchema, LIMITS, type AssistantReply } from '@/ai/schema';

export interface ServerEnv {
  ASSISTANT_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ASSISTANT_MODEL?: string;
  ASSISTANT_TIMEOUT_MS?: string;
  ASSISTANT_EFFORT?: string;
  ASSISTANT_FALLBACKS?: string;
  ASSISTANT_RATE_LIMIT?: string;
}

export const DEFAULT_MODEL = 'claude-opus-5-5';

export function providerFromEnv(env: ServerEnv): AssistantProvider {
  const name = (env.ASSISTANT_PROVIDER ?? 'rules').trim().toLowerCase();
  if (name === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new ProviderError('unavailable', 'The assistant is set to use Anthropic but ANTHROPIC_API_KEY is not configured on the server.');
    const effort = env.ASSISTANT_EFFORT === 'low' || env.ASSISTANT_EFFORT === 'high' ? env.ASSISTANT_EFFORT : 'medium';
    return new AnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL,
      timeoutMs: Math.min(120_000, Math.max(5_000, Number(env.ASSISTANT_TIMEOUT_MS) || 45_000)),
      maxSteps: 6,
      fallbacks: env.ASSISTANT_FALLBACKS !== 'off',
      effort,
    });
  }
  if (name === 'rules' || name === 'mock') return new RuleBasedProvider();
  throw new ProviderError('unavailable', `Unknown ASSISTANT_PROVIDER “${name}” (use rules or anthropic).`);
}

/** Fixed-window request counter per client. Best effort: each server instance keeps its own. */
export class RateLimiter {
  private hits = new Map<string, { start: number; count: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds to wait, or 0 when the request may go ahead. */
  check(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      if (this.hits.size > 10_000) this.hits.clear();
      return 0;
    }
    if (h.count >= this.limit) return Math.ceil((h.start + this.windowMs - now) / 1000);
    h.count++;
    return 0;
  }
}

const json = (body: AssistantReply, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

const error = (status: number, code: Extract<AssistantReply, { ok: false }>['error']['code'], message: string, retryable = false, retryAfterSeconds?: number) =>
  json({ ok: false, error: { code, message, retryable, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } }, status, retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : {});

export interface HandlerOptions {
  env: ServerEnv;
  limiter?: RateLimiter;
  /** Overrides provider construction (tests). */
  provider?: AssistantProvider;
  log?: (entry: Record<string, unknown>) => void;
  clientKey?: (req: Request) => string;
}

export function createAssistantHandler(options: HandlerOptions): (req: Request) => Promise<Response> {
  const limiter = options.limiter ?? new RateLimiter(Number(options.env.ASSISTANT_RATE_LIMIT) || 30, 60_000);
  const log = options.log ?? ((entry) => console.info(JSON.stringify({ event: 'assistant', ...entry })));
  const clientKey = options.clientKey ?? ((req) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local');

  return async (req) => {
    const started = Date.now();
    if (req.method !== 'POST') return error(405, 'bad_request', 'Use POST.');
    // Same-origin only: browsers send Origin on cross-site POSTs.
    const origin = req.headers.get('origin');
    if (origin && new URL(req.url).host !== new URL(origin).host) return error(403, 'bad_request', 'Cross-origin requests are not allowed.');
    const wait = limiter.check(clientKey(req));
    if (wait) {
      log({ status: 429, reason: 'local_rate_limit' });
      return error(429, 'rate_limited', `Too many requests. Try again in ${wait} s.`, true, wait);
    }

    const text = await req.text();
    if (text.length > LIMITS.projectBytes + 50_000) return error(413, 'bad_request', 'The project is too large to send to the assistant.');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return error(400, 'bad_request', 'The request is not valid JSON.');
    }
    const parsed = AssistantRequestSchema.safeParse(raw);
    if (!parsed.success) return error(400, 'bad_request', `Invalid request: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    const request = parsed.data;

    let provider: AssistantProvider;
    try {
      provider = options.provider ?? providerFromEnv(options.env);
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('unavailable', 'The assistant is not configured.');
      log({ status: 503, error: pe.code });
      return error(503, pe.code, pe.message);
    }

    try {
      const response = AssistantResponseSchema.parse(await provider.respond(request, req.signal));
      if (response.kind === 'plan' && response.operations.length > LIMITS.operations) throw new ProviderError('malformed_output', 'The proposal had too many steps.');
      log({ status: 200, provider: provider.id, model: provider.model, kind: response.kind, operations: response.kind === 'plan' ? response.operations.map((o) => o.op) : undefined, ms: Date.now() - started, chars: request.message.length });
      return json({ ok: true, provider: provider.id, model: provider.model, response }, 200);
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('malformed_output', 'The assistant produced an invalid answer.', true);
      const status = pe.code === 'rate_limited' ? 429 : pe.code === 'timeout' ? 504 : pe.code === 'unavailable' ? 503 : pe.code === 'refused' ? 422 : 502;
      log({ status, provider: provider.id, model: provider.model, error: pe.code, ms: Date.now() - started });
      return error(status, pe.code, pe.message, pe.retryable, pe.retryAfterSeconds);
    }
  };
}
