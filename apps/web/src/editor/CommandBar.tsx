import { useEffect, useRef, useState } from 'react';
import { buildQuote, envelope, FINISHES, formatInr, parseCommand, TOOL_SPECS, WORKTOP_FINISHES, type Project, type ToolCall } from '@studio/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useStudio } from './store';
import { runSceneTools } from './tools';
import { usePriceList } from '../data/quotes';
import { Icon } from './icons';

type Entry =
  | { id: number; text: string; status: 'working' }
  | { id: number; text: string; status: 'done'; summaries: string[]; via: 'local' | 'ai'; changed: boolean }
  | { id: number; text: string; status: 'rejected'; error: string; via: 'local' | 'ai' }
  | { id: number; text: string; status: 'reply'; reply: string };

const toMmNum = (um: number) => Math.round(um / 100) / 10;
const COST_QUESTION = /\b(how much|cost|costs|price|priced|estimate|budget|quote|total)\b/i;
const EDIT_VERB = /^(set|change|make|add|fill|delete|remove|move|rotate|rename|use|switch|paint)\b/i;

/** Compact, model-friendly view of the scene: what can be targeted and with which values. */
export function sceneContext(project: Project, selectionId: string | null, selectedWallId: string | null = null) {
  return {
    units: 'mm',
    selectedId: selectionId,
    furniture: project.furniture.slice(0, 80).map((f) => {
      const e = envelope(f);
      return {
        id: f.id,
        name: f.name,
        kind: f.kind,
        widthMm: toMmNum(e.widthUm),
        depthMm: toMmNum(e.depthUm),
        heightMm: toMmNum(e.heightUm),
        ...(f.kind === 'basecabinet' ? { params: { front: f.params.front, doorCount: f.params.doorCount, drawerCount: f.params.drawerCount, shelfCount: f.params.shelfCount, plinthMm: f.params.plinthUm / 1000, worktopMm: f.params.worktopUm / 1000 }, materials: f.materials } : {}),
        ...(f.kind === 'wallcabinet' || f.kind === 'tallcabinet' ? { params: f.params, materials: f.materials } : {}),
        ...(f.kind === 'wardrobe' || f.kind === 'tvunit' ? { materials: f.materials } : {}),
      };
    }),
    walls: project.plan.walls.map((w, i) => ({ number: i + 1, lengthMm: toMmNum(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)), selected: selectedWallId === w.id })),
    finishes: { cabinet: FINISHES.map((f) => f.id), worktop: WORKTOP_FINISHES.map((f) => f.id) },
  };
}

async function planWithModel(text: string, orgId: string, projectId: string): Promise<{ calls: ToolCall[]; reply: string | null }> {
  const s = useStudio.getState();
  const selectionId = s.selection?.kind === 'furniture' ? s.selection.id : null;
  const { data, error } = await supabase.functions.invoke<{ calls: ToolCall[]; reply: string | null }>('ai-command', {
    body: { orgId, projectId, text, context: sceneContext(s.project, selectionId, s.selection?.kind === 'wall' ? s.selection.id : null), tools: TOOL_SPECS },
  });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.message) msg = j.message;
    } catch {
      /* keep generic */
    }
    throw new Error(msg);
  }
  return { calls: Array.isArray(data?.calls) ? data!.calls : [], reply: data?.reply ?? null };
}

/**
 * Natural-language command bar. Requests are turned into scene tool calls — by a deterministic
 * parser for common edits, otherwise by the AI planner — then validated and applied as one
 * undoable step through the same tools the inspector uses. Nothing reaches the scene unvalidated.
 */
