import type { Plan, RoomInfo, Wall } from '../domain/types';
import { area, interiorPoint, perimeter, pointInPolygon, removeCollinear, signedArea } from './polygon';
import { JOIN_TOL, projectOnWall, wallGeom, type Poly, type Vec } from './walls';

export interface DetectedRoom {
  /** RoomInfo id when matched; otherwise a stable id derived from the bounding walls. */
  id: string;
  info: RoomInfo;
  /** True when no stored RoomInfo matched (name and finishes are defaults). */
  auto: boolean;
  /** Closed loop of wall centrelines. */
  centreline: Poly;
  /** Clear floor area inside the wall faces. */
  interior: Poly;
  areaUm2: number;
  perimeterUm: number;
  wallIds: string[];
}

export const DEFAULT_FLOOR_FINISH = 'oak-floor';
export const DEFAULT_WALL_COLOR = 'warm-white';

interface Node {
  p: Vec;
  out: number[]; // neighbour node indices
}

interface Edge {
  u: number;
  v: number;
  wallId: string;
  thickness: number;
}

function segIntersection(p: Vec, p2: Vec, q: Vec, q2: Vec): Vec | null {
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const s = { x: q2.x - q.x, y: q2.y - q.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den;
  const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den;
  const eps = 1e-9;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: p.x + t * r.x, y: p.y + t * r.y };
}

/**
 * Split walls at junctions (shared endpoints, T-junctions and crossings) into a planar graph.
 */
function buildGraph(walls: Wall[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const nodeAt = (p: Vec): number => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].p.x - p.x, nodes[i].p.y - p.y) <= JOIN_TOL) return i;
    nodes.push({ p: { x: p.x, y: p.y }, out: [] });
    return nodes.length - 1;
  };

  // Split points per wall, as distances along the wall.
  const splits = new Map<string, number[]>();
  const geoms = walls.map(wallGeom);
  for (const g of geoms) splits.set(g.wall.id, [0, g.len]);
  for (let i = 0; i < walls.length; i++) {
    const gi = geoms[i];
    if (gi.len <= JOIN_TOL) continue;
    for (let j = 0; j < walls.length; j++) {
      if (i === j) continue;
      const wj = walls[j];
      // Endpoints of other walls landing on this one (T-junctions).
      for (const end of [wj.a, wj.b]) {
        const pr = projectOnWall(gi, end);
        if (pr.distance <= JOIN_TOL && pr.along > JOIN_TOL && pr.along < gi.len - JOIN_TOL) splits.get(gi.wall.id)!.push(pr.along);
      }
      if (j > i) {
        const x = segIntersection(walls[i].a, walls[i].b, wj.a, wj.b);
        if (x) {
          splits.get(gi.wall.id)!.push(projectOnWall(gi, x).along);
          splits.get(wj.id)!.push(projectOnWall(geoms[j], x).along);
        }
      }
    }
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const g of geoms) {
    if (g.len <= JOIN_TOL) continue;
    const ds = [...new Set(splits.get(g.wall.id)!.map((d) => Math.round(d)))].sort((a, b) => a - b);
    for (let k = 0; k + 1 < ds.length; k++) {
      if (ds[k + 1] - ds[k] <= JOIN_TOL) continue;
      const pa = { x: g.wall.a.x + g.u.x * ds[k], y: g.wall.a.y + g.u.y * ds[k] };
      const pb = { x: g.wall.a.x + g.u.x * ds[k + 1], y: g.wall.a.y + g.u.y * ds[k + 1] };
      const u = nodeAt(pa);
      const v = nodeAt(pb);
      if (u === v) continue;
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ u, v, wallId: g.wall.id, thickness: g.wall.thicknessUm });
    }
  }
  return { nodes, edges };
}

/** Remove dangling edges (dead-end walls) — they cannot bound a room. */
function prune(nodes: Node[], edges: Edge[]): Edge[] {
  let live = edges.slice();
  for (;;) {
    const degree = new Array(nodes.length).fill(0);
    for (const e of live) {
      degree[e.u]++;
      degree[e.v]++;
    }
    const next = live.filter((e) => degree[e.u] > 1 && degree[e.v] > 1);
    if (next.length === live.length) return live;
    live = next;
  }
}

function edgeKey(u: number, v: number) {
  return `${u}>${v}`;
}

/**
 * Detect closed rooms from the wall graph and attach stored room properties by seed point.
 * Pure and deterministic: the same walls always give the same rooms in the same order.
 */
