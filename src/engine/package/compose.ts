/**
 * Composes client-package pages into sheets. Technical pages (layout, elevation, schedule) are
 * generated from the design revision they are pinned to, with the designer's presentation edits
 * applied by stable key; measurements always come from the model. Each page also reports a status
 * (current / customized / stale / needs review / missing source) and selection handles in paper mm
 * for the editor. Handles never reach an exported sheet.
 */
import { parseProjectFile, WALL_LABEL, wallLength, type KitchenProject, type WallId } from '@/domain';
import {
  boardLayout,
  boundsOf,
  chooseScale,
  dimensionGeometry,
  dimensionTextSize,
  NOTE_RED,
  noteBox,
  rowsPerSheet,
  sheetArea,
  textWidth,
  viewOrigin,
  wrapText,
  type Area,
  type ClientTitle,
  type Dimension,
  type ImageRef,
  type Prim,
  type Pt,
  type Sheet,
  type SheetBody,
  type SheetNote,
  type TitleBlock,
  type View,
} from '../deliverables/drawing';
import { elevationView } from '../deliverables/elevationView';
import { DEFAULT_ANNOTATIONS, missingMeasurements, planView } from '../deliverables/plan';
import { contentHash, designRevision, shortRevision } from '../deliverables/revision';
import { SCHEDULE_COLUMNS, scheduleRows } from '../deliverables/schedule';
import { UNIT_LABEL } from '../measurement/units';
import { unitRefs } from '../production/schedule';
import { TECHNICAL, type ClientPackage, type Note, type Override, type Page } from './schema';

export type PageStatus = 'current' | 'customized' | 'stale' | 'needs-review' | 'missing-source';

export const STATUS_LABEL: Record<PageStatus, string> = {
  current: 'Current',
  customized: 'Presentation customized',
  stale: 'Technical content stale',
  'needs-review': 'Needs review',
  'missing-source': 'Missing source data',
};

export type HandleKind = 'note' | 'dim' | 'tag' | 'text' | 'marker' | 'card' | 'snapshot';

export interface Handle {
  key: string;
  kind: HandleKind;
  /** Paper mm. */
  box: Area;
  label: string;
  /** Dimensions: the measured value (mm) — read only. */
  value?: number;
  /** Tags: the design element it refers to. */
  elementId?: string;
  /** Dimensions: unit vectors on paper along the line (u) and away from the object (n). */
  axes?: { u: Pt; n: Pt };
  hidden?: boolean;
}

export interface PackageContext {
  /** The design as it is now. */
  current: KitchenProject;
  /** Uploaded images and snapshots by asset id. */
  assets: ReadonlyMap<string, ImageRef>;
  generatedAt: Date;
  /** Cache of parsed pinned revisions (filled on demand). */
  cache?: Map<string, KitchenProject | null>;
}

export interface ComposedPage {
  sheet: Sheet;
  handles: Handle[];
  status: PageStatus;
  /** Why the page is not simply current. */
  reasons: string[];
  /** Override keys that no longer match anything on the page. */
  orphaned: string[];
}

/** The project a page is pinned to (the current one when the revision is the same). */
export function pinnedProject(pkg: ClientPackage, revision: string, ctx: PackageContext): KitchenProject | null {
  if (designRevision(ctx.current) === revision) return ctx.current;
  const cache = ctx.cache ?? new Map();
  ctx.cache = cache;
  if (!cache.has(revision)) {
    const src = pkg.sources.find((s) => s.revision === revision);
    const parsed = src ? parseProjectFile(src.file) : null;
    cache.set(revision, parsed?.ok ? parsed.project : null);
  }
  return cache.get(revision) ?? null;
}

// ── Technical content ──────────────────────────────────────────────────────────────────────────

const FIXED_SCALE = 1 / 25;

type Technical = { kind: 'view'; view: View } | { kind: 'table'; columns: { label: string; width: number; align?: 'left' | 'right' }[]; rows: string[][] };

