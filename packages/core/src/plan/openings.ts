import type { Opening, Plan, Wall } from '../domain/types';
import { mm, type Um } from '../domain/units';
import { endExtensions, wallGeom, wallPoint, type Poly, type Vec, type WallGeom } from './walls';

export function wallOf(plan: Plan, o: Opening): Wall | undefined {
  return plan.walls.find((w) => w.id === o.wallId);
}

export interface OpeningSpan {
  wall: Wall;
  g: WallGeom;
  /** Centreline points of the near (start) and far (end) jambs. */
  s: Vec;
  e: Vec;
}

export function openingSpan(plan: Plan, o: Opening): OpeningSpan | null {
  const wall = wallOf(plan, o);
  if (!wall) return null;
  const g = wallGeom(wall);
  return { wall, g, s: wallPoint(g, o.offsetUm), e: wallPoint(g, o.offsetUm + o.widthUm) };
}

/** Square region the door leaf sweeps, on its swing side, starting at the wall face. */
export function doorSwingZone(plan: Plan, o: Opening): Poly | null {
  const sp = openingSpan(plan, o);
  if (!sp) return null;
  const t = sp.wall.thicknessUm / 2;
  const face = o.side * t;
  const far = o.side * (t + o.widthUm);
  return [wallPoint(sp.g, o.offsetUm, face), wallPoint(sp.g, o.offsetUm + o.widthUm, face), wallPoint(sp.g, o.offsetUm + o.widthUm, far), wallPoint(sp.g, o.offsetUm, far)];
}

/** 100 mm strips in front of a window on both faces (furniture there blocks light and opening). */
export function windowStrips(plan: Plan, o: Opening, depth: Um = mm(100)): Poly[] {
  const sp = openingSpan(plan, o);
  if (!sp) return [];
  const t = sp.wall.thicknessUm / 2;
  return ([1, -1] as const).map((side) => [
    wallPoint(sp.g, o.offsetUm, side * t),
    wallPoint(sp.g, o.offsetUm + o.widthUm, side * t),
    wallPoint(sp.g, o.offsetUm + o.widthUm, side * (t + depth)),
    wallPoint(sp.g, o.offsetUm, side * (t + depth)),
  ]);
}

export interface WallPiece {
  /** Along the centreline from wall.a (may be negative / beyond length for corner extensions). */
  a0: Um;
  a1: Um;
  z0: Um;
  z1: Um;
}

/** Solid pieces of a wall, split around its openings, for 3D. */
export function wallPieces(plan: Plan, wall: Wall, openings: Opening[]): WallPiece[] {
  const g = wallGeom(wall);
  const ext = endExtensions(wall, plan);
  const start = -ext.a;
  const end = g.len + ext.b;
  const H = wall.heightUm;
  const ops = openings.filter((o) => o.wallId === wall.id).sort((p, q) => p.offsetUm - q.offsetUm);
  const out: WallPiece[] = [];
  let cursor = start;
  for (const o of ops) {
    const a0 = Math.max(start, o.offsetUm);
    const a1 = Math.min(end, o.offsetUm + o.widthUm);
    if (a1 <= a0) continue;
    if (a0 > cursor) out.push({ a0: cursor, a1: a0, z0: 0, z1: H });
    if (o.sillUm > 0) out.push({ a0, a1, z0: 0, z1: Math.min(o.sillUm, H) });
    const top = o.sillUm + o.heightUm;
    if (top < H) out.push({ a0, a1, z0: top, z1: H });
    cursor = Math.max(cursor, a1);
  }
  if (cursor < end) out.push({ a0: cursor, a1: end, z0: 0, z1: H });
  return out;
}
