import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { migrateScene, mm, normDeg, SCENE_MIGRATIONS, SCHEMA_VERSION, type Command, type Project } from '@studio/core';
import { useStudio, type ViewMode } from './store';
import { DocsView } from './DocsView';
import { QuoteView } from './QuoteView';
import { useRooms, useValidation } from './hooks';
import { PlanView } from './PlanView';
import { Properties } from './Properties';
import { AddPanel, ScenePanel } from './Sidebar';
import { CatalogPanel } from './CatalogPanel';
import { CommandBar } from './CommandBar';
import { Icon, type IconName } from './icons';
import type { Tool } from './store';

const View3D = lazy(() => import('./View3D').then((m) => ({ default: m.View3D })));

export type DrawerPanel = 'history' | 'renders' | 'share' | 'ai' | 'comments';

export interface EditorChrome {
  onBack: () => void;
  onRename: (name: string) => void;
  /** Side drawer currently open beside the canvas. */
  panel: DrawerPanel | null;
  onPanel: (p: DrawerPanel) => void;
  /** Rendered beside the canvas, e.g. the version history panel. */
  drawer?: ReactNode;
}

function SaveIndicator() {
  const saveState = useStudio((s) => s.saveState);
  const versionNo = useStudio((s) => s.savedVersionNo);
  const readOnly = useStudio((s) => s.readOnly);
  if (readOnly) return <span className="save">View only</span>;
  const text =
    saveState === 'saved' ? (versionNo ? `Saved · v${versionNo}` : 'Not saved yet')
    : saveState === 'saving' ? 'Saving…'
    : saveState === 'dirty' ? 'Unsaved changes'
    : 'Offline · kept in browser';
  return <span className={`save ${saveState === 'error' ? 'err' : ''}`} role="status" aria-live="polite">{text}</span>;
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', on);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', on);
      window.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return ref;
}

