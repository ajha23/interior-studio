import type { FurnitureItem } from '../domain/types';
import { mm, type Um } from '../domain/units';
import { envelope } from '../furniture';

import type { Poly, Vec } from './vec';

export type { Poly, Vec };

const rad = (deg: number) => (deg * Math.PI) / 180;

export function normDeg(deg: number): number {
  return ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360;
}

/**
 * Map a furniture-local plan point to plan coordinates.
 * Local origin = back-left corner of the footprint; +lx along width, +ly toward the front.
 * rot 0 → back faces north (−y). Positive rotation is clockwise in plan (y points down).
 */
export function localToRoom(item: FurnitureItem, lx: Um, ly: Um): Vec {
  const { widthUm: w, depthUm: d } = envelope(item);
  const cx = lx - w / 2;
  const cy = ly - d / 2;
  const a = rad(item.rotDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: item.xUm + cx * c - cy * s, y: item.yUm + cx * s + cy * c };
}

export function footprint(item: FurnitureItem): Poly {
  const { widthUm: w, depthUm: d } = envelope(item);
  return [localToRoom(item, 0, 0), localToRoom(item, w, 0), localToRoom(item, w, d), localToRoom(item, 0, d)];
}

/** Rectangle in front of a piece (e.g. shutter swing), `depth` deep. */
export function frontZone(item: FurnitureItem, depth: Um): Poly {
  const { widthUm: w, depthUm: d } = envelope(item);
  return [localToRoom(item, 0, d), localToRoom(item, w, d), localToRoom(item, w, d + depth), localToRoom(item, 0, d + depth)];
}

export function bbox(p: Poly) {
  const xs = p.map((v) => v.x);
  const ys = p.map((v) => v.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function axes(p: Poly): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    out.push({ x: nx / len, y: ny / len });
  }
  return out;
}

/**
 * Separating-axis test for convex polygons. Returns the minimum penetration depth (µm), 0 if
 * separated or merely touching within `tolUm`.
 */
export function penetration(a: Poly, b: Poly, tolUm: Um = mm(1)): number {
  let min = Infinity;
  for (const ax of [...axes(a), ...axes(b)]) {
    const pa = a.map((v) => v.x * ax.x + v.y * ax.y);
    const pb = b.map((v) => v.x * ax.x + v.y * ax.y);
    const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (overlap <= tolUm) return 0;
    min = Math.min(min, overlap);
  }
  return min;
}

