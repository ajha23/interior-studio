/**
 * Kitchen runs: lay cabinets along a wall the way a kitchen designer would. Finds the clear
 * stretches of a wall face inside a room (minus doors, windows that the unit would block, and
 * pieces already on the wall), splits each stretch into modules, and places them backed to the wall.
 */
import { newBaseCabinet, newTallCabinet, newWallCabinet } from '../domain/factory';
import type { FurnitureItem, KitchenItem, Plan, Project } from '../domain/types';
import { mm, splitExact, type Um } from '../domain/units';
import { envelope } from '../furniture';
import { BLIND_MIN_OPEN_UM } from '../furniture/basecabinet';
import { footprint, normDeg } from '../geometry/furniture';
import { interiorPoint } from '../plan/polygon';
import { detectRooms, type DetectedRoom } from '../plan/rooms';
import { projectOnWall, sideOf, wallGeom, wallPoint, type WallGeom } from '../plan/walls';

export type RunType = 'base' | 'wall' | 'tall';

/** Preferred module widths in mm, biggest first (Indian modular kitchen practice). */
export const STANDARD_MODULES_MM = [900, 800, 600, 450, 300] as const;
const MIN_MODULE = mm(150);
const MAX_MODULE: Record<RunType, Um> = { base: mm(1200), wall: mm(1200), tall: mm(900) };

export interface RunSplit {
  widthsUm: Um[];
  /** Length left uncovered (a filler panel) — 0 for an exact fit. */
  fillerUm: Um;
}

/**
 * Split a clear length into modules. 'standard' uses only standard widths and leaves a filler;
 * 'exact' then spreads the filler over the modules (custom carpentry), within each unit's limits.
 */
export function splitRun(lengthUm: Um, type: RunType = 'base', fit: 'exact' | 'standard' = 'exact'): RunSplit {
  const modules = type === 'tall' ? STANDARD_MODULES_MM.filter((m) => m <= 900 && m >= 450) : STANDARD_MODULES_MM;
  const step = 50;
  const L = Math.floor(lengthUm / mm(step));
  if (lengthUm < MIN_MODULE) return { widthsUm: [], fillerUm: Math.max(0, lengthUm) };
  // best[i] = fewest modules (then most 600s) that cover exactly i × 50 mm.
  type Cell = { n: number; six: number; prev: number; m: number } | null;
  const best: Cell[] = Array(L + 1).fill(null);
  best[0] = { n: 0, six: 0, prev: -1, m: 0 };
  for (let i = 1; i <= L; i++) {
    for (const m of modules) {
      const k = m / step;
      if (k > i || !best[i - k]) continue;
      const c = best[i - k]!;
      const cand = { n: c.n + 1, six: c.six + (m === 600 ? 1 : 0), prev: i - k, m };
      const cur = best[i];
      if (!cur || cand.n < cur.n || (cand.n === cur.n && cand.six > cur.six)) best[i] = cand;
    }
  }
  let end = L;
  while (end > 0 && !best[end]) end--;
  const widths: number[] = [];
  for (let i = end; i > 0; i = best[i]!.prev) widths.push(best[i]!.m);
  widths.sort((a, b) => b - a);
  let widthsUm = widths.map((w) => mm(w));
  let fillerUm = lengthUm - widthsUm.reduce((s, w) => s + w, 0);
  if (!widthsUm.length) {
    // Shorter than the smallest standard module but still buildable: one custom unit.
    return fit === 'exact' ? { widthsUm: [Math.min(lengthUm, MAX_MODULE[type])], fillerUm: Math.max(0, lengthUm - MAX_MODULE[type]) } : { widthsUm: [], fillerUm: lengthUm };
  }
  if (fit === 'exact' && fillerUm > 0) {
    const room = widthsUm.map((w) => MAX_MODULE[type] - w);
    const total = room.reduce((s, r) => s + r, 0);
    const give = Math.min(fillerUm, total);
    const shares = splitExact(give, widthsUm.length);
    widthsUm = widthsUm.map((w, i) => w + Math.min(shares[i], room[i]));
    fillerUm = lengthUm - widthsUm.reduce((s, w) => s + w, 0);
  }
  return { widthsUm, fillerUm };
}

export interface WallFace {
  room: DetectedRoom;
  geom: WallGeom;
  /** Side of the wall the room is on. */
  side: 1 | -1;
  /** Clear extent of the face inside the room, as distances along the wall centreline from wall.a. */
  start: Um;
  end: Um;
}

