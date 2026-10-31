/**
 * OpenAI adapter for the shared tool loop (toolLoop.ts), using the Responses API through the
 * official SDK. Server-only: the key comes from the server environment. Requests are stateless
 * (`store: false`); reasoning items come back encrypted and are passed back with the tool results,
 * as reasoning models require.
 */
import OpenAI from 'openai';
import type { HistoryTurn } from '../schema';
import { ToolLoopProvider, type ModelAdapter, type ModelSession, type ModelTurn, type ToolDef, type ToolResult } from './toolLoop';
import { ProviderError } from './types';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxSteps: number;
  effort: 'low' | 'medium' | 'high';
  /** HTTP transport override (tests). */
  fetch?: typeof fetch;
}

export class OpenAIAdapter implements ModelAdapter {
  readonly id = 'openai';
  readonly model: string;
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIConfig) {
    this.model = config.model;
    this.client = new OpenAI({ apiKey: config.apiKey, maxRetries: config.fetch ? 0 : 1, timeout: config.timeoutMs, ...(config.fetch ? { fetch: config.fetch } : {}) });
  }

  open(input: { system: string; history: HistoryTurn[]; userParts: string[]; tools: ToolDef[] }, signal?: AbortSignal): ModelSession {
    const items: OpenAI.Responses.ResponseInputItem[] = input.history.map((t) => ({ role: t.role, content: t.text || '(empty)' }));
    items.push({ role: 'user', content: input.userParts.map((text) => ({ type: 'input_text' as const, text })) });
    const tools: OpenAI.Responses.FunctionTool[] = input.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.schema, strict: false }));
    return {
      next: async (results: ToolResult[] | null, remainingMs: number): Promise<ModelTurn> => {
        if (results) for (const r of results) items.push({ type: 'function_call_output', call_id: r.id, output: r.isError ? `ERROR: ${r.content}` : r.content });
        let res: OpenAI.Responses.Response;
        try {
          res = await this.client.responses.create(
            {
              model: this.model,
              instructions: input.system,
              input: items,
              tools,
              tool_choice: 'auto',
              store: false,
              include: ['reasoning.encrypted_content'],
              reasoning: { effort: this.config.effort },
              max_output_tokens: 8000,
            },
            { signal, timeout: Math.max(1000, remainingMs) },
          );
        } catch (e) {
          throw toProviderError(e);
        }
        // Pass the whole turn back next time (reasoning, messages and calls), as received.
        items.push(...(res.output as unknown as OpenAI.Responses.ResponseInputItem[]));
        const refused = res.output.some((o) => o.type === 'message' && o.content.some((c) => c.type === 'refusal')) || res.incomplete_details?.reason === 'content_filter';
        if (refused) return { text: '', calls: [], stop: 'refusal' };
        const calls = res.output
          .filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call')
          .map((o) => ({ id: o.call_id, name: o.name, input: parseArguments(o.arguments) }));
        const stop = res.status === 'incomplete' && res.incomplete_details?.reason === 'max_output_tokens' ? 'max_tokens' : calls.length ? 'tool_use' : 'end';
        return { text: res.output_text ?? '', calls, stop };
      },
    };
  }
}

/** Tool arguments arrive as a JSON string; invalid JSON is passed on so validation reports it. */
function parseArguments(args: string): unknown {
  try {
    return JSON.parse(args);
  } catch {
    return { __invalid_json: args.slice(0, 200) };
  }
}

export class OpenAIProvider extends ToolLoopProvider {
  constructor(config: OpenAIConfig) {
    super(new OpenAIAdapter(config), { timeoutMs: config.timeoutMs, maxSteps: config.maxSteps });
  }
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof OpenAI.APIUserAbortError) return new ProviderError('timeout', 'The request was cancelled.', true);
  if (e instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError('timeout', 'OpenAI did not respond in time.', true);
  if (e instanceof OpenAI.RateLimitError) {
    const after = Number(e.headers?.get('retry-after'));
    return new ProviderError('rate_limited', 'OpenAI is rate-limiting requests or the quota is used up. Try again shortly.', true, Number.isFinite(after) && after > 0 ? after : undefined);
  }
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) return new ProviderError('unavailable', 'OpenAI rejected the server’s credentials.', false);
  if (e instanceof OpenAI.NotFoundError) return new ProviderError('provider_error', 'That OpenAI model is not available to this API key.', false);
  if (e instanceof OpenAI.BadRequestError) return new ProviderError('provider_error', 'OpenAI rejected the request.', false);
  if (e instanceof OpenAI.InternalServerError) return new ProviderError('provider_error', 'OpenAI is having problems (overloaded or down). Try again shortly.', true);
  if (e instanceof OpenAI.APIConnectionError) return new ProviderError('unavailable', 'Could not reach OpenAI.', true);
  if (e instanceof OpenAI.APIError) return new ProviderError('provider_error', `OpenAI returned an error (${e.status ?? 'unknown'}).`, (e.status ?? 500) >= 500);
  return new ProviderError('provider_error', 'The assistant failed unexpectedly.', true);
}
