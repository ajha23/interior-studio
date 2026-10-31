/**
 * Every change to a client package goes through `executePackageCommand`: typed, validated, pure.
 * These commands only touch the presentation layer; changing a measurement is a design command
 * (domain/commands) and never happens here. Regenerating a page pins it to the current design
 * revision and keeps the designer's edits; edits whose element has changed are reported, not
 * silently moved or dropped.
 */
import { produce } from 'immer';
import { serializeProject, WALL_LABEL, WALLS, type KitchenProject, type WallId } from '@/domain';
import { DEFAULT_CONFIG, elevationWalls } from '../deliverables/set';
import { designRevision } from '../deliverables/revision';
import { elevationTitle, pageContentHash } from './compose';
import { cleanText, TECHNICAL, TEMPLATE_LABEL, type Card, type ClientPackage, type Note, type Override, type Page, type PackageInfo, type SnapshotCamera, type Template } from './schema';

export type PackageCommand =
  | { type: 'rename-package'; name: string }
  | { type: 'set-info'; patch: Partial<PackageInfo> }
  | { type: 'add-revision'; revision: { no: string; date: string; description: string } }
  | { type: 'remove-revision'; index: number }
  | { type: 'add-page'; template: Template; wallId?: WallId; at?: number }
  | { type: 'remove-page'; pageId: string }
  | { type: 'duplicate-page'; pageId: string }
  | { type: 'move-page'; pageId: string; to: number }
  | { type: 'update-page'; pageId: string; patch: Partial<Pick<Page, 'name' | 'paper' | 'orientation' | 'heading' | 'label' | 'columns'>> }
  | { type: 'set-wall'; pageId: string; wallId: WallId }
  | { type: 'regenerate-page'; pageId: string }
  | { type: 'add-note'; pageId: string; note: Partial<Omit<Note, 'id'>> & { text: string; x: number; y: number } }
  | { type: 'update-note'; pageId: string; noteId: string; patch: Partial<Omit<Note, 'id'>> }
  | { type: 'remove-note'; pageId: string; noteId: string }
  | { type: 'set-override'; pageId: string; key: string; override: Override | null }
  | { type: 'discard-orphans'; pageId: string; keys: string[] }
  | { type: 'add-card'; pageId: string; card: Partial<Omit<Card, 'id'>> }
  | { type: 'update-card'; pageId: string; cardId: string; patch: Partial<Omit<Card, 'id'>> }
  | { type: 'remove-card'; pageId: string; cardId: string }
  | { type: 'move-card'; pageId: string; cardId: string; to: number }
  | { type: 'set-snapshot'; pageId: string; snapshot: { assetId: string; caption: string; camera?: SnapshotCamera } }
  /** Updates only the caption of an existing snapshot (the image and its revision stay). */
  | { type: 'set-snapshot-caption'; pageId: string; caption: string };

export interface PackageEnv {
  project: KitchenProject;
  now: Date;
  newId: (prefix: string) => string;
}

export type PackageResult = { ok: true; package: ClientPackage; message: string; selectPageId?: string } | { ok: false; error: string };

const fail = (error: string): PackageResult => ({ ok: false, error });
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const formatDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** Pins a technical page to the current design and stores that revision's project file. */
function pin(pkg: ClientPackage, page: Page, env: PackageEnv): void {
  const revision = designRevision(env.project);
  page.source = { revision, hash: pageContentHash(env.project, page) };
  if (!pkg.sources.some((s) => s.revision === revision)) pkg.sources.push({ revision, file: serializeProject(env.project, env.now) });
}

/** Keeps only the project files that some page is still pinned to. */
function prune(pkg: ClientPackage): void {
  const used = new Set(pkg.pages.map((p) => p.source?.revision).filter(Boolean));
  pkg.sources = pkg.sources.filter((s) => used.has(s.revision));
}

function nextLabel(pkg: ClientPackage): string {
  const used = new Set(pkg.pages.map((p) => p.label));
  return [...letters].find((l) => !used.has(l)) ?? String(pkg.pages.length + 1);
}

