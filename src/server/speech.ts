/**
 * `POST /api/speech`: turns a short assistant reply into audio with Gemini's or OpenAI's voices,
 * using the server's key. Only short status lines are spoken (≤ 300 characters), only listed voices
 * are accepted, and requests are same-origin and rate-limited like `/api/assistant`. Returns WAV.
 */
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { toProviderError as geminiError } from '@/ai/providers/gemini';
import { toProviderError as openaiError } from '@/ai/providers/openai';
import { ProviderError } from '@/ai/providers/types';
import { REMOTE_VOICES, SpeechRequestSchema, type SpeechRequest } from '@/voice/voices';
import { RateLimiter, type ServerEnv } from './assistantHandler';

export interface Audio {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

export type Synthesize = (request: SpeechRequest, signal: AbortSignal) => Promise<Audio>;

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Raw 16-bit PCM → WAV, for an API that returns headerless audio. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000, channels = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

const ACCENTS: Record<string, string> = { 'en-GB': 'British', 'en-US': 'American', 'en-IN': 'Indian', 'en-AU': 'Australian', 'en-CA': 'Canadian' };

/** The synthesiser for the request's engine, or a ProviderError when its key is not configured. */
export function synthesizer(env: ServerEnv, timeoutMs = 20_000, fetchImpl?: typeof fetch): Synthesize {
  return async (request, signal) => {
    if (request.engine === 'gemini') {
      const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
      if (!apiKey) throw new ProviderError('unavailable', 'Gemini voices are not configured on this server (set GEMINI_API_KEY).');
      const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, ...(fetchImpl ? { fetch: fetchImpl } : {}) } });
      try {
        const interaction = await ai.interactions.create(
          {
            model: REMOTE_VOICES.gemini.model,
            input: [{ type: 'user_input', content: [{ type: 'text', text: request.text }] }],
            response_format: { type: 'audio', mime_type: 'audio/wav' },
            generation_config: { speech_config: [{ voice: request.voice, ...(request.language ? { language: request.language } : {}) }] },
          },
          // A spoken reply that is late is useless: fail fast and let the browser's voice speak.
          { signal, maxRetries: 0 },
        );
        const audio = interaction.output_audio;
        if (!audio?.data) throw new ProviderError('malformed_output', 'Gemini returned no audio.', true);
        const data = fromBase64(audio.data);
        // Raw PCM (audio/l16) needs a WAV header for the browser's audio element.
        return audio.mime_type?.startsWith('audio/l16') || audio.mime_type?.startsWith('audio/pcm') ? { data: pcmToWav(data, audio.sample_rate ?? 24_000, audio.channels ?? 1), mimeType: 'audio/wav' } : { data, mimeType: audio.mime_type ?? 'audio/wav' };
      } catch (e) {
        throw geminiError(e);
      }
    }
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new ProviderError('unavailable', 'ChatGPT voices are not configured on this server (set OPENAI_API_KEY).');
    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: timeoutMs, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
    const accent = request.language ? ACCENTS[request.language] : undefined;
    try {
      const res = await client.chat.completions.create(
        {
          model: REMOTE_VOICES.openai.model,
          modalities: ['text', 'audio'],
          audio: { voice: request.voice, format: 'wav' },
          store: false,
          messages: [
            { role: 'system', content: `You are a text-to-speech engine. Read the user's message aloud exactly as written, word for word, in a friendly, natural tone${accent ? ` with a ${accent} English accent` : ''}. Do not answer it, add to it or change it.` },
            { role: 'user', content: request.text },
          ],
        },
        { signal },
      );
      const data = res.choices[0]?.message.audio?.data;
      if (!data) throw new ProviderError('malformed_output', 'OpenAI returned no audio.', true);
      return { data: fromBase64(data), mimeType: 'audio/wav' };
    } catch (e) {
      throw openaiError(e);
    }
  };
}

export interface SpeechHandlerOptions {
  env: ServerEnv;
  limiter?: RateLimiter;
  /** Overrides synthesis (tests). */
  synthesize?: Synthesize;
  log?: (entry: Record<string, unknown>) => void;
  clientKey?: (req: Request) => string;
}

const fail = (status: number, code: string, message: string, retryAfterSeconds?: number) =>
  new Response(JSON.stringify({ ok: false, error: { code, message, retryable: status === 429 || status >= 500, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : {}) },
  });

export function createSpeechHandler(options: SpeechHandlerOptions): (req: Request) => Promise<Response> {
  // Spoken replies are short and frequent: allow more than the assistant's own limit.
  const limiter = options.limiter ?? new RateLimiter(Number(options.env.ASSISTANT_RATE_LIMIT) * 3 || 90, 60_000);
  const log = options.log ?? ((entry) => console.info(JSON.stringify({ event: 'speech', ...entry })));
  const clientKey = options.clientKey ?? ((req) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local');
  const synthesize = options.synthesize ?? synthesizer(options.env);

  return async (req) => {
    const started = Date.now();
    if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
    const origin = req.headers.get('origin');
    if (origin && new URL(req.url).host !== new URL(origin).host) return fail(403, 'bad_request', 'Cross-origin requests are not allowed.');
    const wait = limiter.check(clientKey(req));
    if (wait) return fail(429, 'rate_limited', `Too many requests. Try again in ${wait} s.`, wait);
    const text = await req.text();
    if (text.length > 4_000) return fail(413, 'bad_request', 'The request is too large.');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail(400, 'bad_request', 'The request is not valid JSON.');
    }
    const parsed = SpeechRequestSchema.safeParse(raw);
    if (!parsed.success) return fail(400, 'bad_request', `Invalid request: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    try {
      const audio = await synthesize(parsed.data, req.signal);
      log({ status: 200, engine: parsed.data.engine, voice: parsed.data.voice, chars: parsed.data.text.length, bytes: audio.data.length, ms: Date.now() - started });
      return new Response(audio.data, { status: 200, headers: { 'content-type': audio.mimeType, 'cache-control': 'no-store' } });
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('provider_error', 'Speech failed.', true);
      const status = pe.code === 'rate_limited' ? 429 : pe.code === 'timeout' ? 504 : pe.code === 'unavailable' ? 503 : pe.code === 'bad_request' ? 400 : 502;
      log({ status, engine: parsed.data.engine, error: pe.code, ms: Date.now() - started });
      return fail(status, pe.code, pe.message, pe.retryAfterSeconds);
    }
  };
}