export function CommandBar() {
  const readOnly = useStudio((s) => s.readOnly);
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const undo = useStudio((s) => s.undo);
  const { activeOrg } = useAuth();
  const priceList = usePriceList();
  const [text, setText] = useState('');
  const [log, setLog] = useState<Entry[]>([]);
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (readOnly) return null;

  const selected = selection?.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id) : null;
  const placeholder = selected
    ? selected.kind === 'basecabinet'
      ? `e.g. “change the width to 900 mm” or “walnut doors, white quartz worktop”`
      : `Tell Studio what to change about ${selected.name}…`
    : 'Select a piece, then describe a change — or “add a 600 mm base cabinet”';

  const push = (e: Entry) => setLog((l) => [...l.filter((x) => x.id !== e.id), e].slice(-4));

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const id = ++seq.current;
    setText('');
    // Cost questions are answered from the live quote (read-only; nothing in the scene changes).
    if (COST_QUESTION.test(t) && !EDIT_VERB.test(t)) {
      const rates = priceList.data?.rates;
      if (!rates) {
        push({ id, text: t, status: 'reply', reply: 'Rates are still loading — try again in a moment.' });
        return;
      }
      const q = buildQuote(useStudio.getState().project, rates);
      const sel = useStudio.getState().selection;
      const line = sel?.kind === 'furniture' ? q.lines.find((l) => l.itemId === sel.id) : undefined;
      const parts = [
        line ? `${line.name}: ${line.amount ? `${formatInr(line.amount)} before GST (${formatInr(Math.round(line.amount * (1 + rates.gstPct / 100)))} with GST)` : 'price on request'}.` : '',
        `Whole design: ${formatInr(q.total)} including ${rates.gstPct}% GST (${formatInr(q.subtotal)} + ${formatInr(q.gst)}), ${q.lines.length} piece${q.lines.length === 1 ? '' : 's'}.`,
        q.unpriced.length ? `Not priced: ${q.unpriced.slice(0, 3).join(', ')}${q.unpriced.length > 3 ? '…' : ''}.` : '',
        priceList.data?.saved ? '' : 'Using sample rates — set your studio rates in the Quote view.',
      ];
      push({ id, text: t, status: 'reply', reply: parts.filter(Boolean).join(' ') });
      return;
    }
    const local = parseCommand(t);
    if (local) {
      const r = runSceneTools(local, `AI: ${t.slice(0, 60)}`);
      push(r.ok ? { id, text: t, status: 'done', summaries: r.summaries, via: 'local', changed: r.changed } : { id, text: t, status: 'rejected', error: r.error, via: 'local' });
      return;
    }
    if (!activeOrg) {
      push({ id, text: t, status: 'rejected', error: 'Sign in to a studio to use AI commands.', via: 'ai' });
      return;
    }
    push({ id, text: t, status: 'working' });
    try {
      const { calls, reply } = await planWithModel(t, activeOrg.orgId, useStudio.getState().project.id);
      if (!calls.length) {
        push({ id, text: t, status: 'reply', reply: reply || 'I could not turn that into a change I can make. Try naming a dimension, finish or count.' });
        return;
      }
      const r = runSceneTools(calls, `AI: ${t.slice(0, 60)}`);
      push(r.ok ? { id, text: t, status: 'done', summaries: r.summaries, via: 'ai', changed: r.changed } : { id, text: t, status: 'rejected', error: r.error, via: 'ai' });
    } catch (e) {
      push({ id, text: t, status: 'rejected', error: (e as Error).message, via: 'ai' });
    }
  };

  const last = log.at(-1);
  return (
    <div className={`cmdbar ${open ? 'open' : ''}`} role="region" aria-label="AI commands">
      {open && log.length > 0 && (
        <ul className="cmd-log" aria-live="polite">
          {log.map((e) => (
            <li key={e.id} className={`cmd-entry ${e.status}`} data-testid="cmd-entry">
              <span className="cmd-q">{e.text}</span>
              {e.status === 'working' && <span className="cmd-a">Planning the change…</span>}
              {e.status === 'done' && (
                <span className="cmd-a">
                  {e.summaries.join(' ')}
                  {e.changed && e === last && (
                    <button className="cmd-undo" onClick={() => undo()}>
                      Undo
                    </button>
                  )}
                </span>
              )}
              {e.status === 'rejected' && <span className="cmd-a">Not changed — {e.error}</span>}
              {e.status === 'reply' && <span className="cmd-a">{e.reply}</span>}
            </li>
          ))}
        </ul>
      )}
      <form
        className="cmd-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="cmd-ico">
          <Icon name="sparkle" />
        </span>
        <input
          ref={input}
          className="cmd-input"
          aria-label="Describe a change"
          placeholder={placeholder}
          value={text}
          maxLength={400}
          onFocus={() => setOpen(true)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              (e.target as HTMLInputElement).blur();
              setLog([]);
            }
          }}
        />
        <span className="kbd">⌘K</span>
        <button className="cmd-send" type="submit" disabled={!text.trim() || last?.status === 'working'} aria-label="Apply">
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
