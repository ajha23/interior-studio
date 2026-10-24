import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sceneHash } from '@studio/core';
import { supabase } from '../lib/supabase';
import type { Json, ProjectRow, ProjectStatusT, ProjectVersionRow, VersionKindT } from '../lib/database.types';
import { useAuth } from '../auth/AuthProvider';

export type ProjectSummary = Pick<
  ProjectRow,
  'id' | 'name' | 'client_name' | 'site_address' | 'status' | 'updated_at' | 'current_version_no' | 'archived_at'
> & { updated_by_name: string | null };

export type VersionSummary = Pick<
  ProjectVersionRow,
  'id' | 'version_no' | 'kind' | 'message' | 'created_at' | 'size_bytes' | 'scene_hash' | 'schema_version'
> & { author: string | null };

const keys = {
  projects: (orgId: string) => ['projects', orgId] as const,
  project: (id: string) => ['project', id] as const,
  versions: (id: string) => ['versions', id] as const,
};

export function useProjects(opts: { includeArchived?: boolean } = {}) {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: [...keys.projects(activeOrg?.orgId ?? 'none'), opts.includeArchived ?? false],
    enabled: Boolean(activeOrg),
    queryFn: async (): Promise<ProjectSummary[]> => {
      let q = supabase
        .from('projects')
        .select('id, name, client_name, site_address, status, updated_at, current_version_no, archived_at, updater:profiles!projects_updated_by_fkey ( full_name, email )')
        .eq('org_id', activeOrg!.orgId)
        .order('updated_at', { ascending: false });
      if (!opts.includeArchived) q = q.is('archived_at', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const u = row.updater as unknown as { full_name: string | null; email: string } | null;
        const { updater: _ignored, ...rest } = row as typeof row & { updater: unknown };
        return { ...rest, updated_by_name: u ? u.full_name ?? u.email : null };
      });
    },
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.project(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Latest saved scene for a project, or null when nothing has been saved yet. */
export async function fetchLatestScene(project: ProjectRow): Promise<ProjectVersionRow | null> {
  if (!project.current_version_id) return null;
  const { data, error } = await supabase
    .from('project_versions')
    .select('*')
    .eq('id', project.current_version_id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchVersion(versionId: string): Promise<ProjectVersionRow> {
  const { data, error } = await supabase.from('project_versions').select('*').eq('id', versionId).single();
  if (error) throw error;
  return data;
}

export function useVersions(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.versions(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<VersionSummary[]> => {
      const { data, error } = await supabase
        .from('project_versions')
        .select('id, version_no, kind, message, created_at, size_bytes, scene_hash, schema_version, author:profiles!project_versions_created_by_fkey ( full_name, email )')
        .eq('project_id', projectId!)
        .order('version_no', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const a = row.author as unknown as { full_name: string | null; email: string } | null;
        return { ...row, author: a ? a.full_name ?? a.email : null };
      });
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const { activeOrg, session } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; client_name: string; site_address: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...input, org_id: activeOrg!.orgId, created_by: session!.user.id })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: { name?: string; client_name?: string; site_address?: string; status?: ProjectStatusT; archived_at?: string | null };
    }) => {
      const { error } = await supabase.from('projects').update(input.patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: keys.project(v.id) });
    },
  });
}

export interface SaveSceneInput {
  projectId: string;
  scene: unknown;
  schemaVersion: number;
  kind: VersionKindT;
  message?: string;
}

/** Persist a new immutable version. Returns null when the scene is unchanged since the last save. */
export async function saveScene(input: SaveSceneInput, lastHash: string | null): Promise<ProjectVersionRow | null> {
  const hash = await sceneHash(input.scene);
  if (hash === lastHash && input.kind === 'autosave') return null;
  const { data, error } = await supabase.rpc('save_project_version', {
    p_project: input.projectId,
    p_scene: JSON.parse(JSON.stringify(input.scene)) as Json,
    p_schema_version: input.schemaVersion,
    p_scene_hash: hash,
    p_kind: input.kind,
    p_message: input.message ?? '',
  });
  if (error) throw error;
  return data;
}
