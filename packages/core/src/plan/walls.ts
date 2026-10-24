import type { Plan, Pt, Wall, WallSideSign } from '../domain/types';
import { mm, type Um } from '../domain/units';

import type { Poly, Vec } from '../geometry/vec';

export type { Poly, Vec };

/** Endpoints closer than this are treated as the same junction. */
export const JOIN_TOL: Um = mm(1);

export interface WallGeom {
  wall: Wall;
  len: number;
  /** Unit direction a → b. */
  u: Vec;
  /** Unit normal of side +1: (−u.y, u.x). */
  n: Vec;
}

export function wallGeom(w: Wall): WallGeom {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  const u = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  return { wall: w, len, u, n: { x: -u.y, y: u.x } };
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

export function dist(p: Vec, q: Vec): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Point on the centreline `along` from a, shifted `off` toward side +1. */
export function wallPoint(g: WallGeom, along: number, off = 0): Vec {
  return { x: g.wall.a.x + g.u.x * along + g.n.x * off, y: g.wall.a.y + g.u.y * along + g.n.y * off };
}

export interface WallProjection {
  along: number;
  /** Signed perpendicular distance; positive on side +1. */
  offset: number;
  /** Distance from the point to the centreline segment. */
  distance: number;
}

export function projectOnWall(g: WallGeom, p: Vec): WallProjection {
  const rx = p.x - g.wall.a.x;
  const ry = p.y - g.wall.a.y;
  const along = rx * g.u.x + ry * g.u.y;
  const offset = rx * g.n.x + ry * g.n.y;
  const clamped = Math.min(Math.max(along, 0), g.len);
  const distance = Math.hypot(along - clamped, offset);
  return { along, offset, distance };
}

/** Side of the wall a point lies on (+1 / −1). */
export function sideOf(g: WallGeom, p: Vec): WallSideSign {
  return projectOnWall(g, p).offset >= 0 ? 1 : -1;
}

/** True when `p` touches wall `w` (its centreline segment, within tolerance). */
function touches(w: Wall, p: Pt, tol = JOIN_TOL): boolean {
  return projectOnWall(wallGeom(w), p).distance <= tol;
}

/**
 * How far each end of a wall's body extends past its centreline endpoint so that corners close:
 * half the thickness of the thickest other wall it meets at that end.
 */
export function endExtensions(w: Wall, plan: Plan): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const o of plan.walls) {
    if (o.id === w.id) continue;
    if (touches(o, w.a)) a = Math.max(a, o.thicknessUm / 2);
    if (touches(o, w.b)) b = Math.max(b, o.thicknessUm / 2);
  }
  return { a, b };
}

/** The wall's solid body as a rectangle (convex), corners closed by end extensions. */
export function wallBody(w: Wall, plan: Plan): Poly {
  const g = wallGeom(w);
  const ext = endExtensions(w, plan);
  const t = w.thicknessUm / 2;
  return [wallPoint(g, -ext.a, t), wallPoint(g, g.len + ext.b, t), wallPoint(g, g.len + ext.b, -t), wallPoint(g, -ext.a, -t)];
}

export interface WallHit {
  wall: Wall;
  geom: WallGeom;
  along: number;
  offset: number;
  distance: number;
}

/** Nearest wall to a point within `maxDistance` of its centreline (or body), if any. */
export function nearestWall(plan: Plan, p: Vec, maxDistance: number): WallHit | null {
  let best: WallHit | null = null;
  for (const w of plan.walls) {
    const g = wallGeom(w);
    const pr = projectOnWall(g, p);
    const d = Math.max(0, pr.distance - w.thicknessUm / 2);
    if (d <= maxDistance && (!best || d < best.distance)) best = { wall: w, geom: g, along: pr.along, offset: pr.offset, distance: d };
  }
  return best;
}

/** All wall endpoints within `tol` of `p` — used to move a junction as one. */
export function endpointsAt(plan: Plan, p: Vec, tol = JOIN_TOL): { wallId: string; end: 'a' | 'b' }[] {
  const out: { wallId: string; end: 'a' | 'b' }[] = [];
  for (const w of plan.walls) {
    if (dist(w.a, p) <= tol) out.push({ wallId: w.id, end: 'a' });
    if (dist(w.b, p) <= tol) out.push({ wallId: w.id, end: 'b' });
  }
  return out;
}

/** Wall faces (centreline offset by ± half thickness), clipped to the centreline extent. */
export interface Face {
  wallId: string;
  side: WallSideSign;
  p: Vec;
  q: Vec;
}

export function wallFaces(w: Wall): Face[] {
  const g = wallGeom(w);
  const t = w.thicknessUm / 2;
  return [
    { wallId: w.id, side: 1, p: wallPoint(g, 0, t), q: wallPoint(g, g.len, t) },
    { wallId: w.id, side: -1, p: wallPoint(g, 0, -t), q: wallPoint(g, g.len, -t) },
  ];
}

/** Human label for messages: "wall 3 (2,400 mm)". */
export function wallIndexLabel(plan: Plan, wallId: string): string {
  const i = plan.walls.findIndex((w) => w.id === wallId);
  return i < 0 ? 'a missing wall' : `wall ${i + 1}`;
}