/** What a technical page shows for a project, or why it cannot be drawn. */
function technical(project: KitchenProject, page: Page, scale: number): Technical | { missing: string[] } {
  const annotations = { ...DEFAULT_ANNOTATIONS, unit: project.preferences.unit };
  if (page.template === 'schedule') {
    const cols = SCHEDULE_COLUMNS.filter((c) => c.defaultVisible);
    const rows = scheduleRows(project, designRevision(project)).map((r) => cols.map((c) => String(c.value(r))));
    return { kind: 'table', columns: cols.map((c) => ({ label: c.label, width: c.width, align: c.align })), rows };
  }
  if (page.template === 'layout') {
    const missing = missingMeasurements(project, 'plan');
    return missing.length ? { missing } : { kind: 'view', view: keyed(planView(project, annotations, scale), project) };
  }
  const missing = missingMeasurements(project, 'elevation');
  if (!page.wallId) missing.push('the wall to draw');
  if (missing.length) return { missing };
  return { kind: 'view', view: keyed(elevationView(project, page.wallId!, annotations, scale), project) };
}

const r0 = (v: number) => Math.round(v);

/**
 * Stable keys for generated dimensions, tags and texts: what they measure or say (not their order
 * or the scale), so an edit follows its element and is flagged when that element changes.
 */
function keyed(view: View, project: KitchenProject): View {
  // Tags show references (C1, C2, …) that renumber when units are added or removed: key them by element id.
  const idOfRef = new Map([...unitRefs(project)].map(([id, ref]) => [ref, id]));
  const seen = new Map<string, number>();
  const unique = (k: string) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}#${n}`;
  };
  const prims = view.prims.map((p): Prim => {
    if (p.t === 'dim') return { ...p, key: unique(`dim:${p.role}:${p.axis ?? '-'}:${r0(p.a.x)},${r0(p.a.y)}:${r0(p.b.x)},${r0(p.b.y)}`) };
    if (p.t === 'tag') return { ...p, key: unique(`tag:${idOfRef.get(p.text) ?? p.text}`) };
    if (p.t === 'text') return { ...p, key: unique(`text:${p.text}`) };
    return p;
  });
  return { ...view, prims };
}

/** Hash of what a technical page shows for a project (independent of scale and presentation edits). */
export function pageContentHash(project: KitchenProject, page: Page): string {
  const t = technical(project, page, FIXED_SCALE);
  return contentHash('missing' in t ? { missing: t.missing } : t);
}

/** Elevation reference markers on the layout: one per elevation page, inside its wall. */
function markers(project: KitchenProject, pkg: ClientPackage): Prim[] {
  const { width: W, length: L } = project.room;
  const inset = 650;
  const byWall = new Map<WallId, string[]>();
  for (const p of pkg.pages) if (p.template === 'elevation' && p.wallId && p.label) byWall.set(p.wallId, [...(byWall.get(p.wallId) ?? []), p.label]);
  const out: Prim[] = [];
  for (const [wall, labels] of byWall) {
    const len = wallLength(project.room, wall);
    labels.forEach((label, i) => {
      const s = (len * (i + 1)) / (labels.length + 1);
      const at = wall === 'back' ? { x: s, y: inset } : wall === 'front' ? { x: s, y: L - inset } : wall === 'left' ? { x: inset, y: s } : { x: W - inset, y: s };
      out.push({ t: 'tag', at, text: label, r: 3.4, key: `marker:${label}` });
    });
  }
  return out;
}

/** Applies presentation overrides (paper mm) to keyed primitives. */
function applyOverrides(prims: Prim[], overrides: Record<string, Override>, scale: number): Prim[] {
  const out: Prim[] = [];
  for (const p of prims) {
    const o = p.t === 'dim' || p.t === 'tag' || p.t === 'text' ? (p.key ? overrides[p.key] : undefined) : undefined;
    if (!o) {
      out.push(p);
      continue;
    }
    if (o.hidden) continue;
    if (p.t === 'dim') {
      // Along the line: the text slides; across it: the line moves. The value never changes.
      out.push({ ...p, shift: (p.shift ?? 0) + o.dx, offset: p.offset + (Math.sign(p.offset) || 1) * (o.dy / scale) });
    } else if (p.t === 'tag' || p.t === 'text') out.push({ ...p, at: { x: p.at.x + o.dx / scale, y: p.at.y + o.dy / scale } });
  }
  return out;
}

