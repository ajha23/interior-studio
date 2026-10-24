import { create } from 'zustand';
import {
  applyCommand,
  blankProject,
  coreOf,
  describe,
  hashCore,
  SCHEMA_VERSION,
  type Command,
  type Project,
  type RevisionStatus,
} from '@studio/core';

const HISTORY_LIMIT = 200;
const AUTOSAVE_MS = 2500;
const DRAFT_PREFIX = 'studio.draft.';

export type Selection = { kind: 'furniture' | 'opening' | 'wall' | 'room'; id: string } | null;
/** Plan tools. Doors and windows are placed by clicking a wall. */
export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'paint';
export type ViewMode = 'split' | 'plan' | '3d' | 'docs';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface HistoryEntry {
  label: string;
  forward: Command;
  inverse: Command;
}

/** Persists the scene as a new cloud version. Resolves null when nothing changed. */
export type RemoteSaver = (
  project: Project,
  kind: 'autosave' | 'manual' | 'revision',
  message?: string,
) => Promise<{ versionNo: number } | null>;

interface StudioState {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selection: Selection;
  view: ViewMode;
  tool: Tool;
  /** Material id the Paint tool applies. */
  paint: string;
  readOnly: boolean;
  /** Public share view: read-only, no validation markers. */
  clientView: boolean;
  saveState: SaveState;
  savedVersionNo: number;
  lastSavedAt: string | null;
  lastError: string | null;
  saver: RemoteSaver | null;

  hydrate: (p: Project, opts: { versionNo: number; readOnly: boolean; saver: RemoteSaver | null; clientView?: boolean }) => void;
  dispatch: (cmd: Command, label?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  setView: (v: ViewMode) => void;
  setTool: (t: Tool) => void;
  /** Pick a material and switch to the Paint tool. */
  setPaint: (materialId: string) => void;
  /** Replace the whole scene (restore an old version, import a file) as one undoable step. */
  replaceScene: (next: Project, label: string) => void;
  saveNow: (kind?: 'autosave' | 'manual', message?: string) => Promise<void>;
  issueRevision: (label: string, status: RevisionStatus) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;

function writeDraft(p: Project) {
  try {
    localStorage.setItem(DRAFT_PREFIX + p.id, JSON.stringify({ savedAt: new Date().toISOString(), project: p }));
  } catch {
    /* storage full or unavailable: cloud save still runs */
  }
}

export function clearDraft(projectId: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + projectId);
  } catch {
    /* ignore */
  }
}

/** A local draft newer than the cloud copy survives a crash or a lost connection. */
export function readDraft(projectId: string): { savedAt: string; project: Project } | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + projectId);
    if (!raw) return null;
    const d = JSON.parse(raw) as { savedAt: string; project: Project };
    return d.project?.schemaVersion === SCHEMA_VERSION ? d : null;
  } catch {
    return null;
  }
}

