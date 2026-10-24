import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errorMessage, supabase } from '../lib/supabase';
import type { OrgRoleT } from '../lib/database.types';

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  plan: string;
  role: OrgRoleT;
}

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  session: Session | null;
  memberships: Membership[];
  activeOrg: Membership | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setActiveOrg: (orgId: string) => void;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const ACTIVE_ORG_KEY = 'studio.activeOrg';

function readActiveOrg(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

async function loadMemberships(): Promise<Membership[]> {
  // Joining an invite turns it into a membership; safe to call on every sign-in.
  const accepted = await supabase.rpc('accept_pending_invites');
  if (accepted.error) throw accepted.error;
  const { data, error } = await supabase
    .from('org_members')
    .select('role, organizations ( id, name, slug, plan )')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const org = row.organizations as unknown as { id: string; name: string; slug: string; plan: string } | null;
    return org ? [{ orgId: org.id, orgName: org.name, orgSlug: org.slug, plan: org.plan, role: row.role }] : [];
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(readActiveOrg());
  const [error, setError] = useState<string | null>(null);

  const refreshMemberships = useCallback(async () => {
    try {
      setMemberships(await loadMemberships());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) await refreshMemberships();
      if (!cancelled) setStatus(data.session ? 'signed-in' : 'signed-out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN') {
        void refreshMemberships().then(() => setStatus('signed-in'));
      } else if (event === 'SIGNED_OUT') {
        setMemberships([]);
        setStatus('signed-out');
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshMemberships]);

  const activeOrg = useMemo(
    () => memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0] ?? null,
    [memberships, activeOrgId],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      memberships,
      activeOrg,
      error,
      async signInWithGoogle() {
        const { error: err } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
        });
        if (err) setError(errorMessage(err));
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      setActiveOrg(orgId) {
        setActiveOrgId(orgId);
        try {
          localStorage.setItem(ACTIVE_ORG_KEY, orgId);
        } catch {
          /* storage unavailable: keep in memory only */
        }
      },
      refreshMemberships,
    }),
    [status, session, memberships, activeOrg, error, refreshMemberships],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function canEdit(role: OrgRoleT | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'designer';
}

export function canAdmin(role: OrgRoleT | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