/** The face of a wall inside a room (the room it bounds; the larger one if it bounds two). */
export function wallFace(plan: Plan, wallId: string, rooms: DetectedRoom[] = detectRooms(plan)): WallFace | null {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const geom = wallGeom(wall);
  const candidates = rooms.filter((r) => r.wallIds.includes(wallId)).sort((a, b) => b.areaUm2 - a.areaUm2);
  const room = candidates[0];
  if (!room) return null;
  const side = sideOf(geom, interiorPoint(room.interior));
  // Interior polygon vertices lying on this face give its clear extent (corners already inset).
  const faceOff = (side * wall.thicknessUm) / 2;
  const onFace = room.interior.map((v) => projectOnWall(geom, v)).filter((p) => Math.abs(p.offset - faceOff) < mm(2));
  const start = onFace.length >= 2 ? Math.max(0, Math.min(...onFace.map((p) => p.along))) : 0;
  const end = onFace.length >= 2 ? Math.min(geom.len, Math.max(...onFace.map((p) => p.along))) : geom.len;
  return end - start > mm(1) ? { room, geom, side, start, end } : null;
}

const COUNTER_TOP = mm(850);

/** Vertical band a new unit of this type occupies (floor-based mm). */
function band(type: RunType, mountUm = mm(1450), heightUm = mm(720)): [Um, Um] {
  return type === 'base' ? [0, COUNTER_TOP] : type === 'tall' ? [0, mm(2170)] : [mountUm, mountUm + heightUm];
}

/** Clear stretches of a wall face for a run type, after doors, blocking windows and existing pieces. */
export function freeStretches(project: Project, face: WallFace, type: RunType, opts: { mountUm?: Um; heightUm?: Um; ignoreIds?: string[] } = {}): [Um, Um][] {
  const [z0, z1] = band(type, opts.mountUm, opts.heightUm);
  const blocks: [number, number][] = [];
  for (const o of project.openings) {
    if (o.wallId !== face.geom.wall.id) continue;
    const top = o.sillUm + o.heightUm;
    // Doors block every unit; a window blocks a unit whose band overlaps the glass.
    const blocking = o.kind === 'door' || (o.sillUm < z1 && top > z0);
    if (blocking) blocks.push([o.offsetUm, o.offsetUm + o.widthUm]);
  }
  const faceOff = (face.side * face.geom.wall.thicknessUm) / 2;
  for (const f of project.furniture) {
    if (opts.ignoreIds?.includes(f.id)) continue;
    const e = envelope(f);
    if (!(e.zMinUm < z1 && z0 < e.heightUm) || e.heightUm - e.zMinUm <= mm(30)) continue;
    const pts = footprint(f).map((v) => projectOnWall(face.geom, v));
    // Only pieces standing against this face (within 50 mm) block the run along it.
    const near = Math.min(...pts.map((p) => (p.offset - faceOff) * face.side));
    if (near < -mm(1) || near > mm(50)) continue;
    blocks.push([Math.min(...pts.map((p) => p.along)), Math.max(...pts.map((p) => p.along))]);
  }
  blocks.sort((a, b) => a[0] - b[0]);
  const out: [Um, Um][] = [];
  let cur = face.start;
  for (const [a, b] of blocks) {
    if (b <= cur) continue;
    if (a > cur) out.push([cur, Math.min(a, face.end)]);
    cur = Math.max(cur, b);
    if (cur >= face.end) break;
  }
  if (cur < face.end) out.push([cur, face.end]);
  return out.filter(([a, b]) => b - a >= MIN_MODULE).map(([a, b]) => [Math.round(a), Math.round(b)]);
}

/** Width of the blind panel on a corner unit: the depth of the run that meets it, plus door clearance. */
export const BLIND_CORNER_UM = mm(600);
const MIN_CORNER_MODULE = BLIND_CORNER_UM + BLIND_MIN_OPEN_UM;

/**
 * An inside corner at one end of a face where the perpendicular wall's face is still clear to the
 * corner. A base run meeting it needs a blind-corner unit, so the later run doesn't block the
 * first unit's doors.
 */
function openCorner(project: Project, face: WallFace, end: 'start' | 'end'): boolean {
  const pt = wallPoint(face.geom, end === 'start' ? face.start : face.end, face.side * (face.geom.wall.thicknessUm / 2));
  for (const wid of face.room.wallIds) {
    if (wid === face.geom.wall.id) continue;
    const f2 = wallFace(project.plan, wid, [face.room]);
    if (!f2 || Math.abs(f2.geom.u.x * face.geom.u.x + f2.geom.u.y * face.geom.u.y) > 0.05) continue;
    for (const at of ['start', 'end'] as const) {
      const along = at === 'start' ? f2.start : f2.end;
      const p2 = wallPoint(f2.geom, along, f2.side * (f2.geom.wall.thicknessUm / 2));
      if (Math.hypot(p2.x - pt.x, p2.y - pt.y) > mm(5)) continue;
      // The neighbour's base zone must be free right at the corner.
      return freeStretches(project, f2, 'base').some(([s, e]) => (at === 'start' ? Math.abs(s - f2.start) : Math.abs(e - f2.end)) < mm(1));
    }
  }
  return false;
}

export interface RunPlan {
  items: KitchenItem[];
  stretches: [Um, Um][];
  fillersUm: Um[];
  /** Blind-corner units placed at inside corners. */
  corners: number;
}