export function detectRooms(plan: Plan): DetectedRoom[] {
  const { nodes, edges: raw } = buildGraph(plan.walls);
  const edges = prune(nodes, raw);
  const byKey = new Map<string, Edge>();
  for (const n of nodes) n.out = [];
  for (const e of edges) {
    nodes[e.u].out.push(e.v);
    nodes[e.v].out.push(e.u);
    byKey.set(edgeKey(e.u, e.v), e);
    byKey.set(edgeKey(e.v, e.u), e);
  }
  const angle = (from: number, to: number) => Math.atan2(nodes[to].p.y - nodes[from].p.y, nodes[to].p.x - nodes[from].p.x);
  for (let i = 0; i < nodes.length; i++) nodes[i].out.sort((a, b) => angle(i, a) - angle(i, b));

  // Trace every face of the planar graph: at each node turn to the next edge clockwise.
  const visited = new Set<string>();
  const faces: { loop: number[]; walls: string[]; thick: number[] }[] = [];
  for (const e of edges) {
    for (const [s, t] of [[e.u, e.v], [e.v, e.u]]) {
      if (visited.has(edgeKey(s, t))) continue;
      const loop: number[] = [];
      const walls: string[] = [];
      const thick: number[] = [];
      let u = s;
      let v = t;
      for (let guard = 0; guard < edges.length * 2 + 2; guard++) {
        visited.add(edgeKey(u, v));
        loop.push(u);
        const ed = byKey.get(edgeKey(u, v))!;
        walls.push(ed.wallId);
        thick.push(ed.thickness);
        const around = nodes[v].out;
        const idx = around.indexOf(u);
        const w = around[(idx - 1 + around.length) % around.length];
        u = v;
        v = w;
        if (u === s && v === t) break;
      }
      faces.push({ loop, walls, thick });
    }
  }

  // With the clockwise-turn rule, bounded faces have positive shoelace area; outer faces are negative.
  const rooms: Omit<DetectedRoom, 'id' | 'info' | 'auto'>[] = [];
  for (const f of faces) {
    const poly = f.loop.map((i) => nodes[i].p);
    const a = signedArea(poly);
    if (a <= 0 || poly.length < 3) continue;
    const interior = insetPolygon(poly, f.thick);
    if (!interior) continue;
    rooms.push({
      centreline: poly,
      interior,
      areaUm2: area(interior),
      perimeterUm: perimeter(interior),
      wallIds: [...new Set(f.walls)],
    });
  }
  rooms.sort((p, q) => q.areaUm2 - p.areaUm2 || p.interior[0].y - q.interior[0].y || p.interior[0].x - q.interior[0].x);

  const used = new Set<string>();
  // Automatic names take the lowest "Room N" not used by a named room, so they never collide.
  const taken = new Set(plan.rooms.map((ri) => ri.name));
  const nextAutoName = () => {
    let n = 1;
    while (taken.has(`Room ${n}`)) n++;
    taken.add(`Room ${n}`);
    return `Room ${n}`;
  };
  return rooms.map((r) => {
    const info = plan.rooms.find((ri) => !used.has(ri.id) && pointInPolygon(ri.seed, r.interior, JOIN_TOL));
    if (info) {
      used.add(info.id);
      return { ...r, id: info.id, info, auto: false };
    }
    const id = `auto:${[...r.wallIds].sort().join('+')}`;
    const seed = interiorPoint(r.interior);
    return {
      ...r,
      id,
      auto: true,
      info: {
        id,
        name: nextAutoName(),
        seed: { x: Math.round(seed.x), y: Math.round(seed.y) },
        ceilingUm: plan.defaultCeilingUm,
        floorFinish: DEFAULT_FLOOR_FINISH,
        wallColor: DEFAULT_WALL_COLOR,
      },
    };
  });
}

/**
 * Offset each edge of a closed centreline loop toward the inside by half its wall thickness and
 * intersect neighbouring offset lines. Assumes positive orientation (as produced by detectRooms).
 */
export function insetPolygon(poly: Poly, thickness: number[]): Poly | null {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Positive orientation in shoelace terms → the interior lies on the left normal (−dy, dx).
    const nx = -dy / len;
    const ny = dx / len;
    const off = thickness[i] / 2;
    return { p: { x: a.x + nx * off, y: a.y + ny * off }, d: { x: dx / len, y: dy / len } };
  });
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n];
    const L2 = lines[i];
    const den = L1.d.x * L2.d.y - L1.d.y * L2.d.x;
    if (Math.abs(den) < 1e-9) {
      // Collinear neighbours (a junction mid-wall): keep the offset point.
      out.push({ x: L2.p.x, y: L2.p.y });
      continue;
    }
    const t = ((L2.p.x - L1.p.x) * L2.d.y - (L2.p.y - L1.p.y) * L2.d.x) / den;
    out.push({ x: L1.p.x + L1.d.x * t, y: L1.p.y + L1.d.y * t });
  }
  const cleaned = removeCollinear(out);
  // Walls thicker than the room collapse the polygon (orientation flips): no usable floor.
  return signedArea(cleaned) > 0 ? cleaned : null;
}

/** Room whose interior contains the point, if any. */
export function roomAt(rooms: DetectedRoom[], p: Vec, tol = 0): DetectedRoom | null {
  return rooms.find((r) => pointInPolygon(p, r.interior, tol)) ?? null;
}
