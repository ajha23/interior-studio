/**
 * A small fake of the Supabase client surface the session code uses, for unit tests only.
 * It records calls so tests can assert what the provider did.
 */
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';

type Listener = (event: string, session: FakeSession | null) => void;

export interface FakeSession {
  access_token: string;
  user: { id: string; email: string; user_metadata: Record<string, unknown> };
}

export interface FakeMembershipRow {
  role: 'owner' | 'admin' | 'designer' | 'viewer';
  organizations: { id: string; name: string; slug: string; plan: string } | null;
}

export function fakeSession(id = 'u-1', email = 'designer.a@example.test', name = 'Alpha Designer'): FakeSession {
  return { access_token: 'token', user: { id, email, user_metadata: { full_name: name } } };
}

export function createFakeClient(options: { session?: FakeSession | null; memberships?: FakeMembershipRow[]; membershipError?: string } = {}) {
  let session = options.session ?? null;
  const listeners = new Set<Listener>();
  const calls: string[] = [];

  const emit = (event: string, next: FakeSession | null) => {
    session = next;
    for (const l of listeners) l(event, next);
  };

  const client = {
    auth: {
      getSession: async () => {
        calls.push('getSession');
        return { data: { session }, error: null };
      },
      onAuthStateChange: (cb: Listener) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithOAuth: async (args: unknown) => {
        calls.push(`signInWithOAuth:${JSON.stringify(args)}`);
        return { data: {}, error: null };
      },
      signInWithPassword: async ({ email }: { email: string; password: string }) => {
        calls.push(`signInWithPassword:${email}`);
        const next = fakeSession('u-pw', email, email);
        emit('SIGNED_IN', next);
        return { data: { session: next }, error: null };
      },
      signOut: async () => {
        calls.push('signOut');
        emit('SIGNED_OUT', null);
        return { error: null };
      },
    },
    rpc: async (fn: string) => {
      calls.push(`rpc:${fn}`);
      return { data: 0, error: null };
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          order: async () => {
            calls.push(`select:${table}:${columns}:${column}=${value}`);
            if (options.membershipError) return { data: null, error: { message: options.membershipError } };
            return { data: options.memberships ?? [], error: null };
          },
        }),
      }),
    }),
  };

  return { client: client as unknown as AppSupabaseClient, calls, emit };
}
