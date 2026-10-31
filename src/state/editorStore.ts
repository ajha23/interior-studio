/**
 * Editor state: the open project, undo/redo history, selection and view settings.
 * The project only changes through `dispatch(command)`, which runs the domain command engine;
 * history stores immutable project snapshots (cheap, thanks to Immer's structural sharing).
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { allElements, executeBatch, executeCommand, offsetAlongWall, WALLS, type CommandResult, type DesignCommand, type KitchenElement, type KitchenProject, type Opening } from '@/domain';

import { buildOpeningModel } from '@/engine/geometry/openingParts';
import { buildModel, type Mover } from '@/engine/geometry/parts';
import type { WalkPose } from '@/rendering/scene/walk';
import { setAll, setOpening, toggleOpening, type Openness } from './openings';

const HISTORY_LIMIT = 100;

export type ViewMode = '3d' | 'plan' | 'split' | 'drawings';
export type CameraPreset = 'iso' | 'top' | 'front' | 'left' | 'right';
export type VisualStyle = 'realistic' | 'edges' | 'xray';
export type Projection = 'perspective' | 'orthographic';
export type NavMode = 'orbit' | 'walk';

/** Where the walking viewer should go next. */
export type WalkRequest =
  | { kind: 'start' }
  | { kind: 'stand'; id: string }
  | { kind: 'goto'; x: number; z: number }
  | { kind: 'pose'; pose: WalkPose };

/** What the camera should frame next: a standard view, the whole room, or one element. */
export type CameraRequest = { kind: 'preset'; preset: CameraPreset } | { kind: 'fit' } | { kind: 'focus'; id: string };

/** A drag or grip edit in progress. Never part of the project or history; committed on release. */
/**
 * A drag/grip edit in progress, or a layout option being previewed (`candidate`). Never part of the
 * project or history: the views draw `preview.project` instead of the project while it is set.
 */
export interface Preview {
  kind: 'move' | 'resize' | 'candidate';
  id: string;
  /** Live readout next to the unit, e.g. "↔ 1200 mm · after Sink unit 800" or "H 760 mm". */
  readout: string;
  valid: boolean;
  error: string | null;
  /** The project as it would be after committing (dry run); null when the edit is not allowed. */
  project: KitchenProject | null;
  /** Where a move is trying to put the unit, drawn in red when it is not allowed. */
  attempt: KitchenElement | null;
}

interface HistoryEntry {
  project: KitchenProject;
  label: string;
}

export interface Feedback {
  kind: 'error' | 'info';
  messages: string[];
  /** Changes on every report so repeated identical messages still re-render. */
  at: number;
}

export type TransactionResult = { success: true; revision: number } | { success: false; errors: string[]; stale?: boolean };

export interface EditorState {
  project: KitchenProject | null;
  /** Increases on every change to the project (edit, undo, redo, open); detects stale previews. */
  revision: number;
  /** The project as last saved; the editor is dirty while `project !== savedProject`. */
  savedProject: KitchenProject | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selectedId: string | null;
  feedback: Feedback | null;
  view: ViewMode;
  showBom: boolean;
  showChecks: boolean;
  showGrid: boolean;
  visualStyle: VisualStyle;
  projection: Projection;
  /** Hide walls that stand between the camera and the room. */
  autoHideWalls: boolean;
  /** See-through fronts so cabinet interiors are visible in 3D. */
  showInteriors: boolean;
  /** Interact mode: clicks and drags open doors and drawers instead of editing the design. */
  interactMode: boolean;
  /** Orbit around the design, or walk through it at eye height. */
  navMode: NavMode;
  /** Client presentation: editing panels hidden, clicks open doors instead of editing. */
  presenting: boolean;
  /** Eye height above the floor while walking (mm). */
  eyeHeight: number;
  /** Where the walker is (published a few times a second for the mini-map). */
  walkPose: WalkPose | null;
  walk: { request: WalkRequest; nonce: number };
  /** How open each door/drawer is; view state only (see state/openings.ts). */
  openness: Openness;
  camera: { request: CameraRequest; nonce: number };
  preview: Preview | null;