/** A new page of a template, generated from the current design where it is technical. */
export function newPage(pkg: ClientPackage, template: Template, env: PackageEnv, wallId?: WallId): Page {
  const page: Page = {
    id: env.newId('page'),
    template,
    name: TEMPLATE_LABEL[template],
    paper: 'A3',
    orientation: 'landscape',
    heading: '',
    notes: [],
    overrides: {},
    source: null,
  };
  if (template === 'elevation') {
    page.wallId = wallId ?? elevationWalls(env.project, DEFAULT_CONFIG(env.project.preferences.unit))[0] ?? 'back';
    page.label = nextLabel(pkg);
    page.name = elevationTitle(page.label, page.wallId);
  }
  if (template === 'hardware') {
    page.heading = 'Kitchen hardware & accessories specifications';
    page.columns = 5;
    page.cards = [];
  }
  if (template === 'presentation') {
    page.name = '3D view';
    page.snapshot = null;
  }
  return page;
}

/** A starter package: layout, an elevation per wall in use (A, B, …), hardware board, 3D view and schedule. */
export function createPackage(env: PackageEnv): ClientPackage {
  const p = env.project;
  const pkg: ClientPackage = {
    id: env.newId('pkg'),
    projectId: p.id,
    name: `${p.name} — client package`,
    // Only what the project knows; client and studio details are for the designer to fill in.
    info: { projectTitle: p.name, client: '', address: '', date: formatDate(env.now), drawnBy: '', approvedBy: '', referenceBy: '', studio: '', studioAddress: '' },
    revisions: [],
    sources: [],
    pages: [],
  };
  const add = (template: Template, wallId?: WallId) => {
    const page = newPage(pkg, template, env, wallId);
    pkg.pages.push(page);
    if (TECHNICAL.includes(template)) pin(pkg, page, env);
  };
  add('layout');
  for (const w of elevationWalls(p, DEFAULT_CONFIG(p.preferences.unit))) add('elevation', w);
  add('hardware');
  add('presentation');
  add('schedule');
  return pkg;
}

