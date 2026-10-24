import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { LIGHTING_PRESETS, type LightingPreset } from '@studio/core';

export interface SavedRender {
  id: string;
  url: string | null;
  storagePath: string;
  width: number;
  height: number;
  samples: number;
  mood: LightingPreset;
  kind: 'still' | 'panorama' | 'ai';
  caption: string;
  versionNo: number;
  createdAt: string;
}

const BUCKET = 'renders';

export function useRenders(projectId: string) {
  return useQuery({
    queryKey: ['renders', projectId],
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<SavedRender[]> => {
      const { data, error } = await supabase.from('renders').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
      if (error) throw error;
      const signed = data.length ? await supabase.storage.from(BUCKET).createSignedUrls(data.map((r) => r.storage_path), 3600) : { data: [] };
      const urlOf = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
      return data.map((r) => ({
        id: r.id,
        url: urlOf.get(r.storage_path) ?? null,
        storagePath: r.storage_path,
        width: r.width,
        height: r.height,
        samples: r.samples,
        mood: (r.mood in LIGHTING_PRESETS ? r.mood : 'daylight') as LightingPreset,
        kind: r.kind === 'panorama' ? 'panorama' : r.kind === 'ai' ? 'ai' : 'still',
        caption: r.caption,
        versionNo: r.version_no,
        createdAt: r.created_at,
      }));
    },
  });
}

export function useSaveRender(projectId: string) {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { blob: Blob; width: number; height: number; samples: number; mood: LightingPreset; kind: 'still' | 'panorama'; caption: string; versionNo: number }) => {
      if (!activeOrg) throw new Error('No studio selected.');
      const id = crypto.randomUUID();
      const jpeg = r.blob.type === 'image/jpeg';
      const path = `${activeOrg.orgId}/${projectId}/${id}.${jpeg ? 'jpg' : 'png'}`;
      const up = await supabase.storage.from(BUCKET).upload(path, r.blob, { contentType: r.blob.type || 'image/png', upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from('renders').insert({
        id,
        org_id: activeOrg.orgId,
        project_id: projectId,
        version_no: r.versionNo,
        storage_path: path,
        width: r.width,
        height: r.height,
        samples: r.samples,
        mood: r.mood,
        kind: r.kind,
        caption: r.caption.slice(0, 200),
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['renders', projectId] }),
  });
}

export function useDeleteRender(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: SavedRender) => {
      const { error } = await supabase.from('renders').delete().eq('id', r.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([r.storagePath]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['renders', projectId] }),
  });
}
