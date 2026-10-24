import type { FurnitureItem, Plan } from '../domain/types';
import type { Um } from '../domain/units';
import { bbox, footprint } from '../geometry/furniture';
import { wallFaces, type Vec } from './walls';

interface AxisFace {
  /** 'v' = constant x (runs north–south), 'h' = constant y. */
  axis: 'v' | 'h';
  at: number;
  from: number;
  to: number;
}

const AXIS_TOL = 1; // µm

function axisFaces(plan: Plan): AxisFace[] {
  const out: AxisFace[] = [];
  for (const w of plan.walls) {
    for (const f of wallFaces(w)) {
      if (Math.abs(f.p.x - f.q.x) <= AXIS_TOL) out.push({ axis: 'v', at: (f.p.x + f.q.x) / 2, from: Math.min(f.p.y, f.q.y), to: Math.max(f.p.y, f.q.y) });
      else if (Math.abs(f.p.y - f.q.y) <= AXIS_TOL) out.push({ axis: 'h', at: (f.p.y + f.q.y) / 2, from: Math.min(f.p.x, f.q.x), to: Math.max(f.p.x, f.q.x) });
    }
  }
  return out;
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

export interface WallGaps {
  west: number;
  east: number;
  north: number;
  south: number;
  box: { minX: number; maxX: number; minY: number; maxY: number };
  /** Face coordinates the gaps were measured to (for drawing dimension lines). */
  to: { west?: number; east?: number; north?: number; south?: number };
}

/**
 * Clear distances from a piece's bounding box to the nearest axis-aligned wall face in each
 * direction. Infinity when no face lies that way. `slack` lets a face slightly inside the box count
 * (used for snapping a piece that overlaps a wall).
 */
export function wallGaps(item: FurnitureItem, plan: Plan, slack = 0): WallGaps {
  const box = bbox(footprint(item));
  const faces = axisFaces(plan);
  const gaps: WallGaps = { west: Infinity, east: Infinity, north: Infinity, south: Infinity, box, to: {} };
  for (const f of faces) {
    if (f.axis === 'v' && overlaps(box.minY, box.maxY, f.from, f.to)) {
      const west = box.minX - f.at;
      const east = f.at - box.maxX;
      if (west >= -slack && Math.abs(west) < Math.abs(gaps.west)) {
        gaps.west = west;
        gaps.to.west = f.at;
      }
      if (east >= -slack && Math.abs(east) < Math.abs(gaps.east)) {
        gaps.east = east;
        gaps.to.east = f.at;
      }
    }
    if (f.axis === 'h' && overlaps(box.minX, box.maxX, f.from, f.to)) {
      const north = box.minY - f.at;
      const south = f.at - box.maxY;
      if (north >= -slack && Math.abs(north) < Math.abs(gaps.north)) {
        gaps.north = north;
        gaps.to.north = f.at;
      }
      if (south >= -slack && Math.abs(south) < Math.abs(gaps.south)) {
        gaps.south = south;
        gaps.to.south = f.at;
      }
    }
  }
  return gaps;
}

/** Snap a proposed centre so the bounding box sits flush with any wall face within `threshold`; else to the grid. */
export function snapToWalls(item: FurnitureItem, plan: Plan, threshold: Um, grid: Um): Vec {
  const g = wallGaps(item, plan, threshold);
  let dx: number;
  let dy: number;
  if (Math.abs(g.west) <= threshold && Math.abs(g.west) <= Math.abs(g.east)) dx = -g.west;
  else if (Math.abs(g.east) <= threshold) dx = g.east;
  else dx = Math.round(item.xUm / grid) * grid - item.xUm;
  if (Math.abs(g.north) <= threshold && Math.abs(g.north) <= Math.abs(g.south)) dy = -g.north;
  else if (Math.abs(g.south) <= threshold) dy = g.south;
  else dy = Math.round(item.yUm / grid) * grid - item.yUm;
  return { x: Math.round(item.xUm + dx), y: Math.round(item.yUm + dy) };
}

/** Snap a plan point to wall endpoints (within `threshold`), else to the grid. */
export function snapPoint(plan: Plan, p: Vec, threshold: Um, grid: Um, exclude?: Set<string>): { p: Vec; snapped: boolean } {
  let best: Vec | null = null;
  let bestD = threshold;
  for (const w of plan.walls) {
    if (exclude?.has(w.id)) continue;
    for (const q of [w.a, w.b]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  if (best) return { p: { x: best.x, y: best.y }, snapped: true };
  return { p: { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }, snapped: false };
}

/** Lock a segment to horizontal/vertical when it is within `degrees` of an axis. */
export function orthoLock(from: Vec, to: Vec, degrees = 8): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  if (ang <= degrees || ang >= 180 - degrees) return { x: to.x, y: from.y };
  if (Math.abs(ang - 90) <= degrees) return { x: from.x, y: to.y };
  return to;
}