export const useStudio = create<StudioState>((set, get) => {
  const runSave = async (kind: 'autosave' | 'manual' | 'revision', message?: string) => {
    const { saver, project, readOnly } = get();
    if (!saver || readOnly) return;
    clearTimeout(saveTimer);
    set({ saveState: 'saving' });
    try {
      const res = await saver(project, kind, message);
      // Edits made while the request was in flight keep the editor dirty.
      const changedMeanwhile = get().project !== project;
      set({
        saveState: changedMeanwhile ? 'dirty' : 'saved',
        savedVersionNo: res?.versionNo ?? get().savedVersionNo,
        lastSavedAt: new Date().toISOString(),
        lastError: null,
      });
      if (changedMeanwhile) scheduleSave();
      else clearDraft(project.id);
    } catch (e) {
      set({ saveState: 'error', lastError: `Not saved to the cloud: ${(e as Error).message}. Your changes are kept in this browser.` });
      saveTimer = setTimeout(() => void queueSave('autosave'), 15_000);
    }
  };

  const queueSave = (kind: 'autosave' | 'manual' | 'revision', message?: string): Promise<void> => {
    const prev = inFlight ?? Promise.resolve();
    const next = prev.then(() => runSave(kind, message));
    inFlight = next.finally(() => {
      if (inFlight === next) inFlight = null;
    });
    return next;
  };

  const scheduleSave = () => {
    if (get().readOnly) return;
    writeDraft(get().project);
    set({ saveState: 'dirty' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void queueSave('autosave'), AUTOSAVE_MS);
  };

  const commit = (next: Project, entry: HistoryEntry) => {
    set((s) => ({
      project: { ...next, updatedAt: new Date().toISOString() },
      past: [...s.past, entry].slice(-HISTORY_LIMIT),
      future: [],
      lastError: null,
    }));
    scheduleSave();
  };

  return {
    project: blankProject('Loading', ''),
    past: [],
    future: [],
    selection: null,
    view: 'split',
    tool: 'select',
    paint: 'oak-floor',
    readOnly: false,
    clientView: false,
    saveState: 'saved',
    savedVersionNo: 0,
    lastSavedAt: null,
    lastError: null,
    saver: null,

    hydrate: (p, opts) => {
      clearTimeout(saveTimer);
      set({
        project: p,
        past: [],
        future: [],
        selection: null,
        readOnly: opts.readOnly,
        clientView: opts.clientView ?? false,
        tool: 'select',
        saver: opts.saver,
        saveState: 'saved',
        savedVersionNo: opts.versionNo,
        lastSavedAt: null,
        lastError: null,
      });
    },

    dispatch: (cmd, label) => {
      if (get().readOnly) {
        set({ lastError: 'View-only access: ask an admin for designer access to edit.' });
        return;
      }
      try {
        const [next, inverse] = applyCommand(get().project, cmd);
        commit(next, { label: label ?? describe(cmd), forward: cmd, inverse });
      } catch (e) {
        set({ lastError: (e as Error).message });
      }
    },

    undo: () => {
      const { past, project, readOnly } = get();
      const entry = past.at(-1);
      if (!entry || readOnly) return;
      const [next] = applyCommand(project, entry.inverse);
      set((s) => ({ project: next, past: s.past.slice(0, -1), future: [entry, ...s.future] }));
      scheduleSave();
    },

    redo: () => {
      const { future, project, readOnly } = get();
      const entry = future[0];
      if (!entry || readOnly) return;
      const [next] = applyCommand(project, entry.forward);
      set((s) => ({ project: next, past: [...s.past, entry], future: s.future.slice(1) }));
      scheduleSave();
    },

    select: (selection) => set({ selection }),
    setView: (view) => set({ view }),
    setTool: (tool) => set({ tool: get().readOnly ? 'select' : tool }),
    setPaint: (paint) => set({ paint, tool: get().readOnly ? 'select' : 'paint' }),

    replaceScene: (incoming, label) => {
      if (get().readOnly) return;
      const current = get().project;
      // Keep identity and issued revisions; everything else comes from the incoming scene.
      const next: Project = { ...incoming, id: current.id, revisions: current.revisions };
      const batch = (from: Project, to: Project): Command => ({
        type: 'batch',
        label,
        commands: [
          { type: 'project.meta', patch: { name: to.name, client: to.client } },
          ...from.openings.map((o): Command => ({ type: 'opening.remove', id: o.id })),
          ...from.furniture.map((f): Command => ({ type: 'furniture.remove', id: f.id })),
          ...from.plan.walls.map((w): Command => ({ type: 'wall.remove', id: w.id })),
          ...from.plan.rooms.map((r): Command => ({ type: 'room.remove', id: r.id })),
          { type: 'plan.update', patch: { source: to.plan.source, defaultWallThicknessUm: to.plan.defaultWallThicknessUm, defaultCeilingUm: to.plan.defaultCeilingUm } },
          { type: 'rulepack.update', patch: to.rulePack },
          ...to.plan.walls.map((w): Command => ({ type: 'wall.add', wall: w })),
          ...to.plan.rooms.map((r): Command => ({ type: 'room.upsert', info: r })),
          ...to.openings.map((o): Command => ({ type: 'opening.add', opening: o })),
          ...to.furniture.map((f): Command => ({ type: 'furniture.add', item: f })),
        ],
      });
      try {
        const [applied, inverse] = applyCommand(current, batch(current, next));
        commit(applied, { label, forward: batch(current, next), inverse });
        set({ selection: null });
      } catch (e) {
        set({ lastError: (e as Error).message });
      }
    },

    saveNow: (kind = 'manual', message) => queueSave(kind, message),

    issueRevision: async (label, status) => {
      if (get().readOnly) return;
      const p = get().project;
      const core = coreOf(p);
      const hash = await hashCore(core);
      const rev = (p.revisions.at(-1)?.rev ?? 0) + 1;
      const snapshot = JSON.parse(JSON.stringify(core));
      set({ project: { ...p, revisions: [...p.revisions, { rev, label, status, createdAt: new Date().toISOString(), hash, snapshot }] } });
      writeDraft(get().project);
      await queueSave('revision', `Rev ${rev}: ${label}`);
    },
  };
});

/** Hash of the live design, to show whether it diverged from the latest issued revision. */
export async function liveHash(p: Project): Promise<string> {
  return hashCore(coreOf(p));
}
