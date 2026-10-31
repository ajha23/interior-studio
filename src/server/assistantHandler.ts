/**
 * `POST /api/assistant`: the only place the AI provider's key is used. Shared by the Vite dev
 * server (vite.config.ts) and the Vercel function (src/server/vercel.ts).
 *
 * It enforces the limits (body size, message length, operation count), validates the request and
 * the submitted project with the same Zod schema as saved files, rate-limits per client, picks the configured provider, validates
 * the provider's answer again, and logs one line per request without message text or secrets.
 */
import { AnthropicProvider } from '@/ai/providers/anthropic';
import { AI_PROVIDERS, PROVIDER_CATALOG, type AiProviderId, type AiSelection, type ProviderStatus } from '@/ai/providers/catalog';
import { GeminiProvider } from '@/ai/providers/gemini';
import { OpenAIProvider } from '@/ai/providers/openai';
import { RuleBasedProvider } from '@/ai/providers/rules';
import { ProviderError, type AssistantProvider } from '@/ai/providers/types';
import { AssistantRequestSchema, AssistantResponseSchema, LIMITS, type AssistantReply } from '@/ai/schema';

export interface ServerEnv {
  /** Default provider when a request names none: gemini (default), anthropic, openai or rules. */
  ASSISTANT_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Answer with the built-in rules when the chosen provider has no key (default on; "off" = error). */
  ASSISTANT_FALLBACK_TO_RULES?: string;
  ASSISTANT_MODEL?: string;
  ASSISTANT_TIMEOUT_MS?: string;
  ASSISTANT_EFFORT?: string;
  ASSISTANT_FALLBACKS?: string;
  ASSISTANT_RATE_LIMIT?: string;
}

const keyFor = (env: ServerEnv, id: AiProviderId): string | undefined => PROVIDER_CATALOG[id].keyEnv.map((k) => env[k as keyof ServerEnv]?.trim()).find(Boolean);

/** The server's default selection: ASSISTANT_PROVIDER (gemini when unset) and ASSISTANT_MODEL if it is offered. */
export function defaultSelectionFromEnv(env: ServerEnv): AiSelection {
  const name = (env.ASSISTANT_PROVIDER ?? 'gemini').trim().toLowerCase();
  const id: AiProviderId = name === 'mock' ? 'rules' : (AI_PROVIDERS as readonly string[]).includes(name) ? (name as AiProviderId) : 'gemini';
  const model = env.ASSISTANT_MODEL?.trim();
  return { provider: id, model: model && PROVIDER_CATALOG[id].models.some((m) => m.id === model) ? model : PROVIDER_CATALOG[id].defaultModel };
}

export function providerStatus(env: ServerEnv): ProviderStatus {
  return { defaultProvider: defaultSelectionFromEnv(env).provider, providers: AI_PROVIDERS.map((id) => ({ id, configured: id === 'rules' || !!keyFor(env, id) })) };
}

/**
 * The provider for a selection. A provider without a key falls back to the built-in rules with a
 * notice (unless ASSISTANT_FALLBACK_TO_RULES=off). Models must be in the catalog.
 */
export function providerFor(env: ServerEnv, selection: AiSelection = defaultSelectionFromEnv(env)): { provider: AssistantProvider; notice?: string } {
  const info = PROVIDER_CATALOG[selection.provider];
  if (!info.models.some((m) => m.id === selection.model)) throw new ProviderError('bad_request', `${selection.model} is not offered for ${info.label}.`);
  if (selection.provider === 'rules') return { provider: new RuleBasedProvider() };
  const apiKey = keyFor(env, selection.provider);
  if (!apiKey) {
    const message = `${info.label} is not configured on this server (set ${info.keyEnv[0]}), so the built-in rules answered.`;
    if (env.ASSISTANT_FALLBACK_TO_RULES === 'off') throw new ProviderError('unavailable', message.replace(', so the built-in rules answered.', '.'));
    return { provider: new RuleBasedProvider(), notice: message };
  }
  const timeoutMs = Math.min(120_000, Math.max(5_000, Number(env.ASSISTANT_TIMEOUT_MS) || 45_000));
  const effort = env.ASSISTANT_EFFORT === 'low' || env.ASSISTANT_EFFORT === 'high' ? env.ASSISTANT_EFFORT : 'medium';
  const common = { apiKey, model: selection.model, timeoutMs, maxSteps: 6 };
  if (selection.provider === 'gemini') return { provider: new GeminiProvider(common) };
  if (selection.provider === 'openai') return { provider: new OpenAIProvider({ ...common, effort }) };
  return { provider: new AnthropicProvider({ ...common, fallbacks: env.ASSISTANT_FALLBACKS !== 'off', effort }) };
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
    // GET: which providers this server can use (never the keys).
    if (req.method === 'GET') return new Response(JSON.stringify(providerStatus(options.env)), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
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
    let notice: string | undefined;
    try {
      if (options.provider) provider = options.provider;
      else ({ provider, notice } = providerFor(options.env, request.ai));
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('unavailable', 'The assistant is not configured.');
      log({ status: 503, error: pe.code });
      return error(503, pe.code, pe.message);
    }

    try {
      const response = AssistantResponseSchema.parse(await provider.respond(request, req.signal));
      if (response.kind === 'plan' && response.operations.length > LIMITS.operations) throw new ProviderError('malformed_output', 'The proposal had too many steps.');
      log({ status: 200, provider: provider.id, model: provider.model, requested: request.ai?.provider, kind: response.kind, operations: response.kind === 'plan' ? response.operations.map((o) => o.op) : undefined, ms: Date.now() - started, chars: request.message.length });
      return json({ ok: true, provider: provider.id, model: provider.model, ...(notice ? { notice } : {}), response }, 200);
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('malformed_output', 'The assistant produced an invalid answer.', true);
      const status = pe.code === 'rate_limited' ? 429 : pe.code === 'timeout' ? 504 : pe.code === 'unavailable' ? 503 : pe.code === 'refused' ? 422 : 502;
      log({ status, provider: provider.id, model: provider.model, error: pe.code, ms: Date.now() - started });
      return error(status, pe.code, pe.message, pe.retryable, pe.retryAfterSeconds);
    }
  };
}
