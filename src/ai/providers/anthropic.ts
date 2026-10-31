/**
 * Anthropic (Claude) adapter for the shared tool loop (toolLoop.ts). Server-only: imported by the
 * `/api/assistant` handler, never by the browser bundle; the key comes from the server environment.
 * The assistant's own message history is kept as the API returned it (thinking blocks included).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { HistoryTurn } from '../schema';
import { ToolLoopProvider, type ModelAdapter, type ModelSession, type ModelTurn, type ToolDef, type ToolResult } from './toolLoop';
import { ProviderError } from './types';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  /** Upper bound for the whole tool loop. */
  timeoutMs: number;
  maxSteps: number;
  /** Server-side refusal fallback (`fallbacks: "default"`) where the model supports it; on by default. */
  fallbacks: boolean;
  effort: 'low' | 'medium' | 'high';
  /** HTTP transport override (tests). */
  fetch?: typeof fetch;
}

/** Models that accept the server-side `fallbacks: "default"` refusal fallback. */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export class AnthropicAdapter implements ModelAdapter {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicConfig) {
    this.model = config.model;
    this.client = new Anthropic({ apiKey: config.apiKey, maxRetries: config.fetch ? 0 : 1, timeout: config.timeoutMs, ...(config.fetch ? { fetch: config.fetch } : {}) });
  }

  open(input: { system: string; history: HistoryTurn[]; userParts: string[]; tools: ToolDef[] }, signal?: AbortSignal): ModelSession {
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const turn of input.history) messages.push({ role: turn.role, content: turn.text || '(empty)' });
    messages.push({ role: 'user', content: input.userParts.map((text) => ({ type: 'text' as const, text })) });
    // History always starts with a user turn; consecutive same-role turns are merged by the API.
    if (messages[0]?.role === 'assistant') messages.unshift({ role: 'user', content: '(conversation continues)' });
    const tools: Anthropic.Tool[] = input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Tool['input_schema'] }));
    const fallbacks = this.config.fallbacks && FALLBACK_MODELS.has(this.model);
    return {
      next: async (results: ToolResult[] | null, remainingMs: number): Promise<ModelTurn> => {
        if (results) messages.push({ role: 'user', content: results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })) });
        let message: Anthropic.Beta.BetaMessage;
        try {
          message = await this.client.beta.messages.create(
            {
              model: this.model,
              max_tokens: 8000,
              system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
              tools,
              tool_choice: { type: 'auto' },
              thinking: { type: 'adaptive' },
              output_config: { effort: this.config.effort },
              messages,
              ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
            },
            { signal, timeout: remainingMs },
          );
        } catch (e) {
          throw toProviderError(e);
        }
        messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
        const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
        const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n');
        const stop = message.stop_reason === 'refusal' ? 'refusal' : message.stop_reason === 'max_tokens' ? 'max_tokens' : calls.length ? 'tool_use' : 'end';
        return { text, calls, stop };
      },
    };
  }
}

/** The Anthropic adapter inside the shared tool loop. */
export class AnthropicProvider extends ToolLoopProvider {
  constructor(config: AnthropicConfig) {
    super(new AnthropicAdapter(config), { timeoutMs: config.timeoutMs, maxSteps: config.maxSteps });
  }
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError('timeout', 'The request was cancelled.', true);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout', 'The AI provider did not respond in time.', true);
  if (e instanceof Anthropic.RateLimitError) {
    const after = Number(e.headers?.get('retry-after'));
    return new ProviderError('rate_limited', 'The AI provider is rate-limiting requests. Try again shortly.', true, Number.isFinite(after) ? after : undefined);
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ProviderError('unavailable', 'The AI provider rejected the server’s credentials.', false);
  if (e instanceof Anthropic.BadRequestError) return new ProviderError('provider_error', 'The AI provider rejected the request.', false);
  if (e instanceof Anthropic.InternalServerError) return new ProviderError('provider_error', 'The AI provider is having problems (overloaded or down). Try again shortly.', true);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('unavailable', 'Could not reach the AI provider.', true);
  if (e instanceof Anthropic.APIError) return new ProviderError('provider_error', `The AI provider returned an error (${e.status ?? 'unknown'}).`, (e.status ?? 500) >= 500);
  return new ProviderError('provider_error', 'The assistant failed unexpectedly.', true);
}
