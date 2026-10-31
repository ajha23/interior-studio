/**
 * `POST /api/live-token`: a short-lived, single-use Gemini Live token for the browser. The token is
 * locked to the Live model and the full session configuration (instructions, tools, voice), so the
 * browser connects to Google directly (lowest latency) without seeing the API key or being able to
 * change what the model is told. Same-origin and rate-limited like the other endpoints.
 */
import { GoogleGenAI } from '@google/genai';
import { toProviderError } from '@/ai/providers/gemini';
import { ProviderError } from '@/ai/providers/types';
import { LIVE_MODEL, liveConfig, LiveTokenRequestSchema, type LiveToken } from '@/ai/live';
import { REMOTE_VOICES } from '@/voice/voices';
import { RateLimiter, type ServerEnv } from './assistantHandler';

export type MintToken = (voice: string) => Promise<LiveToken>;

/** Mints a token with the server's Gemini key, or throws `unavailable` when there is none. */
export function tokenMinter(env: ServerEnv, fetchImpl?: typeof fetch): MintToken {
  return async (voice) => {
    const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
    if (!apiKey) throw new ProviderError('unavailable', 'Realtime voice needs GEMINI_API_KEY on the server.');
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha', ...(fetchImpl ? { fetch: fetchImpl } : {}) } });
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: expiresAt,
          newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
          // With constraints set, every field of this configuration is locked for sessions using the token.
          liveConnectConstraints: { model: LIVE_MODEL, config: liveConfig(voice) as never },
          httpOptions: { apiVersion: 'v1alpha' },
        },
      });
      if (!token.name) throw new ProviderError('malformed_output', 'Gemini returned no token.', true);
      return { token: token.name, model: LIVE_MODEL, voice, expiresAt };
    } catch (e) {
      throw toProviderError(e);
    }
  };
}

export interface LiveTokenHandlerOptions {
  env: ServerEnv;
  limiter?: RateLimiter;
  mint?: MintToken;
  log?: (entry: Record<string, unknown>) => void;
  clientKey?: (req: Request) => string;
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const fail = (status: number, code: string, message: string, retryAfterSeconds?: number) =>
  json({ ok: false, error: { code, message, retryable: status === 429 || status >= 500, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } }, status, retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : {});

export function createLiveTokenHandler(options: LiveTokenHandlerOptions): (req: Request) => Promise<Response> {
  // One token per conversation: a low limit is plenty.
  const limiter = options.limiter ?? new RateLimiter(10, 60_000);
  const log = options.log ?? ((entry) => console.info(JSON.stringify({ event: 'live-token', ...entry })));
  const clientKey = options.clientKey ?? ((req) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local');
  const mint = options.mint ?? tokenMinter(options.env);

  return async (req) => {
    if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
    const origin = req.headers.get('origin');
    if (origin && new URL(req.url).host !== new URL(origin).host) return fail(403, 'bad_request', 'Cross-origin requests are not allowed.');
    const wait = limiter.check(clientKey(req));
    if (wait) return fail(429, 'rate_limited', `Too many requests. Try again in ${wait} s.`, wait);
    let raw: unknown;
    try {
      const text = await req.text();
      if (text.length > 1_000) return fail(413, 'bad_request', 'The request is too large.');
      raw = text ? JSON.parse(text) : {};
    } catch {
      return fail(400, 'bad_request', 'The request is not valid JSON.');
    }
    const parsed = LiveTokenRequestSchema.safeParse(raw);
    const voices = REMOTE_VOICES.gemini;
    if (!parsed.success || (parsed.data.voice && !voices.voices.some((v) => v.id === parsed.data.voice))) return fail(400, 'bad_request', 'Invalid request: unknown voice.');
    const voice = parsed.data.voice ?? voices.defaultVoice;
    try {
      const token = await mint(voice);
      log({ status: 200, model: token.model, voice });
      return json({ ok: true, ...token }, 200);
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('provider_error', 'Could not start a realtime session.', true);
      const status = pe.code === 'rate_limited' ? 429 : pe.code === 'unavailable' ? 503 : 502;
      log({ status, error: pe.code });
      return fail(status, pe.code, pe.message, pe.retryAfterSeconds);
    }
  };
}
