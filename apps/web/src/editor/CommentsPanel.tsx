import { useEffect, useMemo, useRef, useState } from 'react';
import { centroid, footprint } from '@studio/core';
import { threadsOf, useCommentActions, useComments, type CommentAnchor, type Thread } from '../data/comments';
import { canEdit as roleCanEdit, canAdmin as roleCanAdmin, useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';
import { useStudio } from './store';

type Filter = 'open' | 'resolved' | 'all';

/** Plan position of a thread's anchor (for pins), or null when it isn't in the plan. */
export function anchorPoint(a: CommentAnchor | null, furniture: ReturnType<typeof useStudio.getState>['project']['furniture']): { x: number; y: number } | null {
  if (!a) return null;
  if (a.kind === 'point') return { x: a.x, y: a.y };
  if (a.kind === 'item') {
    const f = furniture.find((x) => x.id === a.itemId);
    return f ? centroid(footprint(f)) : null;
  }
  return null;
}

/** Keeps the plan's comment pins in step with the threads (numbered oldest first). */
export function useCommentPins(projectId: string) {
  const comments = useComments(projectId);
  const furniture = useStudio((s) => s.project.furniture);
  const setPins = useStudio((s) => s.setCommentPins);
  useEffect(() => {
    const threads = threadsOf(comments.data ?? []);
    setPins(
      threads
        .map((t, i) => ({ t, n: i + 1, p: anchorPoint(t.anchor, furniture) }))
        .filter((x) => x.p)
        .map(({ t, n, p }) => ({ id: t.id, n, x: p!.x, y: p!.y, resolved: Boolean(t.resolvedAt) })),
      threads.filter((t) => !t.resolvedAt).length,
    );
  }, [comments.data, furniture, setPins]);
  useEffect(() => () => setPins([]), [setPins]);
  return comments;
}

export function CommentsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const comments = useComments(projectId);
  const { post, resolve, remove, myId } = useCommentActions(projectId);
  const { activeOrg } = useAuth();
  const canEdit = roleCanEdit(activeOrg?.role);
  const canAdmin = roleCanAdmin(activeOrg?.role);
  const project = useStudio((s) => s.project);
  const anchor = useStudio((s) => s.commentAnchor);
  const focused = useStudio((s) => s.focusedComment);
  const startComment = useStudio((s) => s.startComment);
  const focus = useStudio((s) => s.focusComment);
  const select = useStudio((s) => s.select);
  const setTool = useStudio((s) => s.setTool);
  const tool = useStudio((s) => s.tool);
  const [filter, setFilter] = useState<Filter>('open');
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const threads = useMemo(() => threadsOf(comments.data ?? []), [comments.data]);
  const numbered = useMemo(() => new Map(threads.map((t, i) => [t.id, i + 1])), [threads]);
  const visible = threads.filter((t) => (filter === 'all' ? true : filter === 'open' ? !t.resolvedAt : Boolean(t.resolvedAt)));
  const openCount = threads.filter((t) => !t.resolvedAt).length;

  useEffect(() => {
    if (anchor) box.current?.focus();
  }, [anchor]);
  useEffect(() => {
    if (!focused) return;
    const t = threads.find((x) => x.id === focused);
    if (t?.resolvedAt && filter === 'open') setFilter('all');
    document.getElementById(`thread-${focused}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused, threads, filter]);

  const label = (a: CommentAnchor | null) => {
    if (!a) return 'General';
    if (a.kind === 'item') return project.furniture.find((f) => f.id === a.itemId)?.name ?? 'Removed piece';
    if (a.kind === 'render') return 'A render';
    return 'Spot in the plan';
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    post.mutate(
      { body, anchor },
      {
        onSuccess: () => {
          setText('');
          startComment(null);
        },
      },
    );
  };

  return (
    <aside className="versions comments" aria-label="Comments">
      <div className="versions-head">
        <strong>Comments</strong>
        <span className="ai-credits num">{openCount} open</span>
        <button className="btn" onClick={onClose} aria-label="Close comments">Close</button>
      </div>
      <div className="render-form">
        <div className="cm-about">
          <span className="render-hint">About: <strong>{label(anchor)}</strong></span>
          {anchor ? (
            <button className="btn" onClick={() => startComment(null)}>General instead</button>
          ) : (
            <button className={`btn ${tool === 'comment' ? 'on' : ''}`} onClick={() => setTool(tool === 'comment' ? 'select' : 'comment')} title="Then click a piece or a spot in the plan (C)">
              {tool === 'comment' ? 'Click in the plan…' : 'Pin to the plan'}
            </button>
          )}
        </div>
        <textarea ref={box} className="input ai-prompt" rows={3} maxLength={4000} placeholder="Write a comment for the team…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit()} />
        <button className="btn primary" disabled={post.isPending || !text.trim()} onClick={submit}>{post.isPending ? 'Posting…' : 'Post comment'}</button>
        {post.error && <p className="versions-empty err">{errorMessage(post.error)}</p>}
      </div>
      <div className="chips cm-filter" role="radiogroup" aria-label="Show">
        {(['open', 'resolved', 'all'] as Filter[]).map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Open' : f === 'resolved' ? 'Resolved' : 'All'}
          </button>
        ))}
      </div>
      {comments.isLoading && <p className="versions-empty">Loading…</p>}
      {comments.error && <p className="versions-empty err">{errorMessage(comments.error)}</p>}
      {comments.data && visible.length === 0 && <p className="versions-empty">{filter === 'open' ? 'No open comments.' : 'Nothing here.'}</p>}
      <ul className="cm-list">
        {visible.map((t) => (
          <ThreadView
            key={t.id}
            t={t}
            n={numbered.get(t.id)!}
            about={label(t.anchor)}
            focused={focused === t.id}
            canResolve={canEdit}
            canDelete={(id) => id === myId || canAdmin}
            onFocus={() => {
              focus(t.id);
              if (t.anchor?.kind === 'item') select({ kind: 'furniture', id: t.anchor.itemId });
            }}
            onReply={(body) => post.mutateAsync({ body, parentId: t.id })}
            onResolve={(r) => resolve.mutate({ id: t.id, resolved: r })}
            onDelete={(id) => confirm('Delete this comment?') && remove.mutate(id)}
          />
        ))}
      </ul>
    </aside>
  );
}

function ThreadView({ t, n, about, focused, canResolve, canDelete, onFocus, onReply, onResolve, onDelete }: {
  t: Thread;
  n: number;
  about: string;
  focused: boolean;
  canResolve: boolean;
  canDelete: (authorId: string | null) => boolean;
  onFocus: () => void;
  onReply: (body: string) => Promise<unknown>;
  onResolve: (resolved: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <li id={`thread-${t.id}`} className={`cm-thread ${focused ? 'focused' : ''} ${t.resolvedAt ? 'resolved' : ''}`} onClick={onFocus}>
      <div className="cm-head">
        <span className="cm-n">{n}</span>
        <span className="cm-about-chip">{about}</span>
        {t.source === 'client' && <span className="cm-client">Client</span>}
        {canResolve && (
          <button className="btn cm-resolve" onClick={(e) => { e.stopPropagation(); onResolve(!t.resolvedAt); }}>{t.resolvedAt ? 'Reopen' : 'Resolve'}</button>
        )}
      </div>
      {[t, ...t.replies].map((c) => (
        <div key={c.id} className="cm-msg">
          <div className="cm-meta">
            <strong>{c.authorName}</strong>
            <span>{relativeTime(c.createdAt)}{c.editedAt ? ' · edited' : ''}</span>
            {c.source === 'team' && canDelete(c.authorId) && (
              <button className="cm-del" onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} aria-label="Delete comment">×</button>
            )}
          </div>
          <p>{c.body}</p>
        </div>
      ))}
      {!t.resolvedAt && (
        <form
          className="cm-reply"
          onClick={(e) => e.stopPropagation()}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reply.trim()) return;
            setBusy(true);
            try {
              await onReply(reply.trim());
              setReply('');
            } finally {
              setBusy(false);
            }
          }}
        >
          <input className="input" placeholder={t.source === 'client' ? 'Reply (the client will see this)' : 'Reply'} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} />
          <button className="btn" disabled={busy || !reply.trim()}>Reply</button>
        </form>
      )}
    </li>
  );
}
