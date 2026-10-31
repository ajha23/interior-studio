/**
 * Dimensioned floor plan from the canonical model: walls cut at 1.2 m (openings show as gaps),
 * doors with leaf and swing, windows, worktops, units (wall-hung dashed), furniture and reference
 * tags. Dimensions sit outside the walls in tiers — opening chain, unit chain, internal overall,
 * external overall — plus the wall thickness. Every value is measured from the model.
 */
import { allElements, deriveCountertops, isCabinet, isFurniture, openingPlacement, spanAlongWall, specOf, WALL_LABEL, WALLS, wallLength, type KitchenProject } from '@/domain';
import { elementBox } from '../geometry/box';
import { localToRoom } from '../geometry/transform';
import { wallPieces } from '../geometry/walls';
import type { LengthUnit } from '../measurement/units';
import { unitRefs } from '../production/schedule';
import { boundsOf, formatDimension, type Dimension, type DimensionRole, type Prim, type View } from './drawing';

export interface AnnotationOptions {
  unit: LengthUnit;
  overall: boolean;
  /** Wall thickness and external overall dimensions. */
  walls: boolean;
  openings: boolean;
  /** Chains of unit widths along each wall. */
  units: boolean;
  tags: boolean;
}

export const DEFAULT_ANNOTATIONS: Omit<AnnotationOptions, 'unit'> = { overall: true, walls: true, openings: true, units: true, tags: true };

/** Measurements a drawing needs; empty when everything is there. Never filled in by guessing. */
export function missingMeasurements(project: KitchenProject, what: 'plan' | 'elevation'): string[] {
  const r = project.room as Partial<KitchenProject['room']> | undefined;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const missing: string[] = [];
  if (!ok(r?.width)) missing.push('room width (back wall length)');
  if (!ok(r?.length)) missing.push('room length (side wall length)');
  if (what === 'plan' && !ok(r?.wallThickness)) missing.push('wall thickness');
  if (what === 'elevation' && !ok(r?.height)) missing.push('ceiling (wall) height');
  for (const el of allElements(project)) {
    const d = el.dimensions as Partial<typeof el.dimensions> | undefined;
    if (!ok(d?.width) || !ok(d?.height) || !ok(d?.depth)) missing.push(`size of ${el.id}`);
  }
  return missing;
}

/** Paper millimetres between dimension tiers. */
const FIRST_TIER = 8;
const TIER = 7;