/** Rotation that puts a piece's back on the wall face (plan convention: rot 0 → back faces −y). */
function backToWall(face: WallFace): number {
  const n = { x: face.geom.n.x * face.side, y: face.geom.n.y * face.side };
  return Math.round(normDeg((Math.atan2(-n.x, n.y) * 180) / Math.PI) * 1000) / 1000;
}

/**
 * Plan cabinets along a wall face. `template` (e.g. the selected unit) supplies height, depth and
 * finishes so a run matches what's already there.
 */
export function planRun(project: Project, face: WallFace, type: RunType, opts: { fit?: 'exact' | 'standard'; front?: 'doors' | 'drawers'; template?: FurnitureItem; ignoreIds?: string[]; corners?: boolean } = {}): RunPlan {
  const tpl = opts.template && opts.template.kind === (type === 'base' ? 'basecabinet' : type === 'wall' ? 'wallcabinet' : 'tallcabinet') ? opts.template : undefined;
  const mountUm = tpl?.kind === 'wallcabinet' ? tpl.params.mountHeightUm : undefined;
  const heightUm = tpl?.kind === 'wallcabinet' ? tpl.params.heightUm : undefined;
  const stretches = freeStretches(project, face, type, { mountUm, heightUm, ignoreIds: opts.ignoreIds });
  const rot = backToWall(face);
  const items: KitchenItem[] = [];
  const fillersUm: Um[] = [];
  let corners = 0;
  let n = project.furniture.filter((f) => f.kind === (type === 'base' ? 'basecabinet' : type === 'wall' ? 'wallcabinet' : 'tallcabinet')).length;
  for (const [s, e] of stretches) {
    const split = splitRun(e - s, type, opts.fit ?? 'exact');
    fillersUm.push(split.fillerUm);
    // Base runs that end in an inside corner get a blind-corner unit there, using the biggest module.
    let cornerAt: 'start' | 'end' | null = null;
    if (type === 'base' && opts.corners !== false && split.widthsUm.length && Math.max(...split.widthsUm) >= MIN_CORNER_MODULE) {
      if (Math.abs(e - face.end) < mm(1) && openCorner(project, face, 'end')) cornerAt = 'end';
      else if (Math.abs(s - face.start) < mm(1) && openCorner(project, face, 'start')) cornerAt = 'start';
    }
    // Largest module first by default (nearer wall.a); at an end corner it goes last.
    if (cornerAt === 'end') split.widthsUm.reverse();
    // Units start at the stretch end nearer wall.a; a standard-fit filler goes at the far end.
    let along = s;
    for (const w of split.widthsUm) {
      const doorsFor = (width: Um) => (width > mm(600) ? 2 : 1);
      let item: KitchenItem;
      if (type === 'base') {
        const base = tpl?.kind === 'basecabinet' ? tpl.params : undefined;
        const front = opts.front ?? base?.front ?? 'doors';
        item = newBaseCabinet(0, 0, { ...(base ?? {}), widthUm: w, front, doorCount: doorsFor(w) });
      } else if (type === 'wall') {
        const wp = tpl?.kind === 'wallcabinet' ? tpl.params : undefined;
        item = newWallCabinet(0, 0, { ...(wp ?? {}), widthUm: w, doorCount: doorsFor(w) });
      } else {
        const tp = tpl?.kind === 'tallcabinet' ? tpl.params : undefined;
        item = newTallCabinet(0, 0, { ...(tp ?? {}), widthUm: w, doorCount: doorsFor(w) });
      }
      if (tpl) item.materials = { ...(tpl.materials as typeof item.materials) };
      n += 1;
      const isCorner = cornerAt !== null && ((cornerAt === 'end' && w === split.widthsUm[split.widthsUm.length - 1] && along + w >= e - mm(1)) || (cornerAt === 'start' && along <= s + mm(1)));
      item.name = isCorner ? `Corner unit B${n}` : `${type === 'base' ? 'Base unit B' : type === 'wall' ? 'Wall unit W' : 'Tall unit T'}${n}`;
      const d = envelope(item).depthUm;
      const c = wallPoint(face.geom, along + w / 2, face.side * (face.geom.wall.thicknessUm / 2 + d / 2));
      item.xUm = Math.round(c.x);
      item.yUm = Math.round(c.y);
      item.rotDeg = rot;
      if (isCorner && item.kind === 'basecabinet') {
        // Which end of the unit meets the corner depends on how its local x runs along the wall.
        const pts = footprint(item);
        const forward = (pts[1].x - pts[0].x) * face.geom.u.x + (pts[1].y - pts[0].y) * face.geom.u.y > 0;
        item.params = { ...item.params, front: 'doors', doorCount: 1, blindUm: BLIND_CORNER_UM, blindSide: (cornerAt === 'end') === forward ? 'right' : 'left' };
        corners += 1;
      }
      items.push(item);
      along += w;
    }
  }
  return { items, stretches, fillersUm, corners };
}
