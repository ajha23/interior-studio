/**
 * Session state for the whole app (spec 042, FR-004): who is signed in and which studios they belong
 * to. A small React context fed by Supabase's `onAuthStateChange`; no other state library.
 * The database decides what a user may do; memberships here only drive what the UI shows.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { passwordSignInEnabled, supabase, type AppSupabaseClient } from '@/infrastructure/supabase/client';
import { cleanAuthParams, rememberReturnTo, takeReturnTo } from './returnTo';
import { LAST_STUDIO_KEY, SessionContext, type Membership, type OrgRole, type SessionState, type SessionUser } from './sessionContext';

function toUser(session: Session | null): SessionUser | null {
  if (!session) return null;
  const meta = session.user.user_metadata ?? {};
  const email = session.user.email ?? '';
  const name = (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || email;
  return { id: session.user.id, email, name, avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null };
}

function message(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message;
  return 'Something went wrong. Please try again.';
}

async function loadMemberships(client: AppSupabaseClient): Promise<Membership[]> {
  // Turns any pending invites for this address into memberships; safe to call on every sign-in.
  const accepted = await client.rpc('accept_pending_invites');
  if (accepted.error) throw accepted.error;
  const { data, error } = await client.from('org_members').select('role, organizations ( id, name, slug )').order('created_at');
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const org = row.organizations as { id: string; name: string; slug: string } | null;
    return org ? [{ orgId: org.id, orgName: org.name, orgSlug: org.slug, role: row.role as OrgRole }] : [];
  });
}

function forgetLastStudio() {
  try {
    localStorage.removeItem(LAST_STUDIO_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

export function SessionProvider({ children, client = supabase }: { children: ReactNode; client?: AppSupabaseClient | null }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The user whose memberships are loaded or loading, so token refreshes do not reload them.
  const loadedFor = useRef<string | null>(null);

  const enter = useCallback(
    async (next: Session) => {
      if (!client) return;
      setSession(next);
      if (loadedFor.current === next.user.id) return;
      loadedFor.current = next.user.id;
      try {
        setMemberships(await loadMemberships(client));
        setError(null);
      } catch (e) {
        setError(message(e));
      }
      // Back from Google: drop the OAuth parameters and return to the page that was asked for,
      // before the signed-in routes render (so `#/` does not redirect away from it first).
      cleanAuthParams();
      const back = takeReturnTo();
      if (back && back !== window.location.hash) window.location.hash = back.replace(/^#/, '');
      setStatus('signed-in');
    },
    [client],
  );

  const leave = useCallback(() => {
    loadedFor.current = null;
    setSession(null);
    setMemberships([]);
    setError(null);
    setStatus('signed-out');
  }, []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void enter(data.session);
      else leave();
    });
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT' || !next) leave();
      else void enter(next);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [client, enter, leave]);

  const signInWithGoogle = useCallback(async () => {
    if (!client) return;
    rememberReturnTo(window.location.hash);
    const { error: e } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (e) setError(message(e));
  }, [client]);

  const signInWithPassword = useMemo(() => {
    if (!passwordSignInEnabled) return null;
    return async (email: string, password: string) => {
      if (!client) return;
      const { error: e } = await client.auth.signInWithPassword({ email, password });
      if (e) setError(message(e));
    };
  }, [client]);

  const signOut = useCallback(async () => {
    forgetLastStudio();
    if (client) {
      const { error: e } = await client.auth.signOut();
      if (e) setError(message(e));
    }
    leave();
    if (window.location.hash && window.location.hash !== '#/') window.location.hash = '/';
  }, [client, leave]);

  const refreshMemberships = useCallback(async () => {
    if (!client || !session) return;
    try {
      setMemberships(await loadMemberships(client));
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, [client, session]);

  const value = useMemo<SessionState>(
    () => ({ status, user: toUser(session), memberships, error, signInWithGoogle, signInWithPassword, signOut, refreshMemberships }),
    [status, session, memberships, error, signInWithGoogle, signInWithPassword, signOut, refreshMemberships],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
