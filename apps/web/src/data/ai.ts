import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export const AI_COST = { image: 2, model: 10, textModelExtra: 2 } as const;

export type AiImageOp = 'enhance' | 'restyle' | 'style_transfer' | 'clear_room' | 'sketch_to_render' | 'edit';
export interface AiImageRef {
  renderId?: string;
  aiPath?: string;
}

/** Edge functions answer errors as { error, message }; surface the message. */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = error.message;
    try {
      const j = ctx ? await ctx.json() : null;
      if (j?.message) msg = j.message;
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  return data as T;
}

export function useCredits() {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['ai-credits', activeOrg?.orgId ?? 'none'],
    enabled: Boolean(activeOrg),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_credit_balance', { p_org: activeOrg!.orgId });
      if (error) throw error;
      return data as number;
    },
  });
}

/** Upload a photo or sketch for AI use; returns its path in the studio's `ai` bucket. */
export async function uploadAiSource(orgId: string, file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a PNG, JPEG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Images up to 20 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${orgId}/src-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('ai').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export function useAiImage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { op: AiImageOp; image: AiImageRef; reference?: AiImageRef; style?: string; prompt?: string; aspectRatio?: string; caption?: string }) =>
      invoke<{ jobId: string; renderId: string; url: string | null; width: number; height: number }>('ai-image', { projectId, ...input }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['renders', projectId] });
      void qc.invalidateQueries({ queryKey: ['ai-credits'] });
    },
  });
}

export interface AiModelStatus {
  status: 'running' | 'succeeded' | 'failed';
  stage?: 'queued' | 'generating';
  error?: string | null;
  glbUrl?: string | null;
  name?: string;
  category?: string;
  sizeMm?: number | null;
}

export function startAiModel(input: { orgId: string; projectId?: string; name: string; category: string; sizeMm: number; image?: AiImageRef; prompt?: string }) {
  return invoke<{ jobId: string }>('ai-model', { action: 'start', ...input });
}

export function aiModelStatus(jobId: string) {
  return invoke<AiModelStatus>('ai-model', { action: 'status', jobId });
}

export function useAiSettings() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['ai-settings', activeOrg?.orgId ?? 'none'],
    enabled: Boolean(activeOrg),
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_settings').select('monthly_credits').eq('org_id', activeOrg!.orgId).maybeSingle();
      if (error) throw error;
      return data?.monthly_credits ?? 500;
    },
  });
  const setMonthly = useMutation({
    mutationFn: async (monthly: number) => {
      const { error } = await supabase.from('ai_settings').upsert({ org_id: activeOrg!.orgId, monthly_credits: monthly, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  });
  const topUp = useMutation({
    mutationFn: async ({ amount, note }: { amount: number; note: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('ai_credit_ledger').insert({ org_id: activeOrg!.orgId, delta: amount, reason: 'topup', note: note.slice(0, 200), created_by: u.user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-credits'] }),
  });
  return { monthly: q, setMonthly, topUp };
}

export interface AiUsageRow {
  id: string;
  op: string;
  status: string;
  cost: number;
  createdAt: string;
  by: string | null;
  error: string | null;
}

export function useAiUsage() {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['ai-usage', activeOrg?.orgId ?? 'none'],
    enabled: Boolean(activeOrg),
    queryFn: async (): Promise<AiUsageRow[]> => {
      const { data, error } = await supabase
        .from('ai_jobs')
        .select('id, op, status, cost_credits, created_at, error, created_by')
        .eq('org_id', activeOrg!.orgId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set(data.map((r) => r.created_by))];
      const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
      const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
      return data.map((r) => ({ id: r.id, op: r.op, status: r.status, cost: r.status === 'failed' ? 0 : r.cost_credits, createdAt: r.created_at, by: nameOf.get(r.created_by) ?? null, error: r.error }));
    },
  });
}
