/**
 * The client package of the open project: its pages and presentation edits, the images it uses,
 * the selected page and element, and artifact-level undo/redo (separate from design undo: moving a
 * label never changes the design, and undoing it never undoes a design edit).
 *
 * Every change goes through `executePackageCommand` and is saved to IndexedDB straight away.
 */
import { create } from 'zustand';
import { newId, type KitchenProject } from '@/domain';
import type { ImageRef } from '@/engine/deliverables/drawing';
import { pdfBytes, sheetsToPdf } from '@/engine/deliverables/pdf';
import { designRevision, shortRevision } from '@/engine/deliverables/revision';
import { sheetToSvg } from '@/engine/deliverables/svg';
import { createPackage, executePackageCommand, type PackageCommand, type PackageResult } from '@/engine/package/commands';
import { composePackage, composePage, type ComposedPage, type PackageContext } from '@/engine/package/compose';
import type { ClientPackage } from '@/engine/package/schema';
import { listImages, loadPackageFor, saveImage, savePackage } from '@/persistence/projectDb';
import { downloadFile } from './deliverablesStore';
import { useEditorStore } from './editorStore';

const HISTORY = 100;

interface PackageState {
  projectId: string | null;
  pkg: ClientPackage | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  assets: Map<string, ImageRef>;
  past: ClientPackage[];
  future: ClientPackage[];
  pageId: string | null;
  /** Selected element on the page (handle key), or null for the page itself. */
  selection: string | null;
  message: { text: string; error: boolean } | null;
  load: (projectId: string | null) => Promise<void>;
  createStarter: () => void;
  dispatch: (cmd: PackageCommand) => PackageResult;
  /** Replaces the package with an already validated result (chat edits), as one undo step. */
  applyPackage: (next: ClientPackage, message: string) => void;
  undo: () => void;
  redo: () => void;
  selectPage: (pageId: string) => void;
  select: (key: string | null) => void;
  /** Stores a JPEG for this project and returns its asset id. */
  addImage: (image: { data: Uint8Array; w: number; h: number; name: string }) => Promise<string | null>;
  exportPdf: () => { stale: string[] } | null;
  exportSvg: (pageId: string) => void;
}

// Parsed pinned revisions, per package (cleared when another package loads).
let cache = new Map<string, KitchenProject | null>();

/** What composing needs: the current design, the images and the shared revision cache. */
export function packageContext(at = new Date()): PackageContext | null {
  const current = useEditorStore.getState().project;
  if (!current) return null;
  return { current, assets: usePackageStore.getState().assets, generatedAt: at, cache };
}

function persist(pkg: ClientPackage) {
  savePackage(pkg).catch((e: unknown) => usePackageStore.setState({ message: { text: `Could not save the package in this browser: ${e instanceof Error ? e.message : String(e)}`, error: true } }));
}