export function planView(project: KitchenProject, options: AnnotationOptions, scale: number): View {
  const { width: W, length: L, wallThickness: T } = project.room;
  const prims: Prim[] = [];
  const cut = 1200;
  const dim = (a: { x: number; y: number }, b: { x: number; y: number }, offset: number, value: number, role: DimensionRole, axis: 'x' | 'y'): Dimension => ({ t: 'dim', a, b, offset, value: Math.round(value), text: formatDimension(value, options.unit), role, axis });

  prims.push({ t: 'rect', x: 0, y: 0, w: W, h: L, stroke: null, fill: 'floor' });
  for (const s of deriveCountertops(project)) prims.push({ t: 'rect', x: s.box.minX, y: s.box.minZ, w: s.box.maxX - s.box.minX, h: s.box.maxZ - s.box.minZ, stroke: 'thin', fill: 'worktop' });

  const refs = unitRefs(project);
  const elements = allElements(project);
  const hung = (id: string) => specOf(elements.find((e) => e.id === id)!).mount === 'wall';
  for (const el of [...elements].sort((a, b) => Number(hung(a.id)) - Number(hung(b.id)))) {
    const b = elementBox(el);
    const wallHung = hung(el.id);
    prims.push({ t: 'rect', x: b.minX, y: b.minZ, w: b.maxX - b.minX, h: b.maxZ - b.minZ, stroke: wallHung ? 'hidden' : isFurniture(el) ? 'thin' : 'medium', fill: wallHung ? 'none' : isCabinet(el) || isFurniture(el) ? 'unit' : 'appliance' });
    if (options.tags && !wallHung) prims.push({ t: 'tag', at: { x: (b.minX + b.maxX) / 2, y: (b.minZ + b.maxZ) / 2 }, text: refs.get(el.id) ?? '', r: 2.6 });
  }

  for (const w of WALLS) {
    for (const p of wallPieces(project.room, w, project.openings).filter((x) => x.minY <= cut && x.maxY >= cut)) {
      prims.push({ t: 'rect', x: p.minX, y: p.minZ, w: p.maxX - p.minX, h: p.maxZ - p.minZ, stroke: 'thick', fill: 'wall' });
    }
  }

  for (const o of project.openings) {
    const frame = openingPlacement(project.room, o);
    const at = (x: number, z: number) => {
      const q = localToRoom(frame, { x, y: 0, z });
      return { x: q.x, y: q.z };
    };
    if (o.kind === 'window') {
      // Frame lines on both faces and the glass in the middle of the wall.
      for (const z of [0, -T, -T / 2]) prims.push({ t: 'line', a: at(-o.width / 2, z), b: at(o.width / 2, z), stroke: z === -T / 2 ? 'medium' : 'thin' });
      continue;
    }
    if (o.kind !== 'door' || o.swing === 'none') {
      for (const z of [0, -T]) prims.push({ t: 'line', a: at(-o.width / 2, z), b: at(o.width / 2, z), stroke: 'hidden' });
      continue;
    }
    const hx = o.hinge === 'left' ? -o.width / 2 : o.width / 2;
    const inward = o.swing === 'in';
    const hinge = at(hx, inward ? 0 : -T);
    const open = at(hx, inward ? o.width : -T - o.width);
    const free = at(-hx, inward ? 0 : -T);
    prims.push({ t: 'line', a: hinge, b: open, stroke: 'medium' });
    prims.push({ t: 'arc', c: hinge, r: o.width, a0: Math.atan2(open.y - hinge.y, open.x - hinge.x), a1: Math.atan2(free.y - hinge.y, free.x - hinge.x), stroke: 'hidden' });
  }

  // Dimension tiers outside each wall. Points are on the wall faces; offsets in model mm.
  const k = 1 / scale;
  for (const w of WALLS) {
    const len = wallLength(project.room, w);
    // Wall frame: along-wall position s → plan point on the outer face, and the outward sign.
    const face = (s: number, outer: boolean) => {
      const d = outer ? T : 0;
      return w === 'back' ? { x: s, y: -d } : w === 'front' ? { x: s, y: L + d } : w === 'left' ? { x: -d, y: s } : { x: W + d, y: s };
    };
    // a→b runs along +x or +y; "left of a→b" is up for horizontal and +x for vertical lines.
    const outwardSign = w === 'back' ? 1 : w === 'front' ? -1 : w === 'left' ? -1 : 1;
    const axis = w === 'back' || w === 'front' ? 'x' : 'y';
    let tier = FIRST_TIER;
    const chain = (cuts: { s: number; e: number; role: DimensionRole }[]) => {
      for (const c of cuts) if (c.e - c.s >= 1) prims.push(dim(face(c.s, true), face(c.e, true), outwardSign * tier * k, c.e - c.s, c.role, axis));
      tier += TIER;
    };
    const openings = project.openings.filter((o) => o.wallId === w).sort((a, b) => a.offset - b.offset);
    if (options.openings && openings.length) chain(segments(len, openings.map((o) => ({ s: o.offset, e: o.offset + o.width })), 'opening'));
    const units = elements.filter((e) => e.wallId === w && !hung(e.id)).map(spanAlongWall).sort((a, b) => a.start - b.start);
    if (options.units && units.length) chain(segments(len, mergeSpans(units).map((u) => ({ s: u.start, e: u.end })), 'segment'));
    if (options.overall) chain([{ s: 0, e: len, role: 'overall' }]);
    // The wall's name, beyond its dimensions.
    const labelAt = face(len / 2, true);
    const away = (tier + (options.walls ? TIER : 0) + 1) * k * outwardSign;
    const rot = w === 'left' ? 90 : w === 'right' ? -90 : 0;
    prims.push({ t: 'text', at: axis === 'x' ? { x: labelAt.x, y: labelAt.y - away + (w === 'front' ? 2.5 * k : 0) } : { x: labelAt.x + away, y: labelAt.y }, text: WALL_LABEL[w].toUpperCase(), size: 2.5, anchor: 'middle', rotate: rot, bold: true });
    if (options.walls) {
      // External overall, from outer corner to outer corner.
      const a = w === 'back' ? { x: -T, y: -T } : w === 'front' ? { x: -T, y: L + T } : w === 'left' ? { x: -T, y: -T } : { x: W + T, y: -T };
      const b = w === 'back' ? { x: W + T, y: -T } : w === 'front' ? { x: W + T, y: L + T } : w === 'left' ? { x: -T, y: L + T } : { x: W + T, y: L + T };
      prims.push(dim(a, b, outwardSign * tier * k, len + 2 * T, 'overall', axis));
    }
  }
  if (options.walls) {
    // Wall thickness once, across the left wall near the front corner (clear of units and labels).
    prims.push(dim({ x: -T, y: L - 150 }, { x: 0, y: L - 150 }, 0, T, 'thickness', 'x'));
  }
  return { id: 'plan', title: 'Floor plan', prims, bounds: boundsOf(prims, 4, scale), notes: ['Plan cut at 1200 mm above the floor. Dashed outlines: wall-hung units. Dimensions to internal wall faces unless noted.'] };
}

/** A chain over the whole wall: pieces between and including the given spans. */
function segments(len: number, spans: { s: number; e: number }[], role: DimensionRole): { s: number; e: number; role: DimensionRole }[] {
  const out: { s: number; e: number; role: DimensionRole }[] = [];
  let at = 0;
  for (const sp of spans) {
    if (sp.s > at) out.push({ s: at, e: sp.s, role: 'segment' });
    out.push({ s: Math.max(at, sp.s), e: sp.e, role });
    at = Math.max(at, sp.e);
  }
  if (at < len) out.push({ s: at, e: len, role: 'segment' });
  return out;
}

/** Each unit is its own span; overlapping spans (none in a valid project) are merged. */
function mergeSpans(spans: { start: number; end: number }[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && s.start < last.end - 0.5) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}
