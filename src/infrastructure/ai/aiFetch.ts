/**
 * `fetch` for the app's AI endpoints (spec 045, FR-010): adds the signed-in user's access token and
 * the paying studio, and records the balance the server reports. Without a session or a paying
 * studio, nothing is sent. The server verifies the token and charges the studio; this only carries them.
 */
import { AI_UNAVAILABLE } from '@/features/ai/aiAccess';
import { getPayingStudio, setPayingBalance } from '@/features/ai/payingStudio';
import { supabase } from '@/infrastructure/supabase/client';

/** AI cannot be called yet; the message says why and is safe to show. */
export class AiNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiNotReadyError';
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createAiFetch(deps: { getToken: () => Promise<string | null>; fetchImpl: Fetch }): Fetch {
  return async (input, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const token = await deps.getToken();
    if (!token) throw new AiNotReadyError('Sign in to use AI.');
    const payer = getPayingStudio();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    if (method !== 'GET') {
      if (!payer) throw new AiNotReadyError(AI_UNAVAILABLE.noStudio);
      if (payer.role === 'viewer') throw new AiNotReadyError(AI_UNAVAILABLE.viewer);
      headers.set('x-studio-id', payer.orgId);
    }
    const res = await deps.fetchImpl(input, { ...init, headers });
    const credits = res.headers.get('x-ai-credits');
    if (payer && credits !== null && Number.isFinite(Number(credits))) setPayingBalance(payer.orgId, Number(credits));
    return res;
  };
}

/** The app's AI fetch: the session token comes from supabase-js, which refreshes it when needed. */
export const aiFetch: Fetch = createAiFetch({
  getToken: async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  fetchImpl: (input, init) => fetch(input, init),
});