export function executePackageCommand(pkg: ClientPackage, cmd: PackageCommand, env: PackageEnv): PackageResult {
  const pageOf = (draft: ClientPackage, id: string) => draft.pages.find((p) => p.id === id);
  if ('pageId' in cmd && !pkg.pages.some((p) => p.id === cmd.pageId)) return fail('That page is not in the package any more.');
  let message = '';
  let selectPageId: string | undefined;
  let error: string | null = null;
  const next = produce(pkg, (d) => {
    switch (cmd.type) {
      case 'rename-package': {
        const name = cleanText(cmd.name).trim();
        if (!name) return void (error = 'The package needs a name.');
        d.name = name.slice(0, 80);
        message = 'Package renamed.';
        break;
      }
      case 'set-info': {
        for (const [k, v] of Object.entries(cmd.patch)) if (typeof v === 'string') (d.info as Record<string, string>)[k] = cleanText(v).slice(0, 160);
        message = 'Title block updated.';
        break;
      }
      case 'add-revision': {
        if (d.revisions.length >= 20) return void (error = 'At most 20 revision rows.');
        d.revisions.push({ no: cleanText(cmd.revision.no).slice(0, 6), date: cleanText(cmd.revision.date).slice(0, 30), description: cleanText(cmd.revision.description).slice(0, 120) });
        message = 'Revision row added.';
        break;
      }
      case 'remove-revision':
        d.revisions.splice(cmd.index, 1);
        message = 'Revision row removed.';
        break;
      case 'add-page': {
        if (d.pages.length >= 60) return void (error = 'A package can have at most 60 pages.');
        const page = newPage(d, cmd.template, env, cmd.wallId);
        if (TECHNICAL.includes(cmd.template)) pin(d, page, env);
        d.pages.splice(Math.max(0, Math.min(cmd.at ?? d.pages.length, d.pages.length)), 0, page);
        selectPageId = page.id;
        message = `Added “${page.name}”.`;
        break;
      }
      case 'remove-page': {
        if (d.pages.length === 1) return void (error = 'A package needs at least one page.');
        const i = d.pages.findIndex((p) => p.id === cmd.pageId);
        const [removed] = d.pages.splice(i, 1);
        prune(d);
        selectPageId = d.pages[Math.min(i, d.pages.length - 1)]!.id;
        message = `Deleted “${removed!.name}”.`;
        break;
      }
      case 'duplicate-page': {
        if (d.pages.length >= 60) return void (error = 'A package can have at most 60 pages.');
        const i = d.pages.findIndex((p) => p.id === cmd.pageId);
        const src = d.pages[i]!;
        const copy: Page = JSON.parse(JSON.stringify(src));
        copy.id = env.newId('page');
        copy.name = `${src.name} (copy)`.slice(0, 60);
        copy.notes = copy.notes.map((n) => ({ ...n, id: env.newId('note') }));
        if (copy.cards) copy.cards = copy.cards.map((c) => ({ ...c, id: env.newId('card') }));
        if (copy.template === 'elevation') copy.label = nextLabel(d);
        d.pages.splice(i + 1, 0, copy);
        selectPageId = copy.id;
        message = `Duplicated “${src.name}”.`;
        break;
      }
      case 'move-page': {
        const i = d.pages.findIndex((p) => p.id === cmd.pageId);
        const to = Math.max(0, Math.min(cmd.to, d.pages.length - 1));
        const [page] = d.pages.splice(i, 1);
        d.pages.splice(to, 0, page!);
        message = `Moved “${page!.name}” to position ${to + 1}.`;
        break;
      }
      case 'update-page': {
        const page = pageOf(d, cmd.pageId)!;
        const { name, heading, label, ...rest } = cmd.patch;
        if (name !== undefined) {
          const n = cleanText(name).trim();
          if (!n) return void (error = 'A page needs a name.');
          page.name = n.slice(0, 60);
        }
        if (heading !== undefined) page.heading = cleanText(heading).slice(0, 90);
        if (label !== undefined) {
          const l = cleanText(label).trim().toUpperCase().slice(0, 4);
          if (!l) return void (error = 'An elevation needs a reference letter.');
          if (d.pages.some((p) => p.id !== page.id && p.label === l)) return void (error = `Reference ${l} is already used by another page.`);
          page.label = l;
        }
        if (rest.columns !== undefined && (!Number.isInteger(rest.columns) || rest.columns < 1 || rest.columns > 6)) return void (error = 'Boards have 1 to 6 columns.');
        Object.assign(page, rest);
        message = 'Page updated.';
        break;
      }
      case 'set-wall': {
        const page = pageOf(d, cmd.pageId)!;
        if (page.template !== 'elevation') return void (error = 'Only elevations show a wall.');
        if (!WALLS.includes(cmd.wallId)) return void (error = 'Unknown wall.');
        page.wallId = cmd.wallId;
        page.overrides = {};
        pin(d, page, env);
        prune(d);
        page.name = elevationTitle(page.label ?? '?', cmd.wallId);
        message = `The elevation now shows the ${WALL_LABEL[cmd.wallId].toLowerCase()}.`;
        break;
      }
      case 'regenerate-page': {
        const page = pageOf(d, cmd.pageId)!;
        if (!TECHNICAL.includes(page.template)) return void (error = 'Only drawings and schedules are generated from the design. Capture 3D views again instead.');
        pin(d, page, env);
        prune(d);
        message = `Regenerated “${page.name}” from the current design.`;
        break;
      }
      case 'add-note': {
        const page = pageOf(d, cmd.pageId)!;
        const text = cleanText(cmd.note.text).trim();
        if (!text) return void (error = 'A note needs some text.');
        if (page.notes.length >= 100) return void (error = 'At most 100 notes per page.');
        page.notes.push({ id: env.newId('note'), text: text.slice(0, 400), x: cmd.note.x, y: cmd.note.y, size: cmd.note.size ?? 3, bold: cmd.note.bold ?? true, color: cmd.note.color ?? 'red' });
        message = 'Note added.';
        break;
      }
      case 'update-note': {
        const note = pageOf(d, cmd.pageId)!.notes.find((n) => n.id === cmd.noteId);
        if (!note) return void (error = 'That note was deleted.');
        const { text, size, ...rest } = cmd.patch;
        if (text !== undefined) {
          const t = cleanText(text).trim();
          if (!t) return void (error = 'A note needs some text; delete it instead.');
          note.text = t.slice(0, 400);
        }
        if (size !== undefined) {
          if (!(size >= 1.5 && size <= 12)) return void (error = 'Note text is 1.5 to 12 mm high.');
          note.size = size;
        }
        if (rest.x !== undefined && !Number.isFinite(rest.x)) return void (error = 'Invalid position.');
        if (rest.y !== undefined && !Number.isFinite(rest.y)) return void (error = 'Invalid position.');
        Object.assign(note, rest);
        message = 'Note updated.';
        break;
      }
      case 'remove-note': {
        const page = pageOf(d, cmd.pageId)!;
        page.notes = page.notes.filter((n) => n.id !== cmd.noteId);
        message = 'Note deleted.';
        break;
      }
      case 'set-override': {
        const page = pageOf(d, cmd.pageId)!;
        if (!TECHNICAL.includes(page.template)) return void (error = 'Only generated drawings have labels to move.');
        if (!/^(dim|tag|text|marker):/.test(cmd.key)) return void (error = 'Only dimensions, tags and labels can be moved or hidden.');
        if (cmd.override === null || (!cmd.override.dx && !cmd.override.dy && !cmd.override.hidden)) delete page.overrides[cmd.key];
        else {
          if (!Number.isFinite(cmd.override.dx) || !Number.isFinite(cmd.override.dy) || Math.abs(cmd.override.dx) > 500 || Math.abs(cmd.override.dy) > 500) return void (error = 'Labels can be moved at most 500 mm on the paper.');
          page.overrides[cmd.key] = { dx: cmd.override.dx, dy: cmd.override.dy, ...(cmd.override.hidden ? { hidden: true } : {}) };
        }
        message = cmd.override?.hidden ? 'Hidden on this page.' : 'Label position updated (the measurement is unchanged).';
        break;
      }
      case 'discard-orphans': {
        const page = pageOf(d, cmd.pageId)!;
        for (const k of cmd.keys) delete page.overrides[k];
        message = `Discarded ${cmd.keys.length} edit${cmd.keys.length === 1 ? '' : 's'} that no longer matched the drawing.`;
        break;
      }
      case 'add-card': {
        const page = pageOf(d, cmd.pageId)!;
        if (page.template !== 'hardware') return void (error = 'Reference images go on a hardware board.');
        page.cards ??= [];
        if (page.cards.length >= 40) return void (error = 'At most 40 images per board.');
        page.cards.push({ id: env.newId('card'), assetId: cmd.card.assetId ?? null, caption: cleanText(cmd.card.caption ?? 'Reference image').slice(0, 80), spec: cleanText(cmd.card.spec ?? '').slice(0, 200) });
        message = 'Reference card added.';
        break;
      }
      case 'update-card': {
        const card = pageOf(d, cmd.pageId)!.cards?.find((c) => c.id === cmd.cardId);
        if (!card) return void (error = 'That card was deleted.');
        if (cmd.patch.caption !== undefined) card.caption = cleanText(cmd.patch.caption).slice(0, 80);
        if (cmd.patch.spec !== undefined) card.spec = cleanText(cmd.patch.spec).slice(0, 200);
        if (cmd.patch.assetId !== undefined) card.assetId = cmd.patch.assetId;
        message = 'Card updated.';
        break;
      }
      case 'remove-card': {
        const page = pageOf(d, cmd.pageId)!;
        page.cards = (page.cards ?? []).filter((c) => c.id !== cmd.cardId);
        message = 'Card removed.';
        break;
      }
      case 'move-card': {
        const cards = pageOf(d, cmd.pageId)!.cards ?? [];
        const i = cards.findIndex((c) => c.id === cmd.cardId);
        if (i < 0) return void (error = 'That card was deleted.');
        const [card] = cards.splice(i, 1);
        cards.splice(Math.max(0, Math.min(cmd.to, cards.length)), 0, card!);
        message = 'Card moved.';
        break;
      }
      case 'set-snapshot': {
        const page = pageOf(d, cmd.pageId)!;
        if (page.template !== 'presentation') return void (error = '3D views go on a presentation page.');
        page.snapshot = { assetId: cmd.snapshot.assetId, revision: designRevision(env.project), caption: cleanText(cmd.snapshot.caption).slice(0, 120), ...(cmd.snapshot.camera ? { camera: cmd.snapshot.camera } : {}) };
        message = '3D view captured from the current design.';
        break;
      }
      case 'set-snapshot-caption': {
        const page = pageOf(d, cmd.pageId)!;
        if (!page.snapshot) return void (error = 'Capture a 3D view first.');
        page.snapshot.caption = cleanText(cmd.caption).slice(0, 120);
        message = 'Caption updated.';
        break;
      }
    }
  });
  if (error) return fail(error);
  return { ok: true, package: next, message, selectPageId };
}
