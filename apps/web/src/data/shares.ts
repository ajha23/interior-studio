import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { ShareLinkRow } from '../lib/database.types';

export type ShareLink = Pick<ShareLinkRow, 'id' | 'token' | 'label' | 'version_id' | 'show_plan' | 'show_renders' | 'expires_at' | 'revoked_at' | 'view_count' | 'last_viewed_at' | 'created_at'>;

export function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}

export function useShareLinks(projectId: string) {
  return useQuery({
    queryKey: ['shares', projectId],
    queryFn: async (): Promise<ShareLink[]> => {
      const { data, error } = await supabase
        .from('share_links')
        .select('id, token, label, version_id, show_plan, show_renders, expires_at, revoked_at, view_count, last_viewed_at, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateShareLink(projectId: string) {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; versionId: string | null; showPlan: boolean; showRenders: boolean; expiresInDays: number | null }) => {
      if (!activeOrg) throw new Error('No studio selected.');
      const expires_at = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : null;
      const { data, error } = await supabase
        .from('share_links')
        .insert({ org_id: activeOrg.orgId, project_id: projectId, label: input.label.slice(0, 120), version_id: input.versionId, show_plan: input.showPlan, show_renders: input.showRenders, expires_at })
        .select('token')
        .single();
      if (error) throw error;
      return data.token;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', projectId] }),
  });
}

export function useRevokeShareLink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', projectId] }),
  });
}

export interface SharedDesign {
  label: string;
  studio: string;
  project: { name: string; client: string };
  version: { no: number; savedAt: string; pinned: boolean };
  schemaVersion: number;
  scene: unknown;
  showPlan: boolean;
  renders: { url: string; width: number; height: number; caption: string; createdAt: string }[];
  models: Record<string, string>;
}

/** Public: resolve a share token without signing in. */
export async function fetchSharedDesign(token: string): Promise<SharedDesign | null> {
  const { data, error } = await supabase.functions.invoke<SharedDesign>('share', { body: { token } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 404) return null;
    throw error;
  }
  return data;
}