  openProject: (project: KitchenProject) => void;
  closeProject: () => void;
  dispatch: (command: DesignCommand) => CommandResult;
  /**
   * Applies commands as one transaction and one undo step: all succeed or nothing changes. With
   * `expectedRevision`, refuses to apply if the project changed since that revision.
   */
  applyTransaction: (commands: DesignCommand[], label: string, expectedRevision?: number) => TransactionResult;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  setView: (view: ViewMode) => void;
  toggleBom: () => void;
  toggleChecks: () => void;
  toggleGrid: () => void;
  requestCamera: (request: CameraRequest) => void;
  /** Frames the selection, or the whole room when nothing is selected. */
  focusSelection: () => void;
  /** Selects the next (or previous) element in wall/run order and frames it. */
  cycleSelection: (direction: 1 | -1) => void;
  setVisualStyle: (style: VisualStyle) => void;
  setProjection: (projection: Projection) => void;
  toggleAutoHideWalls: () => void;
  setShowInteriors: (show: boolean) => void;
  setInteractMode: (on: boolean) => void;
  setNavMode: (mode: NavMode) => void;
  setPresenting: (on: boolean) => void;
  setEyeHeight: (mm: number) => void;
  setWalkPose: (pose: WalkPose) => void;
  requestWalk: (request: WalkRequest) => void;
  /** Sets how open one door/drawer is (0…1), applying the real-life rules. */
  setOpening: (elementId: string, moverId: string, t: number) => void;
  toggleOpening: (elementId: string, moverId: string) => void;
  /** Opens or closes everything on one element, or on every element when `elementId` is null. */
  setAllOpen: (elementId: string | null, open: boolean) => void;
  setPreview: (preview: Preview | null) => void;
  /** Shows an uncommitted layout option in the plan and 3D views (null returns to the design). */
  previewCandidate: (candidate: { id: string; name: string; project: KitchenProject } | null) => void;
  markSaved: (project: KitchenProject) => void;
  report: (kind: Feedback['kind'], ...messages: string[]) => void;
  clearFeedback: () => void;
}

/** Elements in reading order: wall by wall, along each wall, floor units before wall units. */
export function orderedElements(project: KitchenProject): KitchenElement[] {
  const wallRank = (el: KitchenElement) => WALLS.indexOf(el.wallId ?? 'back');
  return [...allElements(project)].sort((a, b) => wallRank(a) - wallRank(b) || offsetAlongWall(a) - offsetAlongWall(b) || a.position.y - b.position.y);
}

/** Walls are derived from the room and have stable ids: wall-back, wall-left, wall-right, wall-front. */
const WALL_ID = /^wall-(back|left|right|front)$/;

const exists = (project: KitchenProject | null, id: string | null) =>
  Boolean(project && id && (WALL_ID.test(id) || allElements(project).some((e) => e.id === id) || project.openings.some((o) => o.id === id)));