export const usePackageStore = create<PackageState>()((set, get) => ({
  projectId: null,
  pkg: null,
  status: 'idle',
  error: null,
  assets: new Map(),
  past: [],
  future: [],
  pageId: null,
  selection: null,
  message: null,
  load: async (projectId) => {
    cache = new Map();
    set({ projectId, pkg: null, past: [], future: [], pageId: null, selection: null, message: null, assets: new Map(), status: projectId ? 'loading' : 'idle', error: null });
    if (!projectId) return;
    try {
      const [parsed, images] = await Promise.all([loadPackageFor(projectId), listImages(projectId)]);
      if (get().projectId !== projectId) return;
      const assets = new Map(images.map((i) => [i.id, { id: i.id, w: i.w, h: i.h, data: i.data }]));
      if (parsed && !parsed.ok) return set({ status: 'error', error: `The saved package could not be opened: ${parsed.errors.join('; ')}`, assets });
      set({ pkg: parsed?.package ?? null, pageId: parsed?.package.pages[0]?.id ?? null, assets, status: 'ready' });
    } catch (e) {
      if (get().projectId === projectId) set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  createStarter: () => {
    const project = useEditorStore.getState().project;
    if (!project || get().pkg) return;
    const pkg = createPackage({ project, now: new Date(), newId });
    persist(pkg);
    set({ pkg, pageId: pkg.pages[0]!.id, selection: null, past: [], future: [], status: 'ready', error: null, message: { text: `Created “${pkg.name}” with ${pkg.pages.length} pages from revision ${shortRevision(designRevision(project))}.`, error: false } });
  },
  dispatch: (cmd) => {
    const { pkg } = get();
    const project = useEditorStore.getState().project;
    if (!pkg || !project) return { ok: false, error: 'No package is open.' };
    const r = executePackageCommand(pkg, cmd, { project, now: new Date(), newId });
    if (!r.ok) {
      set({ message: { text: r.error, error: true } });
      return r;
    }
    persist(r.package);
    const pageId = r.selectPageId ?? (r.package.pages.some((p) => p.id === get().pageId) ? get().pageId : (r.package.pages[0]?.id ?? null));
    const selection = cmd.type.startsWith('remove') || cmd.type === 'discard-orphans' ? null : get().selection;
    set({ pkg: r.package, past: [...get().past, pkg].slice(-HISTORY), future: [], pageId, selection: pageId === get().pageId ? selection : null, message: { text: r.message, error: false } });
    return r;
  },
  applyPackage: (next, text) => {
    const { pkg } = get();
    if (!pkg) return;
    persist(next);
    const pageId = next.pages.some((p) => p.id === get().pageId) ? get().pageId : (next.pages[0]?.id ?? null);
    set({ pkg: next, past: [...get().past, pkg].slice(-HISTORY), future: [], pageId, selection: null, message: { text, error: false } });
  },
  undo: () => {
    const { past, pkg, future } = get();
    const prev = past.at(-1);
    if (!prev || !pkg) return;
    persist(prev);
    set({ pkg: prev, past: past.slice(0, -1), future: [pkg, ...future], pageId: prev.pages.some((p) => p.id === get().pageId) ? get().pageId : (prev.pages[0]?.id ?? null), selection: null, message: { text: 'Undone (package only; the design is unchanged).', error: false } });
  },
  redo: () => {
    const { past, pkg, future } = get();
    const next = future[0];
    if (!next || !pkg) return;
    persist(next);
    set({ pkg: next, past: [...past, pkg], future: future.slice(1), pageId: next.pages.some((p) => p.id === get().pageId) ? get().pageId : (next.pages[0]?.id ?? null), selection: null, message: { text: 'Redone.', error: false } });
  },
  selectPage: (pageId) => set({ pageId, selection: null }),
  select: (selection) => set({ selection }),
  addImage: async (image) => {
    const projectId = get().projectId;
    if (!projectId) return null;
    const id = newId('img');
    try {
      await saveImage({ id, projectId, mime: 'image/jpeg', w: image.w, h: image.h, data: image.data, name: image.name.slice(0, 120) });
    } catch (e) {
      set({ message: { text: `Could not store the image: ${e instanceof Error ? e.message : String(e)}`, error: true } });
      return null;
    }
    set({ assets: new Map(get().assets).set(id, { id, w: image.w, h: image.h, data: image.data }) });
    return id;
  },
  exportPdf: () => {
    const { pkg } = get();
    const ctx = packageContext();
    if (!pkg || !ctx) return null;
    const pages = composePackage(pkg, ctx);
    const stale = pkg.pages.filter((_, i) => pages[i]!.status === 'stale').map((p) => p.name);
    const slug = pkg.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'client-package';
    const pdf = sheetsToPdf(
      pages.map((p) => p.sheet),
      { title: pkg.name, subject: `${pkg.info.projectTitle} — ${pages.length} pages; design revision ${shortRevision(designRevision(ctx.current))}${stale.length ? `; STALE pages: ${stale.join(', ')}` : ''}`, created: ctx.generatedAt },
    );
    downloadFile({ fileName: `${slug}.pdf`, mime: 'application/pdf', data: pdfBytes(pdf) });
    set({ message: { text: stale.length ? `Exported ${pages.length} pages. ${stale.length} stale page${stale.length === 1 ? ' is' : 's are'} marked STALE in the title block.` : `Exported ${pages.length} pages.`, error: false } });
    return { stale };
  },
  exportSvg: (pageId) => {
    const { pkg } = get();
    const ctx = packageContext();
    const page = pkg?.pages.find((p) => p.id === pageId);
    if (!pkg || !ctx || !page) return;
    const composed = composePage(pkg, page, ctx);
    downloadFile({ fileName: `${page.name.replace(/[^\w-]+/g, '-').toLowerCase()}.svg`, mime: 'image/svg+xml', data: sheetToSvg(composed.sheet) });
  },
}));

/** Composes the selected page (for the canvas) — recomputed by components when inputs change. */
export function composeSelected(): ComposedPage | null {
  const { pkg, pageId } = usePackageStore.getState();
  const ctx = packageContext();
  const page = pkg?.pages.find((p) => p.id === pageId);
  return pkg && ctx && page ? composePage(pkg, page, ctx) : null;
}

// The package belongs to the open project.
let loaded: string | null = null;
useEditorStore.subscribe((s) => {
  const id = s.project?.id ?? null;
  if (id !== loaded) {
    loaded = id;
    void usePackageStore.getState().load(id);
  }
});