function TopBar({ chrome }: { chrome: EditorChrome }) {
  const project = useStudio((s) => s.project);
  const dispatch = useStudio((s) => s.dispatch);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const past = useStudio((s) => s.past);
  const future = useStudio((s) => s.future);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const readOnly = useStudio((s) => s.readOnly);
  const saveNow = useStudio((s) => s.saveNow);
  const replaceScene = useStudio((s) => s.replaceScene);
  const saveState = useStudio((s) => s.saveState);
  const openComments = useStudio((s) => s.openComments);
  const [name, setName] = useState(project.name);
  const [menu, setMenu] = useState(false);
  const menuRef = useClickOutside(menu, () => setMenu(false));
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setName(project.name), [project.name]);
  const views: { v: ViewMode; label: string }[] = [
    { v: 'plan', label: 'Plan' },
    { v: 'split', label: 'Split' },
    { v: '3d', label: '3D' },
    { v: 'docs', label: 'Drawings' },
    { v: 'quote', label: 'Quote' },
  ];
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[\\/:*?"<>|]/g, '-')}.interior.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const commitName = () => {
    const n = name.trim();
    if (!n || n === project.name) return setName(project.name);
    dispatch({ type: 'project.meta', patch: { name: n } });
    chrome.onRename(n);
  };
  const item = (label: string, onClick: () => void, opts: { on?: boolean; hint?: string; disabled?: boolean } = {}) => (
    <button
      role="menuitem"
      className={`menu-item ${opts.on ? 'on' : ''}`}
      disabled={opts.disabled}
      onClick={() => {
        setMenu(false);
        onClick();
      }}
    >
      <span>{label}</span>
      {opts.hint && <span className="menu-hint">{opts.hint}</span>}
    </button>
  );
  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="icon-btn" onClick={chrome.onBack} title="Back to projects" aria-label="Back to projects">
          <Icon name="back" />
        </button>
        <span className="brand-mark" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 14V2h4v12M10 14V7h4v7" />
          </svg>
        </span>
        <div className="proj">
          <input
            className="proj-name"
            value={name}
            readOnly={readOnly}
            aria-label="Project name"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="proj-client">
            {project.client} · <SaveIndicator />
          </span>
        </div>
      </div>
      <div className="seg" role="tablist" aria-label="View">
        {views.map((x) => (
          <button key={x.v} role="tab" aria-selected={view === x.v} className={view === x.v ? 'on' : ''} onClick={() => setView(x.v)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="tb-right">
        <button className="icon-btn" disabled={readOnly || !past.length} onClick={undo} title={past.length ? `Undo: ${past.at(-1)!.label} (⌘Z)` : 'Nothing to undo'} aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" disabled={readOnly || !future.length} onClick={redo} title={future.length ? `Redo: ${future[0].label} (⇧⌘Z)` : 'Nothing to redo'} aria-label="Redo">
          <Icon name="redo" />
        </button>
        <span className="tb-sep" />
        <button className={`tb-btn ${chrome.panel === 'comments' ? 'on' : ''}`} onClick={() => chrome.onPanel('comments')} title="Comment threads on this design (C to pin one)">
          <Icon name="comment" /> {openComments ? openComments : ''}
        </button>
        <button className={`tb-btn ${chrome.panel === 'ai' ? 'on' : ''}`} onClick={() => chrome.onPanel('ai')} title="AI images and 3D models">
          <Icon name="sparkle" /> AI studio
        </button>
        <button className={`tb-btn ${chrome.panel === 'renders' ? 'on' : ''}`} onClick={() => chrome.onPanel('renders')} title="Photoreal renders of the 3D view">
          Render
        </button>
        <button className={`tb-btn primary ${chrome.panel === 'share' ? 'on' : ''}`} onClick={() => chrome.onPanel('share')} title="Share a view-only link with your client">
          Share
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button className={`icon-btn ${menu ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu((m) => !m)}>
            <Icon name="more" />
          </button>
          {menu && (
            <div className="menu" role="menu">
              {!readOnly &&
                item('Save named version…', () => {
                  const msg = prompt('Name this version (optional)', '');
                  if (msg !== null) void saveNow('manual', msg.trim());
                }, { disabled: saveState === 'saving' })}
              {item('Version history', () => chrome.onPanel('history'), { on: chrome.panel === 'history' })}
              {item('Export project file', exportJson, { hint: '.json' })}
              {!readOnly && item('Import project file…', () => file.current?.click())}
            </div>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const raw = JSON.parse(await f.text()) as { schemaVersion?: number; furniture?: unknown };
              if (!raw || typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION || !Array.isArray(raw.furniture)) throw new Error('Not an Interior Studio project file, or saved by a newer version.');
              const p = migrateScene<Project>(raw, raw.schemaVersion, SCENE_MIGRATIONS);
              if (confirm(`Replace this design with “${p.name}”? You can undo or restore from history.`)) replaceScene(p, `Import ${f.name}`);
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        />
      </div>
    </header>
  );
}

const RAIL: { t: Tool; label: string; key: string; icon: IconName; draws?: boolean }[] = [
  { t: 'select', label: 'Select', key: 'V', icon: 'select' },
  { t: 'wall', label: 'Wall', key: 'W', icon: 'wall', draws: true },
  { t: 'room', label: 'Room', key: 'M', icon: 'room', draws: true },
  { t: 'door', label: 'Door', key: 'D', icon: 'door', draws: true },
  { t: 'window', label: 'Window', key: 'N', icon: 'window', draws: true },
  { t: 'paint', label: 'Paint finishes', key: 'B', icon: 'paint' },
  { t: 'comment', label: 'Comment', key: 'C', icon: 'comment' },
];

/** Vertical tool rail. Drawing tools need the plan, so they bring it into view. */
function ToolRail() {
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const readOnly = useStudio((s) => s.readOnly);
  return (
    <nav className="rail" aria-label="Tools">
      {RAIL.filter((r) => !readOnly || r.t === 'select' || r.t === 'comment').map((r) => (
        <button
          key={r.t}
          className={`rail-btn ${tool === r.t ? 'on' : ''}`}
          aria-pressed={tool === r.t}
          aria-label={r.label}
          title={`${r.label} (${r.key})`}
          onClick={() => {
            const next = tool === r.t && r.t !== 'select' ? 'select' : r.t;
            if (r.draws && next !== 'select' && (view === '3d' || view === 'docs' || view === 'quote')) setView('split');
            setTool(next);
          }}
        >
          <Icon name={r.icon} size={18} />
          <span className="rail-key">{r.key}</span>
        </button>
      ))}
    </nav>
  );
}

function StatusBar() {
  const results = useValidation();
  const selection = useStudio((s) => s.selection);
  const project = useStudio((s) => s.project);
  const select = useStudio((s) => s.select);
  const lastError = useStudio((s) => s.lastError);
  const rooms = useRooms();
  const [open, setOpen] = useState(false);
  const errors = results.filter((r) => r.severity === 'error').length;
  const warnings = results.length - errors;
  const selName =
    selection?.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id)?.name
    : selection?.kind === 'opening' ? 'Opening'
    : selection?.kind === 'room' ? rooms.find((r) => r.id === selection.id)?.info.name
    : selection?.kind === 'wall' ? `Wall ${project.plan.walls.findIndex((w) => w.id === selection.id) + 1}`
    : 'None';
  return (
    <footer className="status">
      <span>Units: mm</span>
      <span className="sep" />
      <span>Selected: {selName}</span>
      <span className="sep" />
      <button className="status-issues" onClick={() => setOpen((o) => !o)}>
        <span><span className="dot error" /> {errors} error{errors === 1 ? '' : 's'}</span>
        <span><span className="dot warning" /> {warnings} warning{warnings === 1 ? '' : 's'}</span>
      </button>
      {lastError && <span style={{ color: 'var(--error)' }}>{lastError}</span>}
      <span style={{ flex: 1 }} />
      <span>{project.furniture.length} pieces · rules {project.rulePack.id} v{project.rulePack.version}</span>
      {open && (
        <div className="issue-pop">
          {results.length === 0 && <div className="issue" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>No issues — geometry, clearances and construction rules all pass.</div>}
          {results.map((r) => (
            <div
              key={r.id}
              className={`issue ${r.severity}`}
              onClick={() => {
                const id = r.itemIds[0];
                if (!id) select(null);
                else if (project.furniture.some((f) => f.id === id)) select({ kind: 'furniture', id });
                else if (project.openings.some((o) => o.id === id)) select({ kind: 'opening', id });
                else if (project.plan.walls.some((w) => w.id === id)) select({ kind: 'wall', id });
                else select({ kind: 'room', id });
                setOpen(false);
              }}
            >
              <span className={`dot ${r.severity}`} />
              <span>{r.message}</span>
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const s = useStudio.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      const sel = s.selection;
      if (e.key === 'Escape') s.select(null);
      if (sel?.kind === 'furniture') {
        const f = s.project.furniture.find((x) => x.id === sel.id);
        if (!f) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          s.dispatch({ type: 'furniture.remove', id: f.id });
          s.select(null);
        }
        if (e.key.toLowerCase() === 'r' && !mod) s.dispatch({ type: 'furniture.update', id: f.id, patch: { rotDeg: normDeg(f.rotDeg + (e.shiftKey ? -90 : 90)) } }, 'Rotate');
        const step = mm(e.shiftKey ? 100 : 10);
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const mv = moves[e.key];
        if (mv) {
          e.preventDefault();
          s.dispatch({ type: 'furniture.update', id: f.id, patch: { xUm: f.xUm + mv[0], yUm: f.yUm + mv[1] } }, 'Nudge');
        }
      }
      if (sel?.kind === 'wall' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        const ops = s.project.openings.filter((o) => o.wallId === sel.id);
        s.dispatch({ type: 'batch', label: 'Delete wall', commands: [...ops.map((o): Command => ({ type: 'opening.remove', id: o.id })), { type: 'wall.remove', id: sel.id }] });
        s.select(null);
      }
      if (sel?.kind === 'opening' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        s.dispatch({ type: 'opening.remove', id: sel.id });
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

type LeftTab = 'add' | 'catalogue' | 'materials' | 'scene';

function LeftPanel() {
  const readOnly = useStudio((s) => s.readOnly);
  const [tab, setTab] = useState<LeftTab>(readOnly ? 'scene' : 'add');
  const tool = useStudio((s) => s.tool);
  // Picking the Paint tool from elsewhere brings its palette into view.
  useEffect(() => {
    if (tool === 'paint') setTab('materials');
  }, [tool]);
  const tabs: { t: LeftTab; label: string }[] = [
    { t: 'add', label: 'Add' },
    { t: 'catalogue', label: 'Catalogue' },
    { t: 'materials', label: 'Materials' },
    { t: 'scene', label: 'Scene' },
  ];
  return (
    <>
      <div className="left-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.t} role="tab" aria-selected={tab === x.t} className={tab === x.t ? 'on' : ''} onClick={() => setTab(x.t)}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'add' ? <AddPanel /> : tab === 'scene' ? <ScenePanel /> : <CatalogPanel tab={tab} />}
    </>
  );
}

// Test and debugging hook (development builds only).
if (import.meta.env.DEV) void import('../render/live').then(({ liveView }) => Object.assign(window, { __studio: { store: useStudio, liveView } }));

export function EditorShell({ chrome }: { chrome: EditorChrome }) {
  const view = useStudio((s) => s.view);
  useShortcuts();
  const three = (
    <Suspense fallback={<div className="view"><div className="view-label">Loading 3D…</div></div>}>
      <View3D />
    </Suspense>
  );
  return (
    <div className="editor-root">
      <div className="app">
        <TopBar chrome={chrome} />
        <ToolRail />
        <aside className="left">
          <div className="mobile-note">Designed for desktop. On a phone you can review designs; editing works best on a laptop.</div>
          <LeftPanel />
        </aside>
        <main className="main">
          {view === 'split' && (
            <>
              <PlanView />
              {three}
            </>
          )}
          {view === 'plan' && <PlanView />}
          {view === '3d' && three}
          {view === 'docs' && <DocsView />}
          {view === 'quote' && <QuoteView />}
          {view !== 'docs' && view !== 'quote' && <CommandBar />}
          {chrome.drawer}
        </main>
        <aside className="right">
          <Properties />
        </aside>
        <StatusBar />
      </div>
    </div>
  );
}
