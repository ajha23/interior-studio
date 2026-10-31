/**
 * Google Gemini adapter for the shared tool loop (toolLoop.ts), using the official @google/genai SDK.
 * Server-only: the key comes from the server environment. The model's own turns are replayed as the
 * API returned them, so thought signatures on parts go back unchanged (required for tool use with
 * thinking models). Tool schemas are sent as full JSON Schema (`parametersJsonSchema`).
 */
import { ApiError, FinishReason, FunctionCallingConfigMode, GoogleGenAI, type Content, type GenerateContentResponse, type Part } from '@google/genai';
import type { HistoryTurn } from '../schema';
import { ToolLoopProvider, type ModelAdapter, type ModelSession, type ModelTurn, type ToolDef, type ToolResult } from './toolLoop';
import { ProviderError } from './types';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxSteps: number;
  /** HTTP transport override (tests). */
  fetch?: typeof fetch;
}

const REFUSALS = new Set<string>([FinishReason.SAFETY, FinishReason.BLOCKLIST, FinishReason.PROHIBITED_CONTENT, FinishReason.SPII, FinishReason.RECITATION, FinishReason.IMAGE_SAFETY, FinishReason.IMAGE_PROHIBITED_CONTENT]);

export class GeminiAdapter implements ModelAdapter {
  readonly id = 'gemini';
  readonly model: string;
  private readonly ai: GoogleGenAI;

  constructor(config: GeminiConfig) {
    this.model = config.model;
    this.ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: config.timeoutMs, ...(config.fetch ? { fetch: config.fetch } : {}) } });
  }

  open(input: { system: string; history: HistoryTurn[]; userParts: string[]; tools: ToolDef[] }, signal?: AbortSignal): ModelSession {
    const contents: Content[] = [];
    // Gemini wants alternating turns starting with the user: merge neighbours of the same role.
    const add = (role: 'user' | 'model', parts: Part[]) => {
      const last = contents.at(-1);
      if (last && last.role === role) last.parts = [...(last.parts ?? []), ...parts];
      else contents.push({ role, parts });
    };
    if (input.history[0]?.role === 'assistant') add('user', [{ text: '(conversation continues)' }]);
    for (const turn of input.history) add(turn.role === 'user' ? 'user' : 'model', [{ text: turn.text || '(empty)' }]);
    add('user', input.userParts.map((text) => ({ text })));
    const tools = [{ functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }];
    let pendingIds: { id: string; sent: string | undefined }[] = [];

    return {
      next: async (results: ToolResult[] | null, remainingMs: number): Promise<ModelTurn> => {
        if (results) {
          add(
            'user',
            results.map((r) => {
              const sent = pendingIds.find((p) => p.id === r.id)?.sent;
              return { functionResponse: { ...(sent ? { id: sent } : {}), name: r.name, response: r.isError ? { error: r.content } : { output: r.content } } };
            }),
          );
        }
        let res: GenerateContentResponse;
        try {
          res = await this.ai.models.generateContent({
            model: this.model,
            contents,
            config: {
              systemInstruction: input.system,
              tools,
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
              maxOutputTokens: 8192,
              abortSignal: signal,
              httpOptions: { timeout: Math.max(1000, remainingMs) },
            },
          });
        } catch (e) {
          throw toProviderError(e);
        }
        if (res.promptFeedback?.blockReason) return { text: '', calls: [], stop: 'refusal' };
        const candidate = res.candidates?.[0];
        const finish = candidate?.finishReason ?? '';
        if (REFUSALS.has(finish)) return { text: '', calls: [], stop: 'refusal' };
        const content = candidate?.content;
        // Replay the model's turn exactly as returned (thought signatures included).
        if (content?.parts?.length) contents.push({ role: 'model', parts: content.parts });
        const parts = content?.parts ?? [];
        const calls = parts
          .filter((p) => p.functionCall?.name)
          .map((p, i) => ({ id: p.functionCall!.id ?? `${p.functionCall!.name}-${contents.length}-${i}`, sent: p.functionCall!.id, name: p.functionCall!.name!, input: p.functionCall!.args ?? {} }));
        pendingIds = calls.map((c) => ({ id: c.id, sent: c.sent }));
        const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n');
        const stop = finish === FinishReason.MAX_TOKENS ? 'max_tokens' : calls.length ? 'tool_use' : 'end';
        return { text, calls: calls.map(({ id, name, input }) => ({ id, name, input })), stop };
      },
    };
  }
}

export class GeminiProvider extends ToolLoopProvider {
  constructor(config: GeminiConfig) {
    super(new GeminiAdapter(config), { timeoutMs: config.timeoutMs, maxSteps: config.maxSteps });
  }
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  // generateContent throws ApiError; the Interactions API (speech) throws its own error class. Both carry the HTTP status.
  const raw = e instanceof ApiError ? e.status : e instanceof Error ? (e as Error & { status?: unknown }).status : undefined;
  const status = typeof raw === 'number' ? raw : undefined;
  if (status === undefined) {
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError' || /aborted|timed? ?out/i.test(e.message))) return new ProviderError('timeout', 'The AI provider did not respond in time.', true);
    return new ProviderError('unavailable', 'Could not reach Gemini.', true);
  }
  const message = e instanceof Error ? e.message : '';
  if (status === 429) return new ProviderError('rate_limited', 'Gemini is rate-limiting requests or the quota is used up. Try again shortly.', true, retryAfter(message));
  if (status === 401 || status === 403) return new ProviderError('unavailable', 'Gemini rejected the server’s credentials.', false);
  if (status === 404) return new ProviderError('provider_error', 'That Gemini model is not available to this API key.', false);
  if (status === 400) return new ProviderError('provider_error', 'Gemini rejected the request.', false);
  if (status >= 500) return new ProviderError('provider_error', 'Gemini is having problems (overloaded or down). Try again shortly.', true);
  return new ProviderError('provider_error', `Gemini returned an error (${status}).`, false);
}

/** Gemini puts a retry delay like "retryDelay": "17s" in 429 error details. */
function retryAfter(message: string): number | undefined {
  const m = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(message);
  return m ? Math.ceil(Number(m[1])) : undefined;
}
