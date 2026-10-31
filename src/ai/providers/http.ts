/**
 * Browser-side provider: posts the request to the app's own `/api/assistant` endpoint, which holds
 * the AI provider's key. Every reply is parsed with Zod; anything unexpected is a ProviderError.
 */
import { AssistantReplySchema, type AssistantRequest, type AssistantResponse } from '../schema';
import { ProviderStatusSchema, type AiSelection, type ProviderStatus } from './catalog';
import { ProviderError, withTimeout, type AssistantProvider, type ServedBy } from './types';

export class HttpAssistantProvider implements AssistantProvider {
  readonly id = 'server';
  /** Provider and model the server reported on its last reply. */
  lastServed: ServedBy | null = null;

  constructor(
    private readonly endpoint = '/api/assistant',
    private readonly timeoutMs = 60_000,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    /** The provider and model the designer chose (sent with every request). */
    private readonly selection: () => AiSelection | undefined = () => undefined,
  ) {}

  get model(): string | undefined {
    return this.selection()?.model;
  }

  /** Which providers the server has keys for; null when the endpoint is unreachable. */
  async status(): Promise<ProviderStatus | null> {
    try {
      const res = await this.fetchImpl(this.endpoint, { method: 'GET' });
      const parsed = ProviderStatusSchema.safeParse(await res.json());
      return res.ok && parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  respond(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse> {
    return withTimeout(async (s) => {
      let res: Response;
      try {
        res = await this.fetchImpl(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, ...(this.selection() ? { ai: this.selection() } : {}) }), signal: s });
      } catch (e) {
        if (s.aborted) throw s.reason instanceof ProviderError ? s.reason : new ProviderError('timeout', 'Cancelled.', true);
        throw new ProviderError('unavailable', `Could not reach the assistant service (${e instanceof Error ? e.message : 'network error'}).`, true);
      }
      if (res.status === 404) throw new ProviderError('unavailable', 'The assistant service is not available on this server. Switch to the offline assistant in the panel settings.', false);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new ProviderError('malformed_output', `The assistant service returned an unreadable reply (HTTP ${res.status}).`, res.status >= 500);
      }
      const reply = AssistantReplySchema.safeParse(body);
      if (!reply.success) throw new ProviderError('malformed_output', 'The assistant service returned a reply in an unexpected format.', true);
      if (!reply.data.ok) throw new ProviderError(reply.data.error.code, reply.data.error.message, reply.data.error.retryable, reply.data.error.retryAfterSeconds);
      this.lastServed = { provider: reply.data.provider, model: reply.data.model, notice: reply.data.notice };
      return reply.data.response;
    }, this.timeoutMs, signal);
  }
}
