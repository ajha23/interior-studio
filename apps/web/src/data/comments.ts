import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Json } from '../lib/database.types';

export type CommentAnchor = { kind: 'point'; x: number; y: number } | { kind: 'item'; itemId: string } | { kind: 'render'; renderId: string };

export interface Comment {
  id: string;
  parentId: string | null;
  anchor: CommentAnchor | null;
  body: string;
  source: 'team' | 'client';
  authorId: string | null;
  authorName: string;
  shareLinkId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface Thread extends Comment {
  replies: Comment[];
}

const key = (projectId: string) => ['comments', projectId] as const;

export function threadsOf(rows: Comment[]): Thread[] {
  const roots = rows.filter((c) => !c.parentId).map((c) => ({ ...c, replies: [] as Comment[] }));
  const byId = new Map(roots.map((r) => [r.id, r]));
  for (const c of rows) if (c.parentId) byId.get(c.parentId)?.replies.push(c);
  return roots;
}

/** Comments on a project, kept live through realtime changes. */
export function useComments(projectId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: key(projectId),
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase.from('comments').select('*').eq('project_id', projectId).order('created_at');
      if (error) throw error;
      const ids = [...new Set(data.map((c) => c.author_id).filter((x): x is string => Boolean(x)))];
      const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
      const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
      return data.map((c) => ({
        id: c.id,
        parentId: c.parent_id,
        anchor: (c.anchor as CommentAnchor | null) ?? null,
        body: c.body,
        source: c.source === 'client' ? 'client' : 'team',
        authorId: c.author_id,
        authorName: c.author_id ? (nameOf.get(c.author_id) ?? c.author_name ?? 'Team member') : c.author_name || 'Client',
        shareLinkId: c.share_link_id,
        resolvedAt: c.resolved_at,
        createdAt: c.created_at,
        editedAt: c.edited_at,
      }));
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`comments:${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `project_id=eq.${projectId}` }, () => {
        void qc.invalidateQueries({ queryKey: key(projectId) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [projectId, qc]);
  return q;
}

export function useCommentActions(projectId: string) {
  const { activeOrg, session } = useAuth();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: key(projectId) });
  const me = session?.user;
  const myName = (me?.user_metadata?.full_name as string | undefined) || me?.email || 'Team member';
  const post = useMutation({
    mutationFn: async (input: { body: string; anchor?: CommentAnchor | null; parentId?: string | null; shareLinkId?: string | null }) => {
      if (!activeOrg || !me) throw new Error('Not signed in.');
      const { error } = await supabase.from('comments').insert({
        org_id: activeOrg.orgId,
        project_id: projectId,
        parent_id: input.parentId ?? null,
        anchor: (input.parentId ? null : (input.anchor ?? null)) as Json | null,
        body: input.body.trim().slice(0, 4000),
        source: 'team',
        author_id: me.id,
        author_name: myName.slice(0, 80),
      });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const resolve = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase.from('comments').update({ resolved_at: resolved ? new Date().toISOString() : null, resolved_by: resolved ? (me?.id ?? null) : null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { post, resolve, remove, myId: me?.id ?? null };
}

export interface SharedComment {
  id: string;
  parent_id: string | null;
  anchor: CommentAnchor | null;
  body: string;
  source: 'team' | 'client';
  author_name: string;
  created_at: string;
  resolved_at: string | null;
}

/** Public: a client comments through a share link. */
export async function postSharedComment(input: { token: string; name: string; body: string; anchor?: CommentAnchor | null; parentId?: string | null }): Promise<SharedComment> {
  const { data, error } = await supabase.functions.invoke<{ comment: SharedComment }>('share-comment', { body: input });
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
  return data!.comment;
}