/** Paper-mm directions of a dimension: along the line, and away from the measured object. */
function dimAxes(d: Dimension): { u: Pt; n: Pt } {
  let b = d.b;
  if (d.axis === 'x') b = { x: b.x, y: d.a.y };
  if (d.axis === 'y') b = { x: d.a.x, y: b.y };
  const len = Math.hypot(b.x - d.a.x, b.y - d.a.y) || 1;
  const u = { x: (b.x - d.a.x) / len, y: (b.y - d.a.y) / len };
  const s = Math.sign(d.offset) || 1;
  // Text reading direction (as dimensionGeometry does) so "along" matches what the designer sees.
  const reading = u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y > 0) ? { x: -u.x, y: -u.y } : u;
  return { u: reading, n: { x: u.y * s, y: -u.x * s } };
}

/** The override after dragging a handle by (px, py) paper mm. */
export function dragOverride(handle: Handle, previous: Override | undefined, px: number, py: number): Override {
  const prev = previous ?? { dx: 0, dy: 0 };
  const round = (v: number) => Math.round(v * 10) / 10;
  if (handle.kind === 'dim' && handle.axes) {
    const { u, n } = handle.axes;
    return { ...prev, dx: round(prev.dx + px * u.x + py * u.y), dy: round(prev.dy + px * n.x + py * n.y) };
  }
  return { ...prev, dx: round(prev.dx + px), dy: round(prev.dy + py) };
}