/** The doors and drawers of a unit, or the leaf of a room door. */
function moversOf(project: KitchenProject, id: string): Mover[] {
  const el = allElements(project).find((e) => e.id === id);
  if (el) return buildModel(el).movers;
  const o = project.openings.find((x) => x.id === id);
  return o ? buildOpeningModel(o, project.room).movers : [];
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    project: null,
    revision: 0,
    savedProject: null,
    past: [],
    future: [],
    selectedId: null,
    feedback: null,
    view: '3d',
    showBom: false,
    showChecks: false,
    showGrid: true,
    visualStyle: 'realistic',
    projection: 'perspective',
    autoHideWalls: true,
    showInteriors: false,
    interactMode: false,
    navMode: 'orbit',
    presenting: false,
    eyeHeight: 1600,
    walkPose: null,
    walk: { request: { kind: 'start' }, nonce: 0 },
    openness: {},
    camera: { request: { kind: 'fit' }, nonce: 0 },
    preview: null,

    openProject: (project) =>
      set((s) => {
        s.project = project;
        s.revision += 1;
        s.savedProject = project;
        s.past = [];
        s.future = [];
        s.selectedId = null;
        s.feedback = null;
        s.preview = null;
        s.openness = {};
        s.navMode = 'orbit';
        s.walkPose = null;
        s.camera = { request: { kind: 'fit' }, nonce: s.camera.nonce + 1 };
      }),

    closeProject: () =>
      set((s) => {
        s.project = null;
        s.savedProject = null;
        s.past = [];
        s.future = [];
        s.selectedId = null;
        s.feedback = null;
      }),

    dispatch: (command) => {
      const current = get().project;
      if (!current) return { success: false, errors: ['No project is open.'], affectedEntityIds: [], summary: '' };
      const { project, result } = executeCommand(current, command);
      set((s) => {
        if (!result.success) {
          s.feedback = { kind: 'error', messages: result.errors, at: Date.now() };
          return;
        }
        s.past.push({ project: current, label: result.summary });
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
        s.project = project;
        s.revision += 1;
        if (s.preview?.kind === 'candidate') s.preview = null;
        s.feedback = { kind: 'info', messages: [result.summary], at: Date.now() };
        if (command.type === 'add_cabinet' || command.type === 'add_appliance' || command.type === 'add_opening' || command.type === 'add_furniture') s.selectedId = result.affectedEntityIds[0] ?? null;
        else if (!exists(project, s.selectedId)) s.selectedId = null;
      });
      return result;
    },

    applyTransaction: (commands, label, expectedRevision) => {
      const { project: current, revision } = get();
      if (!current) return { success: false, errors: ['No project is open.'] };
      if (expectedRevision !== undefined && expectedRevision !== revision) return { success: false, stale: true, errors: ['The project changed since this change was previewed.'] };
      const run = executeBatch(current, commands);
      if (!run.success) {
        const errors = run.results.at(-1)?.errors ?? ['The change was rejected.'];
        set((s) => void (s.feedback = { kind: 'error', messages: errors, at: Date.now() }));
        return { success: false, errors };
      }
      set((s) => {
        s.past.push({ project: current, label });
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
        s.project = run.project;
        s.revision += 1;
        if (s.preview?.kind === 'candidate') s.preview = null;
        s.feedback = { kind: 'info', messages: [label], at: Date.now() };
        if (!exists(run.project, s.selectedId)) s.selectedId = null;
      });
      return { success: true, revision: get().revision };
    },

    undo: () =>
      set((s) => {
        const entry = s.past.pop();
        if (!entry || !s.project) return;
        s.future.push({ project: s.project, label: entry.label });
        s.project = entry.project;
        s.revision += 1;
        if (s.preview?.kind === 'candidate') s.preview = null;
        s.feedback = { kind: 'info', messages: [`Undid: ${entry.label}`], at: Date.now() };
        if (!exists(entry.project, s.selectedId)) s.selectedId = null;
      }),

    redo: () =>
      set((s) => {
        const entry = s.future.pop();
        if (!entry || !s.project) return;
        s.past.push({ project: s.project, label: entry.label });
        s.project = entry.project;
        s.revision += 1;
        if (s.preview?.kind === 'candidate') s.preview = null;
        s.feedback = { kind: 'info', messages: [`Redid: ${entry.label}`], at: Date.now() };
        if (!exists(entry.project, s.selectedId)) s.selectedId = null;
      }),

    select: (id) =>
      set((s) => {
        s.selectedId = exists(s.project, id) ? id : null;
      }),
    setView: (view) => set((s) => void (s.view = view)),
    toggleBom: () => set((s) => void (s.showBom = !s.showBom)),
    toggleChecks: () => set((s) => void (s.showChecks = !s.showChecks)),
    toggleGrid: () => set((s) => void (s.showGrid = !s.showGrid)),
    requestCamera: (request) =>
      set((s) => {
        // Standard views and zoom extents are orbit-camera views: they end a walk.
        s.navMode = 'orbit';
        s.camera = { request, nonce: s.camera.nonce + 1 };
      }),
    setNavMode: (mode) =>
      set((s) => {
        s.navMode = mode;
        s.view = '3d';
        if (mode === 'walk') s.walk = { request: s.selectedId ? { kind: 'stand', id: s.selectedId } : { kind: 'start' }, nonce: s.walk.nonce + 1 };
        else s.camera = { request: s.selectedId ? { kind: 'focus', id: s.selectedId } : { kind: 'fit' }, nonce: s.camera.nonce + 1 };
      }),
    setPresenting: (on) =>
      set((s) => {
        s.presenting = on;
        s.interactMode = on;
        s.showGrid = !on;
        s.preview = null;
        s.view = '3d';
        if (on) {
          s.navMode = 'orbit';
          s.selectedId = null;
          s.camera = { request: { kind: 'preset', preset: 'iso' }, nonce: s.camera.nonce + 1 };
        }
      }),
    setEyeHeight: (mm) => set((s) => void (s.eyeHeight = Math.min(2200, Math.max(600, Math.round(mm))))),
    setWalkPose: (pose) => set((s) => void (s.walkPose = pose)),
    requestWalk: (request) =>
      set((s) => {
        s.navMode = 'walk';
        s.view = '3d';
        s.walk = { request, nonce: s.walk.nonce + 1 };
      }),
    focusSelection: () =>
      set((s) => {
        s.view = '3d';
        if (s.navMode === 'walk') {
          // Walking: "focus" means go and stand in front of it.
          s.walk = { request: s.selectedId ? { kind: 'stand', id: s.selectedId } : { kind: 'start' }, nonce: s.walk.nonce + 1 };
          return;
        }
        const request: CameraRequest = s.selectedId ? { kind: 'focus', id: s.selectedId } : { kind: 'fit' };
        s.camera = { request, nonce: s.camera.nonce + 1 };
      }),
    cycleSelection: (direction) =>
      set((s) => {
        if (!s.project) return;
        const ordered = orderedElements(s.project);
        if (!ordered.length) return;
        const i = ordered.findIndex((e) => e.id === s.selectedId);
        const next = ordered[(i + direction + ordered.length) % ordered.length]!;
        s.selectedId = next.id;
        if (s.navMode === 'walk') s.walk = { request: { kind: 'stand', id: next.id }, nonce: s.walk.nonce + 1 };
        else s.camera = { request: { kind: 'focus', id: next.id }, nonce: s.camera.nonce + 1 };
      }),
    setVisualStyle: (style) => set((s) => void (s.visualStyle = style)),
    setProjection: (projection) =>
      set((s) => {
        s.projection = projection;
        s.camera = { request: s.selectedId ? { kind: 'focus', id: s.selectedId } : { kind: 'fit' }, nonce: s.camera.nonce + 1 };
      }),
    toggleAutoHideWalls: () => set((s) => void (s.autoHideWalls = !s.autoHideWalls)),
    setShowInteriors: (show) => set((s) => void (s.showInteriors = show)),
    setInteractMode: (on) =>
      set((s) => {
        s.interactMode = on;
        s.preview = null;
      }),
    setOpening: (elementId, moverId, t) =>
      set((s) => {
        if (s.project) s.openness = setOpening(s.openness, elementId, moversOf(s.project, elementId), moverId, t);
      }),
    toggleOpening: (elementId, moverId) =>
      set((s) => {
        if (s.project) s.openness = toggleOpening(s.openness, elementId, moversOf(s.project, elementId), moverId);
      }),
    setAllOpen: (elementId, open) =>
      set((s) => {
        if (!s.project) return;
        let next: Openness = s.openness;
        const ids = [...allElements(s.project).map((e) => e.id), ...s.project.openings.map((o) => o.id)];
        for (const id of ids) {
          if (elementId && id !== elementId) continue;
          next = setAll(next, id, moversOf(s.project, id), open ? 1 : 0);
        }
        s.openness = next;
      }),
    setPreview: (preview) => set((s) => void (s.preview = preview)),
    previewCandidate: (c) =>
      set((s) => {
        s.preview = c ? { kind: 'candidate', id: c.id, readout: `Previewing: ${c.name} (not applied)`, valid: true, error: null, project: c.project, attempt: null } : s.preview?.kind === 'candidate' ? null : s.preview;
      }),
    markSaved: (project) => set((s) => void (s.savedProject = project)),
    report: (kind, ...messages) => set((s) => void (s.feedback = { kind, messages, at: Date.now() })),
    clearFeedback: () => set((s) => void (s.feedback = null)),
  })),
);

export function useSelectedElement(): KitchenElement | null {
  return useEditorStore((s) => (s.project && s.selectedId ? (allElements(s.project).find((e) => e.id === s.selectedId) ?? null) : null));
}

export function useSelectedOpening(): Opening | null {
  return useEditorStore((s) => (s.project && s.selectedId ? (s.project.openings.find((o) => o.id === s.selectedId) ?? null) : null));
}

export const selectIsDirty = (s: EditorState) => s.project !== null && s.project !== s.savedProject;
