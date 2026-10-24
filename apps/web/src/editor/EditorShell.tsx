import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { migrateScene, mm, normDeg, SCENE_MIGRATIONS, SCHEMA_VERSION, type Command, type Project } from '@studio/core';
import { useStudio, type ViewMode } from './store';
import { DocsView } from './DocsView';
import { useRooms, useValidation } from './hooks';
import { PlanView } from './PlanView';
import { Properties } from './Properties';
import { Sidebar } from './Sidebar';
import { CatalogPanel, type LeftTab } from './CatalogPanel';

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
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setName(project.name), [project.name]);
  const views: { v: ViewMode; label: string }[] = [
    { v: 'split', label: 'Split' },
    { v: 'plan', label: 'Plan' },
    { v: '3d', label: '3D' },
    { v: 'docs', label: 'Drawings' },
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
  return (
    <header className="topbar">
      <button className="tb-btn" onClick={chrome.onBack} title="Back to projects" aria-label="Back to projects">←</button>
      <div className="brand">
        <span className="brand-mark">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#24473d" strokeWidth="2">
            <path d="M3 14V2h4v12M10 14V7h4v7" />
          </svg>
        </span>
      </div>
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
        <span className="proj-client">{project.client}</span>
      </div>
      <span className="spacer" />
      <button className="tb-btn" disabled={readOnly || !past.length} onClick={undo} title={past.length ? `Undo: ${past.at(-1)!.label}` : 'Nothing to undo'}>
        ↶ Undo
      </button>
      <button className="tb-btn" disabled={readOnly || !future.length} onClick={redo} title={future.length ? `Redo: ${future[0].label}` : 'Nothing to redo'}>
        ↷ Redo
      </button>
      <div className="seg">
        {views.map((x) => (
          <button key={x.v} className={view === x.v ? 'on' : ''} onClick={() => setView(x.v)}>
            {x.label}
          </button>
        ))}
      </div>
      {!readOnly && (
        <button
          className="tb-btn"
          disabled={saveState === 'saving'}
          onClick={() => {
            const msg = prompt('Name this version (optional)', '');
            if (msg !== null) void saveNow('manual', msg.trim());
          }}
          title="Save a named version you can come back to"
        >
          Save version
        </button>
      )}
      <button className={`tb-btn ${chrome.panel === 'comments' ? 'primary' : ''}`} onClick={() => chrome.onPanel('comments')} title="Comment threads on this design (C to pin one)">Comments{openComments ? ` · ${openComments}` : ''}</button>
      <button className={`tb-btn ${chrome.panel === 'history' ? 'primary' : ''}`} onClick={() => chrome.onPanel('history')} title="Version history">History</button>
      <button className={`tb-btn ${chrome.panel === 'renders' ? 'primary' : ''}`} onClick={() => chrome.onPanel('renders')} title="Photoreal renders of the 3D view">Render</button>
      <button className={`tb-btn ${chrome.panel === 'ai' ? 'primary' : ''}`} onClick={() => chrome.onPanel('ai')} title="AI images and 3D models">AI</button>
      <button className={`tb-btn ${chrome.panel === 'share' ? 'primary' : ''}`} onClick={() => chrome.onPanel('share')} title="Share a view-only link with your client">Share</button>
      <button className="tb-btn" onClick={exportJson} title="Download the project file">Export</button>
      {!readOnly && (
        <>
          <button className="tb-btn" onClick={() => file.current?.click()} title="Replace this design with a project file">Import</button>
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
        </>
      )}
      <SaveIndicator />
    </header>
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

function LeftPanel() {
  const [tab, setTab] = useState<LeftTab>('plan');
  const tool = useStudio((s) => s.tool);
  // Picking the Paint tool from elsewhere brings its palette into view.
  useEffect(() => {
    if (tool === 'paint') setTab('materials');
  }, [tool]);
  return (
    <>
      <div className="left-tabs" role="tablist">
        {(['plan', 'catalogue', 'materials'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'plan' ? 'Plan' : t === 'catalogue' ? 'Catalogue' : 'Materials'}
          </button>
        ))}
      </div>
      {tab === 'plan' ? <Sidebar /> : <CatalogPanel tab={tab} />}
    </>
  );
}

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
