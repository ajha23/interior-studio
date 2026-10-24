import { useMemo, useState } from 'react';
import { postSharedComment, type SharedComment } from '../data/comments';
import { useStudio } from '../editor/store';

const NAME_KEY = 'studio.clientName';

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Client feedback on a shared design: start a thread (optionally about the piece they tapped) and read replies. */
export function ClientComments({ token, initial }: { token: string; initial: SharedComment[] }) {
  const [rows, setRows] = useState<SharedComment[]>(initial);
  const [name, setName] = useState(readName);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const piece = selection?.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id) : null;
  const threads = useMemo(() => {
    const roots = rows.filter((r) => !r.parent_id);
    return roots.map((r) => ({ ...r, replies: rows.filter((c) => c.parent_id === r.id) })).reverse();
  }, [rows]);

  const send = async (body: string, parentId?: string) => {
    setError(null);
    setBusy(true);
    try {
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* name just won't be remembered */
      }
      const c = await postSharedComment({ token, name: name.trim(), body, parentId, anchor: !parentId && piece ? { kind: 'item', itemId: piece.id } : null });
      setRows((r) => [...r, c]);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pieceName = (c: SharedComment) => (c.anchor?.kind === 'item' ? (project.furniture.find((f) => f.id === (c.anchor as { itemId: string }).itemId)?.name ?? null) : null);

  return (
    <section className="share-comments" aria-labelledby="cc-h">
      <h2 id="cc-h">Your comments</h2>
      <p className="share-sub">Questions or changes? Leave a note for your designer. {piece ? `It will be attached to “${piece.name}”.` : 'Tap a piece first to comment on it.'}</p>
      <form
        className="cc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim() && (await send(text.trim()))) setText('');
        }}
      >
        <input className="input" placeholder="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        <textarea className="input" rows={3} maxLength={2000} placeholder={piece ? `About ${piece.name}…` : 'Write to your designer…'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
        <button className="btn primary" disabled={busy || !text.trim() || !name.trim()}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
      {error && <p className="cc-error" role="alert">{error}</p>}
      <ul className="cc-list">
        {threads.map((t) => (
          <ClientThread key={t.id} t={t} about={pieceName(t)} onReply={(b) => send(b, t.id)} busy={busy} />
        ))}
      </ul>
    </section>
  );
}

function ClientThread({ t, about, onReply, busy }: { t: SharedComment & { replies: SharedComment[] }; about: string | null; onReply: (body: string) => Promise<boolean>; busy: boolean }) {
  const [reply, setReply] = useState('');
  return (
    <li className={`cc-thread ${t.resolved_at ? 'resolved' : ''}`}>
      {about && <span className="cc-about">{about}</span>}
      {[t, ...t.replies].map((c) => (
        <div key={c.id} className={`cc-msg ${c.source === 'team' ? 'team' : ''}`}>
          <strong>{c.author_name}{c.source === 'team' ? ' · designer' : ''}</strong>
          <span>{new Date(c.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          <p>{c.body}</p>
        </div>
      ))}
      {t.resolved_at ? (
        <span className="cc-done">Marked done by the studio</span>
      ) : (
        <form
          className="cc-reply"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reply.trim() && (await onReply(reply.trim()))) setReply('');
          }}
        >
          <input className="input" placeholder="Reply" value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} />
          <button className="btn" disabled={busy || !reply.trim()}>Reply</button>
        </form>
      )}
    </li>
  );
}
