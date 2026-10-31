import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, Loader2, Lock, Mic, RotateCcw, Send, Settings2, Square, X } from 'lucide-react';
import type { ChatMessage } from '@/ai/conversation';
import { findEntity } from '@/ai/entities';
import { showRows } from '@/ai/inspect';
import { EXAMPLE_REQUESTS } from '@/ai/providers/rules';
import { LIMITS } from '@/ai/schema';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAssistantStore, type ProviderChoice } from '@/state/assistantStore';
import { useEditorStore } from '@/state/editorStore';
import { useFormatDims, useFormatLength } from '@/state/units';
import { ChangePreview } from './ChangePreview';
import { DeliverableMessage } from './DeliverableMessage';
import { LayoutOptions } from './LayoutOptions';
import { MicButton, VoiceSettings, VoiceStatusBar } from './VoiceControls';

/** The design assistant: a conversation that proposes, previews and applies real design changes. */
export function AssistantPanel({ onClose }: { onClose?: () => void }) {
  const { messages, busy, focus, protect, log, progress } = useAssistantStore((s) => s.conversation);
  const prefs = useAssistantStore((s) => s.prefs);
  const { send, cancel, setPrefs, reset } = useAssistantStore.getState();
  const draft = useAssistantStore((s) => s.draft);
  const setDraft = useAssistantStore((s) => s.setDraft);
  const [showSettings, setShowSettings] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    list.current?.scrollTo?.({ top: list.current.scrollHeight });
  }, [messages.length, busy]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void send(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation(); // keep editor shortcuts (Delete, Z, …) out of the chat box
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-card" aria-label="Design assistant">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="size-4 text-highlight" />
        <h2 className="text-sm font-semibold">Design assistant</h2>
        <span className="rounded border px-1 text-[10px] text-muted-foreground" title={prefs.provider === 'offline' ? 'Built-in rules, runs in this browser' : 'AI service on the server (falls back to built-in rules when no model is configured)'}>
          {prefs.provider === 'offline' ? 'offline' : 'server'}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant={showSettings ? 'selected' : 'ghost'} aria-label="Assistant settings" aria-pressed={showSettings} onClick={() => setShowSettings((v) => !v)}>
            <Settings2 />
          </Button>
          {onClose && (
            <Button size="icon-sm" variant="ghost" aria-label="Close assistant" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
      </header>

      {showSettings && (
        <div className="flex flex-col gap-2 border-b bg-muted/40 px-3 py-2.5 text-xs" aria-label="Assistant settings panel">
          <label className="flex items-center justify-between gap-2">
            <span>Assistant</span>
            <Select aria-label="Assistant provider" value={prefs.provider} onChange={(e) => setPrefs({ provider: e.target.value as ProviderChoice })} className="h-7 w-44 text-xs">
              <option value="server">AI service (server)</option>
              <option value="offline">Built-in rules (offline)</option>
            </Select>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={prefs.autoApply} onChange={(e) => setPrefs({ autoApply: e.target.checked })} className="mt-0.5" aria-label="Auto-apply safe changes" />
            <span>
              Apply small, safe changes without asking
              <span className="block text-muted-foreground">Single-object edits with no side effects or warnings. Deletions and multi-object changes always ask. Every change can be undone.</span>
            </span>
          </label>
          <VoiceSettings />
          <div className="flex gap-1.5">
            <Button size="xs" variant="outline" onClick={reset}>
              <RotateCcw /> New conversation
            </Button>
          </div>
          {log.length > 0 && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">Activity log ({log.length})</summary>
              <ol className="mt-1 max-h-40 overflow-y-auto font-mono text-[10px] leading-relaxed" aria-label="Activity log">
                {log.slice(-50).map((l, i) => (
                  <li key={i}>
                    {l.at.slice(11, 19)} {l.event}
                    {l.revision !== undefined ? ` r${l.revision}` : ''}
                    {l.commands !== undefined ? ` ${l.commands} cmd` : ''} — {l.detail}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" aria-live="polite" data-testid="assistant-messages">
        {messages.length === 0 && <Intro onPick={(t) => void send(t)} />}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" /> {progress ?? 'Reading the project and planning the change…'}
          </div>
        )}
      </div>

      <ContextBar focus={focus} protect={protect} />
      <VoiceStatusBar />
      <form onSubmit={submit} className="flex flex-col gap-1 border-t p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={LIMITS.messageChars}
            placeholder="Type or speak a change, e.g. “Add a 600 mm dishwasher next to the sink”"
            aria-label="Message the design assistant"
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <MicButton />
          {busy ? (
            <Button size="icon-sm" variant="outline" aria-label="Stop" onClick={cancel}>
              <Square />
            </Button>
          ) : (
            <Button size="icon-sm" type="submit" aria-label="Send" disabled={!draft.trim()}>
              <Send />
            </Button>
          )}
        </div>
        <p className="flex justify-between text-[10px] text-muted-foreground">
          <span>Changes are previewed and need your approval. Undo with ⌘Z.</span>
          {draft.length > LIMITS.messageChars * 0.8 && <span>{draft.length}/{LIMITS.messageChars}</span>}
        </p>
      </form>
    </section>
  );
}

function Intro({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <p className="text-muted-foreground">Ask me to change the design in plain words. I read the actual project, show you exactly what will change, and apply it only when you approve.</p>
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Try</span>
      <div className="flex flex-col gap-1" aria-label="Example requests">
        {EXAMPLE_REQUESTS.map((t) => (
          <button key={t} type="button" onClick={() => onPick(t)} className="rounded-md border px-2 py-1 text-left text-xs hover:bg-muted">
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What “it”, “the selection” and locks currently mean, so the designer can see the context. */
function ContextBar({ focus, protect }: { focus: string[]; protect: { walls: string[]; ids: string[] } }) {
  const project = useEditorStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedId);
  if (!project) return null;
  const label = (id: string) => findEntity(project, id)?.label ?? null;
  const selected = selectedId ? label(selectedId) : null;
  const about = focus.map(label).filter((x): x is string => x !== null);
  const locks = [...protect.walls.map((w) => `${w} wall`), ...protect.ids.map(label).filter((x): x is string => x !== null)];
  if (!selected && !about.length && !locks.length) return null;
  return (
    <div className="flex flex-wrap gap-1 border-t px-2 py-1.5 text-[11px]" aria-label="Assistant context">
      {selected && <Chip title="“the selected one”">Selected: {selected}</Chip>}
      {about.length > 0 && <Chip title="What “it” refers to">It: {about.slice(0, 2).join(', ')}{about.length > 2 ? ` +${about.length - 2}` : ''}</Chip>}
      {locks.length > 0 && (
        <Chip title="Kept unchanged — say “unlock” to release">
          <Lock className="size-3" /> {locks.join(', ')}
        </Chip>
      )}
    </div>
  );
}

function Chip({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
      {children}
    </span>
  );
}

function Message({ message: m }: { message: ChatMessage }) {
  const { choose, send } = useAssistantStore.getState();
  if (m.role === 'user') {
    return (
      <div className="ml-6 flex items-start gap-1.5 self-end rounded-lg bg-primary px-2.5 py-1.5 text-[13px] text-primary-foreground" data-testid="user-message" data-source={m.source ?? 'text'}>
        {m.source === 'voice' && <Mic className="mt-0.5 size-3 shrink-0 opacity-70" aria-label="Spoken" />}
        <span>{m.text}</span>
      </div>
    );
  }
  switch (m.kind) {
    case 'proposal':
      return <ChangePreview message={m} />;
    case 'layouts':
      return <LayoutOptions message={m} />;
    case 'deliverable':
      return <DeliverableMessage message={m} />;
    case 'answer':
      return (
        <div className="flex flex-col gap-1.5 text-[13px]" data-testid="assistant-answer">
          <p className="whitespace-pre-line">{m.text}</p>
          {m.show && <AnswerTable show={m.show} />}
        </div>
      );
    case 'history':
      return <p className="text-[13px] text-muted-foreground" data-testid="assistant-history">{m.text}</p>;
    case 'clarify':
      return (
        <div className="flex flex-col gap-1.5 text-[13px]" data-testid="assistant-clarify">
          <p>{m.question}</p>
          {m.options.length > 0 && (
            <div className="flex flex-col gap-1">
              {m.options.map((o, i) => (
                <Button key={o.label} size="xs" variant="outline" disabled={m.answered} className="h-auto justify-start py-1 text-left whitespace-normal" onClick={() => choose(m.id, i)}>
                  {o.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      );
    case 'error':
      return (
        <div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive" data-testid="assistant-error">
          <p>{m.text}</p>
          {m.retryable && m.retryText && (
            <Button size="xs" variant="outline" className="self-start" onClick={() => void send(m.retryText!)}>
              <RotateCcw /> Try again
            </Button>
          )}
        </div>
      );
  }
}

/** A table built from the live project (never from model text). */
function AnswerTable({ show }: { show: NonNullable<Extract<ChatMessage, { kind: 'answer' }>['show']> }) {
  const project = useEditorStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const fmt = useFormatLength();
  const dims = useFormatDims();
  if (!project) return null;
  const data = showRows(project, show, selectedId);
  if (data.kind === 'room') {
    return <p className="rounded-md bg-muted px-2 py-1.5 text-xs tabular-nums">{fmt(data.room.width)} wide × {fmt(data.room.length)} long × {fmt(data.room.height)} high · walls {fmt(data.room.wallThickness)} thick</p>;
  }
  if (data.kind === 'issues') {
    return data.rows.length ? <ul className="list-disc pl-4 text-xs">{data.rows.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="text-xs text-success">No problems or warnings.</p>;
  }
  if (data.kind === 'walls') {
    return (
      <table className="w-full text-xs tabular-nums" aria-label="Walls">
        <tbody>
          {data.rows.map((w) => (
            <tr key={w.id} className="border-b last:border-0">
              <td className="py-0.5 capitalize">{w.wall}</td>
              <td className="py-0.5 text-right">{fmt(w.length)}</td>
              <td className="py-0.5 pl-2 text-muted-foreground">{w.openings.length ? w.openings.map((o) => `${o.kind} ${fmt(o.width)}`).join(', ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (!data.rows.length) return null;
  return (
    <table className="w-full text-xs tabular-nums" aria-label="Dimensions" data-testid="answer-table">
      <thead>
        <tr className="border-b text-left text-[10px] text-muted-foreground uppercase">
          <th className="py-0.5 font-medium">Item</th>
          <th className="py-0.5 text-right font-medium">W × H × D</th>
          <th className="py-0.5 pl-2 font-medium">Where</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <tr key={r.id} className={cn('cursor-pointer border-b last:border-0 hover:bg-muted', r.id === selectedId && 'bg-accent')} onClick={() => select(r.id)}>
            <td className="py-0.5">{r.label.replace(/ \d+( on the .*)?$/, '')}</td>
            <td className="py-0.5 text-right whitespace-nowrap">{r.depth !== undefined ? dims({ width: r.width, height: r.height, depth: r.depth }) : `${fmt(r.width)} × ${fmt(r.height)}`}</td>
            <td className="py-0.5 pl-2 text-muted-foreground">{r.wall === 'free-standing' ? 'free' : `${r.wall} @ ${fmt(r.offset ?? 0)}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
