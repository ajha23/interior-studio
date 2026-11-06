/**
 * Reads and writes for Settings → Members (spec 042, FR-009). Everything goes through the user's own
 * session, so row-level security decides: members see members, owners and admins see invites and
 * change roles, nobody can make or touch an owner.
 */
import { supabase, type AppSupabaseClient } from '@/infrastructure/supabase/client';
import type { OrgRole } from '@/features/auth/sessionContext';

export type AssignableRole = Exclude<OrgRole, 'owner'>;

export interface Member {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: OrgRole;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedAt: string;
}

export type Result = { ok: true } | { ok: false; message: string };

export interface MembersApi {
  listMembers(orgId: string): Promise<Member[]>;
  listInvites(orgId: string): Promise<PendingInvite[]>;
  invite(orgId: string, email: string, role: AssignableRole, invitedBy: string): Promise<Result>;
  changeRole(orgId: string, userId: string, role: AssignableRole): Promise<Result>;
}

/** Turns database errors into sentences a studio owner can act on. */
export function inviteErrorMessage(e: { code?: string; message?: string }): string {
  if (e.code === '23505' && e.message === 'already a member') return 'Already a member. Change their role in the list instead.';
  if (e.code === '23505') return 'Already invited. They join when they sign in with Google using that address.';
  if (e.code === '42501') return 'Only owners and admins can invite.';
  return e.message ?? 'The invite could not be sent.';
}

export function createMembersApi(client: AppSupabaseClient | null = supabase): MembersApi {
  const db = () => {
    if (!client) throw new Error('Supabase is not configured.');
    return client;
  };

  return {
    async listMembers(orgId) {
      const { data: rows, error } = await db().from('org_members').select('user_id, role, created_at').eq('org_id', orgId).order('created_at');
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      // org_members.user_id references auth.users, not profiles, so profiles are a second query.
      const { data: profiles, error: pErr } = await db().from('profiles').select('id, email, full_name, avatar_url').in('id', ids);
      if (pErr) throw pErr;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => {
        const p = byId.get(r.user_id);
        const email = p?.email ?? '';
        return { userId: r.user_id, name: p?.full_name || email || 'Unknown member', email, avatarUrl: p?.avatar_url ?? null, role: r.role as OrgRole };
      });
    },

    async listInvites(orgId) {
      const { data, error } = await db().from('org_invites').select('id, email, role, created_at').eq('org_id', orgId).is('accepted_at', null).order('created_at');
      if (error) throw error;
      return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role as OrgRole, invitedAt: i.created_at }));
    },

    async invite(orgId, email, role, invitedBy) {
      const { error } = await db().from('org_invites').insert({ org_id: orgId, email: email.trim().toLowerCase(), role, invited_by: invitedBy });
      return error ? { ok: false, message: inviteErrorMessage(error) } : { ok: true };
    },

    async changeRole(orgId, userId, role) {
      const { data, error } = await db().from('org_members').update({ role }).eq('org_id', orgId).eq('user_id', userId).select('user_id');
      if (error) return { ok: false, message: error.message };
      // Row-level security filters what it refuses: no row back means the change was not allowed.
      if (!data?.length) return { ok: false, message: 'That role cannot be changed. Owners can only be changed by the database administrator.' };
      return { ok: true };
    },
  };
}
