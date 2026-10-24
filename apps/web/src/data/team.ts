import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { OrgRoleT } from '../lib/database.types';
import { useAuth } from '../auth/AuthProvider';

export interface Member {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: OrgRoleT;
  joinedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: OrgRoleT;
  createdAt: string;
  acceptedAt: string | null;
}

export function useMembers() {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['members', activeOrg?.orgId],
    enabled: Boolean(activeOrg),
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('org_members')
        .select('user_id, role, created_at, profiles ( full_name, email, avatar_url )')
        .eq('org_id', activeOrg!.orgId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((r) => {
        const p = r.profiles as unknown as { full_name: string | null; email: string; avatar_url: string | null } | null;
        return {
          userId: r.user_id,
          name: p?.full_name ?? null,
          email: p?.email ?? '',
          avatarUrl: p?.avatar_url ?? null,
          role: r.role,
          joinedAt: r.created_at,
        };
      });
    },
  });
}

export function useInvites(enabled: boolean) {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['invites', activeOrg?.orgId],
    enabled: Boolean(activeOrg) && enabled,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('org_invites')
        .select('id, email, role, created_at, accepted_at')
        .eq('org_id', activeOrg!.orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at, acceptedAt: r.accepted_at }));
    },
  });
}

export function useInvite() {
  const qc = useQueryClient();
  const { activeOrg, session } = useAuth();
  return useMutation({
    mutationFn: async (input: { email: string; role: Exclude<OrgRoleT, 'owner'> }) => {
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
      const { error } = await supabase
        .from('org_invites')
        .insert({ org_id: activeOrg!.orgId, email, role: input.role, invited_by: session!.user.id });
      if (error) {
        if (error.code === '23505') throw new Error('That email already has an invite.');
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_invites').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  const { activeOrg } = useAuth();
  return useMutation({
    mutationFn: async (input: { userId: string; role?: Exclude<OrgRoleT, 'owner'>; remove?: boolean }) => {
      const base = supabase.from('org_members');
      const { error } = input.remove
        ? await base.delete().eq('org_id', activeOrg!.orgId).eq('user_id', input.userId)
        : await base.update({ role: input.role }).eq('org_id', activeOrg!.orgId).eq('user_id', input.userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
}
