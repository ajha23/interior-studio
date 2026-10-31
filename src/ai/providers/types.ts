/**
 * The provider boundary. A provider turns a request (message, conversation, compact project state)
 * into an `AssistantResponse`. Implementations: the deterministic rule-based provider (`rules.ts`,
 * for local development, tests and offline use), the Anthropic adapter (`anthropic.ts`, server-only,
 * holds the API key) and the HTTP client (`http.ts`, browser → `/api/assistant`).
 */
import type { AssistantRequest, AssistantResponse, ProviderErrorCode } from '../schema';

export interface ServedBy {
  provider: string;
  model?: string;
  /** Why a different provider answered, e.g. the chosen one has no key on the server. */
  notice?: string;
}

export interface AssistantProvider {
  readonly id: string;
  readonly model?: string;
  /** Which provider and model actually answered the last request (a server may substitute). */
  readonly lastServed?: ServedBy | null;
  respond(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Rejects with a `timeout` ProviderError when `ms` passes or the signal aborts first. */
export function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new ProviderError('timeout', `The assistant did not answer within ${Math.round(ms / 1000)} s.`, true));
      reject(new ProviderError('timeout', `The assistant did not answer within ${Math.round(ms / 1000)} s.`, true));
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  });
}
