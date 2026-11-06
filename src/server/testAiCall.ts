/**
 * Test-only fakes for the AI gate (spec 045): a verifier and a database client that record what the
 * handlers ask for. Handler tests use `allowAiCall()` to test their own logic, and the refusing
 * variants to prove the provider is never reached.
 */
import type { AiCallDeps, RpcClient, VerifyResult } from './aiCall';

export const TEST_STUDIO = 'aaaaaaaa-0000-4000-8000-000000000000';
export const TEST_AI_ENV = { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'anon-key' };
export const AUTH_HEADERS = { authorization: 'Bearer test-token', 'x-studio-id': TEST_STUDIO };

type RpcError = { code?: string; message: string; hint?: string | null };

export interface FakeAiCall {
  deps: Pick<AiCallDeps, 'verify' | 'clientFor'>;
  /** Every database call the handler caused, in order. */
  calls: { fn: string; args: Record<string, unknown> }[];
  /** The ops charged, in order. */
  charged: () => string[];
  /** The `p_ok` of each finished job, in order. */
  finished: () => boolean[];
}

export function fakeAiCall(options: { verify?: VerifyResult; startError?: RpcError; balance?: number } = {}): FakeAiCall {
  const calls: FakeAiCall['calls'] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'ai_start_call') {
        if (options.startError) return { data: null, error: options.startError };
        return { data: { job_id: `job-${calls.length}`, finish_token: 'token', balance: options.balance ?? 499, cost: 1 }, error: null };
      }
      return { data: args.p_ok ? 'succeeded' : 'failed', error: null };
    },
  };
  return {
    deps: { verify: async () => options.verify ?? { kind: 'ok', userId: 'user-1' }, clientFor: () => client },
    calls,
    charged: () => calls.filter((c) => c.fn === 'ai_start_call').map((c) => String(c.args.p_op)),
    finished: () => calls.filter((c) => c.fn === 'ai_finish_call').map((c) => c.args.p_ok === true),
  };
}

/** A signed-in designer of the test studio with credits. */
export const allowAiCall = () => fakeAiCall();
