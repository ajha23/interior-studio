import type { FurnitureItem, Opening, Room, WallSide } from '../domain/types';
import { mm, type Um } from '../domain/units';
import { envelope } from '../furniture';

export interface Vec {
  x: number;
  y: number;
}

export type Poly = Vec[];

const rad = (deg: number) => (deg * Math.PI) / 180;

export function normDeg(deg: number): number {
  return ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360;
}

/**
 * Map a furniture-local plan point to room coordinates.
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

/** Largest distance any vertex sits outside the room rectangle (0 = fully inside). */
export function outsideBy(p: Poly, room: Room): number {
  let worst = 0;
  for (const v of p) {
    worst = Math.max(worst, -v.x, v.x - room.widthUm, -v.y, v.y - room.depthUm);
  }
  return worst;
}

export function wallLength(room: Room, wall: WallSide): Um {
  return wall === 'N' || wall === 'S' ? room.widthUm : room.depthUm;
}

/** Plan segment of an opening along the inside face of its wall (start → end in wall direction). */
export function openingSegment(room: Room, o: Opening): [Vec, Vec] {
  const a = o.offsetUm;
  const b = o.offsetUm + o.widthUm;
  switch (o.wall) {
    case 'N':
      return [{ x: a, y: 0 }, { x: b, y: 0 }];
    case 'S':
      return [{ x: a, y: room.depthUm }, { x: b, y: room.depthUm }];
    case 'W':
      return [{ x: 0, y: a }, { x: 0, y: b }];
    case 'E':
      return [{ x: room.widthUm, y: a }, { x: room.widthUm, y: b }];
  }
}

/** Unit normal pointing into the room for a wall. */
export function inwardNormal(wall: WallSide): Vec {
  return wall === 'N' ? { x: 0, y: 1 } : wall === 'S' ? { x: 0, y: -1 } : wall === 'W' ? { x: 1, y: 0 } : { x: -1, y: 0 };
}

/** Square swing zone of a door leaf, inside the room. */
export function doorSwingZone(room: Room, o: Opening): Poly {
  const [s, e] = openingSegment(room, o);
  const n = inwardNormal(o.wall);
  const w = o.widthUm;
  return [s, e, { x: e.x + n.x * w, y: e.y + n.y * w }, { x: s.x + n.x * w, y: s.y + n.y * w }];
}

/** Strip in front of a window (100 mm deep) used to detect tall furniture blocking it. */
export function windowStrip(room: Room, o: Opening): Poly {
  const [s, e] = openingSegment(room, o);
  const n = inwardNormal(o.wall);
  const d = mm(100);
  return [s, e, { x: e.x + n.x * d, y: e.y + n.y * d }, { x: s.x + n.x * d, y: s.y + n.y * d }];
}

/** Clear distances from an axis-aligned piece's bounding box to each wall. */
export function wallGaps(item: FurnitureItem, room: Room) {
  const b = bbox(footprint(item));
  return { west: b.minX, east: room.widthUm - b.maxX, north: b.minY, south: room.depthUm - b.maxY, box: b };
}

/** Snap a proposed centre so the footprint's bounding box sits flush with any wall within `threshold`. */
export function snapToWalls(item: FurnitureItem, room: Room, threshold: Um, grid: Um): Vec {
  const b = bbox(footprint(item));
  let dx = 0;
  let dy = 0;
  if (Math.abs(b.minX) <= threshold) dx = -b.minX;
  else if (Math.abs(room.widthUm - b.maxX) <= threshold) dx = room.widthUm - b.maxX;
  else dx = Math.round(item.xUm / grid) * grid - item.xUm;
  if (Math.abs(b.minY) <= threshold) dy = -b.minY;
  else if (Math.abs(room.depthUm - b.maxY) <= threshold) dy = room.depthUm - b.maxY;
  else dy = Math.round(item.yUm / grid) * grid - item.yUm;
  return { x: Math.round(item.xUm + dx), y: Math.round(item.yUm + dy) };
}

/** Wall pieces (in room coords) split around openings, for the 3D view. Each is [along0, along1, z0, z1]. */
export function wallPieces(room: Room, openings: Opening[], wall: WallSide): { a0: Um; a1: Um; z0: Um; z1: Um }[] {
  const L = wallLength(room, wall);
  const H = room.ceilingUm;
  const ops = openings.filter((o) => o.wall === wall).sort((p, q) => p.offsetUm - q.offsetUm);
  const out: { a0: Um; a1: Um; z0: Um; z1: Um }[] = [];
  let cursor = 0;
  for (const o of ops) {
    const a0 = Math.max(0, o.offsetUm);
    const a1 = Math.min(L, o.offsetUm + o.widthUm);
    if (a0 > cursor) out.push({ a0: cursor, a1: a0, z0: 0, z1: H });
    if (o.sillUm > 0) out.push({ a0, a1, z0: 0, z1: o.sillUm });
    const top = o.sillUm + o.heightUm;
    if (top < H) out.push({ a0, a1, z0: top, z1: H });
    cursor = Math.max(cursor, a1);
  }
  if (cursor < L) out.push({ a0: cursor, a1: L, z0: 0, z1: H });
  return out;
}