function viewHandles(view: View, scale: number, area: Area, hiddenKeys: string[]): Handle[] {
  const o = viewOrigin(view, scale, area);
  const P = (q: Pt): Pt => ({ x: o.x + q.x * scale, y: o.y + q.y * scale });
  const handles: Handle[] = [];
  for (const p of view.prims) {
    if (p.t === 'dim' && p.key) {
      const g = dimensionGeometry(p, scale);
      const c = P(g.text);
      const w = textWidth(p.text, dimensionTextSize()) + 1.2;
      const h = dimensionTextSize() + 1;
      const vertical = Math.abs(Math.abs(g.rotate) - 90) < 1;
      handles.push({ key: p.key, kind: 'dim', label: p.text, value: p.value, axes: dimAxes(p), box: vertical ? { x: c.x - h + 0.4, y: c.y - w / 2, w: h, h: w } : { x: c.x - w / 2, y: c.y - h + 0.4, w, h } });
    } else if (p.t === 'tag' && p.key) {
      const c = P(p.at);
      const marker = p.key.startsWith('marker:');
      handles.push({ key: p.key, kind: marker ? 'marker' : 'tag', label: p.text, elementId: marker ? undefined : p.key.slice(4).replace(/#\d+$/, ''), box: { x: c.x - p.r, y: c.y - p.r, w: p.r * 2, h: p.r * 2 } });
    } else if (p.t === 'text' && p.key && !p.rotate) {
      const c = P(p.at);
      const w = textWidth(p.text, p.size, p.bold);
      const x = p.anchor === 'middle' ? c.x - w / 2 : p.anchor === 'end' ? c.x - w : c.x;
      handles.push({ key: p.key, kind: 'text', label: p.text, box: { x, y: c.y - p.size, w, h: p.size * 1.25 } });
    }
  }
  // Hidden elements stay selectable from the inspector list, not on the canvas.
  for (const key of hiddenKeys) handles.push({ key, kind: key.startsWith('dim:') ? 'dim' : key.startsWith('marker:') ? 'marker' : key.startsWith('tag:') ? 'tag' : 'text', label: key, box: { x: 0, y: 0, w: 0, h: 0 }, hidden: true });
  return handles;
}

// ── Notes and title block ──────────────────────────────────────────────────────────────────────

export function sheetNote(n: Note): SheetNote {
  return { key: n.id, at: { x: n.x, y: n.y + n.size }, lines: wrapText(n.text, n.size, 120, n.bold), size: n.size, bold: n.bold, color: n.color === 'red' ? NOTE_RED : undefined };
}

function clientTitle(pkg: ClientPackage, scale: string): ClientTitle {
  const i = pkg.info;
  return {
    cells: [
      ['Project', i.projectTitle],
      ['Address', i.address],
      ['Date', i.date],
      ['Scale', scale],
      ['Client', i.client],
      ['Drawn by', i.drawnBy],
      ['Approved by', i.approvedBy],
      ['Reference by', i.referenceBy],
    ],
    revisions: pkg.revisions,
    studio: i.studio,
    studioLines: i.studioAddress ? wrapText(i.studioAddress, 1.9, 60) : [],
  };
}

const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

// ── Composition ────────────────────────────────────────────────────────────────────────────────

export function composePage(pkg: ClientPackage, page: Page, ctx: PackageContext): ComposedPage {
  const index = pkg.pages.findIndex((p) => p.id === page.id);
  const frame = { paper: page.paper, orientation: page.orientation, client: {} as ClientTitle, heading: page.heading || undefined };
  const area = sheetArea(frame);
  const reasons: string[] = [];
  const orphaned: string[] = [];
  let status: PageStatus = 'current';
  let body: SheetBody;
  let scaleLabel = 'NOT TO SCALE';
  let revision = designRevision(ctx.current);
  let handles: Handle[] = [];
  const presentationEdits = page.notes.length > 0 || Object.keys(page.overrides).length > 0;

  if (TECHNICAL.includes(page.template)) {
    const pinned = page.source ? pinnedProject(pkg, page.source.revision, ctx) : null;
    if (!page.source || !pinned) {
      status = 'missing-source';
      reasons.push(page.source ? `The design revision ${shortRevision(page.source.revision)} this page was generated from is not stored. Regenerate it from the current design.` : 'Not generated yet. Regenerate it from the current design.');
      body = placeholder(page);
    } else {
      revision = page.source.revision;
      const t0 = technical(pinned, page, FIXED_SCALE);
      if ('missing' in t0) {
        status = 'missing-source';
        reasons.push(`Missing measurements: ${t0.missing.join(', ')}.`);
        body = placeholder(page);
      } else if (t0.kind === 'table') {
        const per = rowsPerSheet(page.paper, 1, area);
        const shown = t0.rows.slice(0, per);
        const notes = ['Sizes in millimetres, from the design model. “not specified” = information still needed.'];
        if (t0.rows.length > per) notes.push(`${t0.rows.length - per} more rows do not fit on this page: use A3 or export the schedule CSV.`);
        body = { kind: 'table', heading: page.name, columns: t0.columns, rows: shown, notes };
        if (t0.rows.length > per) reasons.push(`${t0.rows.length - per} schedule rows do not fit on this page.`);
      } else {
        // Scale: fit the drawing at 1:25 first, then rebuild with dimension tiers spaced for the scale found.
        const build = (s: number) => {
          const t = technical(pinned, page, s) as Extract<Technical, { kind: 'view' }>;
          const extra = page.template === 'layout' ? markers(pinned, pkg) : [];
          const prims = [...t.view.prims, ...extra];
          return { ...t.view, prims, bounds: boundsOf(prims, 4, s) };
        };
        const s1 = chooseScale(build(FIXED_SCALE), page.paper, 'fit', area);
        const generated = build(s1.scale);
        const s = chooseScale(generated, page.paper, 'fit', area);
        const keys = new Set(generated.prims.map((p) => ('key' in p ? p.key : undefined)).filter((k): k is string => !!k));
        for (const k of Object.keys(page.overrides)) if (!keys.has(k)) orphaned.push(k);
        const prims = applyOverrides(generated.prims, page.overrides, s1.scale);
        // Bounds stay those of the generated drawing so moving a label never shifts the drawing.
        const view: View = { ...generated, prims };
        body = { kind: 'view', view, scale: s1.scale };
        scaleLabel = `${s1.label} on ${page.paper}`;
        if (!s.fits) reasons.push(`The drawing does not fit ${page.paper} at ${s1.label}; use A3.`);
        const hidden = Object.entries(page.overrides).filter(([k, o]) => o.hidden && keys.has(k)).map(([k]) => k);
        handles = viewHandles(view, s1.scale, area, hidden);
      }
      if (status !== 'missing-source') {
        if (pageContentHash(ctx.current, page) !== page.source.hash) {
          status = 'stale';
          reasons.unshift(`The design changed after this page was generated (from ${shortRevision(page.source.revision)}). Regenerate to update it.`);
        } else if (orphaned.length) {
          status = 'needs-review';
          reasons.push(`${orphaned.length} label edit${orphaned.length === 1 ? '' : 's'} no longer match anything on the page.`);
        } else if (presentationEdits) status = 'customized';
      }
    }
  } else if (page.template === 'hardware') {
    const cards = page.cards ?? [];
    const missing = cards.filter((c) => c.assetId && !ctx.assets.has(c.assetId));
    body = { kind: 'board', columns: page.columns ?? 5, cards: cards.map((c) => ({ key: c.id, image: c.assetId ? (ctx.assets.get(c.assetId) ?? null) : null, caption: c.caption, spec: c.spec })) };
    boardLayout(area, cards.length, page.columns ?? 5).forEach((box, i) => handles.push({ key: cards[i]!.id, kind: 'card', label: cards[i]!.caption || `Card ${i + 1}`, box }));
    if (!cards.length) reasons.push('No reference images yet.');
    if (missing.length) {
      status = 'missing-source';
      reasons.push(`${missing.length} image${missing.length === 1 ? ' is' : 's are'} missing from this browser’s storage.`);
    } else if (cards.some((c) => !c.assetId)) {
      status = 'missing-source';
      reasons.push('Some cards have no image yet.');
    } else if (cards.length || presentationEdits) status = 'customized';
  } else {
    const snap = page.snapshot ?? null;
    const image = snap ? (ctx.assets.get(snap.assetId) ?? null) : null;
    body = { kind: 'image', image, caption: snap?.caption || 'Illustration, not to scale: see the drawings for dimensions' };
    handles.push({ key: 'snapshot', kind: 'snapshot', label: '3D view', box: area });
    if (!snap) {
      status = 'missing-source';
      reasons.push('No 3D view captured yet.');
    } else if (!image) {
      status = 'missing-source';
      reasons.push('The captured image is missing from this browser’s storage.');
    } else if (snap.revision !== designRevision(ctx.current)) {
      status = 'stale';
      revision = snap.revision;
      reasons.push(`This view was captured from revision ${shortRevision(snap.revision)}; the design has changed since. Capture it again.`);
    } else if (presentationEdits) status = 'customized';
  }

  const notes = page.notes.map(sheetNote);
  for (const n of notes) handles.push({ key: n.key, kind: 'note', label: n.lines.join(' '), box: noteBox(n) });
  const short = pkg.projectId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || 'PRJ';
  const title: TitleBlock = {
    project: pkg.info.projectTitle || ctx.current.name,
    projectId: pkg.projectId,
    title: page.name,
    drawingNo: `CP-${short}-${String(index + 1).padStart(2, '0')}`,
    revision: shortRevision(revision),
    generated: stamp(ctx.generatedAt),
    units: page.template === 'layout' || page.template === 'elevation' ? UNIT_LABEL[ctx.current.preferences.unit] : 'Millimetres (mm)',
    scale: scaleLabel,
    status: status === 'stale' ? 'STALE: the design changed; regenerate before issuing' : STATUS_LABEL[status],
    sheet: `${index + 1} of ${pkg.pages.length}`,
  };
  const sheet: Sheet = { id: page.id, paper: page.paper, orientation: page.orientation, title, client: clientTitle(pkg, scaleLabel), heading: page.heading || undefined, body, notes };
  return { sheet, handles, status, reasons, orphaned };
}

function placeholder(page: Page): SheetBody {
  return { kind: 'table', heading: page.name, columns: [{ label: 'Not generated', width: 1 }], rows: [], notes: ['This page has no technical content: regenerate it from the design (see the page status).'] };
}

export function composePackage(pkg: ClientPackage, ctx: PackageContext): ComposedPage[] {
  return pkg.pages.map((p) => composePage(pkg, p, ctx));
}

/** Default page title for an elevation. */
export const elevationTitle = (label: string, wallId: WallId) => `Elevation ${label} — ${WALL_LABEL[wallId]}`;
