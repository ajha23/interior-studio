/**
 * Cabinet runs: which walls carry floor units (the kitchen's topology), where each wall is free,
 * and how to fill a stretch of wall with standard module widths. Pure functions over the project.
 */
import { allElements, CABINET_SPECS, spanAlongWall, specOf, WALLS, wallLength, type KitchenElement, type KitchenProject, type WallId } from '@/domain';
import type { Topology } from '../schema';

export const BASE_DEPTH = 560;
export const OVERHANG = 20;

const floorUnits = (p: KitchenProject, wall: WallId) => allElements(p).filter((e) => e.wallId === wall && specOf(e).mount === 'floor').sort((a, b) => spanAlongWall(a).start - spanAlongWall(b).start);

/** Walls with at least 1.2 m of floor units count as a run. */
export function runWalls(project: KitchenProject): WallId[] {
  return WALLS.filter((w) => floorUnits(project, w).reduce((s, e) => s + e.dimensions.width, 0) >= 1200);
}

export const OPPOSITE: Record<WallId, WallId> = { back: 'front', front: 'back', left: 'right', right: 'left' };

export function topologyOf(project: KitchenProject): Exclude<Topology, 'keep'> | 'empty' | 'other' {
  const walls = runWalls(project);
  if (walls.length === 0) return 'empty';
  if (walls.length === 1) return 'straight';
  if (walls.length === 2) return OPPOSITE[walls[0]!] === walls[1] ? 'galley' : 'l-shaped';
  if (walls.length === 3) return 'u-shaped';
  return 'other';
}

export const TOPOLOGY_LABEL: Record<string, string> = { straight: 'single-wall', 'l-shaped': 'L-shaped', 'u-shaped': 'U-shaped', galley: 'galley', empty: 'empty', other: 'four-wall' };

/** The three consecutive walls of each U, middle wall first. */
export const U_SHAPES: { middle: WallId; legs: [WallId, WallId]; open: WallId }[] = [
  { middle: 'back', legs: ['left', 'right'], open: 'front' },
  { middle: 'left', legs: ['back', 'front'], open: 'right' },
  { middle: 'right', legs: ['back', 'front'], open: 'left' },
  { middle: 'front', legs: ['left', 'right'], open: 'back' },
];

/** Deepest floor unit on a wall (how far its run reaches into the room). */
export function runDepth(project: KitchenProject, wall: WallId): number {
  return Math.max(0, ...floorUnits(project, wall).map((e) => e.dimensions.depth));
}

/** Where along `wall` the walls at its start and end are (for corner offsets). */
export function cornerWalls(wall: WallId): { start: WallId; end: WallId } {
  return wall === 'back' || wall === 'front' ? { start: 'left', end: 'right' } : { start: 'back', end: 'front' };
}

/** Free stretches along a wall at floor or upper level, ignoring units on other walls. */
export function freeStretches(project: KitchenProject, wall: WallId, level: 'floor' | 'upper', from = 0, to = wallLength(project.room, wall)): { start: number; end: number }[] {
  const busy = allElements(project)
    .filter((e) => e.wallId === wall && (level === 'floor' ? specOf(e).mount === 'floor' : specOf(e).mount === 'wall' || e.position.y + e.dimensions.height > 1400))
    .map((e) => spanAlongWall(e));
  const doors = level === 'floor' ? project.openings.filter((o) => o.wallId === wall && o.sill < 300).map((o) => ({ start: o.offset, end: o.offset + o.width })) : [];
  const windows = level === 'upper' ? project.openings.filter((o) => o.wallId === wall).map((o) => ({ start: o.offset, end: o.offset + o.width })) : [];
  const blocked = [...busy, ...doors, ...windows].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let at = from;
  for (const b of blocked) {
    if (b.end <= at) continue;
    if (b.start > at) out.push({ start: at, end: Math.min(b.start, to) });
    at = Math.max(at, b.end);
    if (at >= to) break;
  }
  if (at < to) out.push({ start: at, end: to });
  return out.filter((s) => s.end - s.start >= 150);
}

/**
 * Module widths that fill `length` as fully as possible (leftover under 50 mm when the standard
 * sizes allow), from `widths`. `fewest` prefers fewer, wider boxes (cheaper); otherwise prefers
 * 600-ish modules (more doors and drawers to organise). Deterministic.
 */
export function fillWidths(length: number, widths: readonly number[], fewest: boolean): number[] {
  const step = 10;
  const n = Math.floor(length / step);
  // best[i] = [filled length, count, modules] for capacity i*step
  const best: { filled: number; count: number; pick: number[] }[] = Array.from({ length: n + 1 }, () => ({ filled: 0, count: 0, pick: [] }));
  const better = (a: { filled: number; count: number; pick: number[] }, b: { filled: number; count: number; pick: number[] }) => {
    if (a.filled !== b.filled) return a.filled > b.filled;
    if (fewest) return a.count < b.count;
    const dev = (p: number[]) => p.reduce((s, w) => s + Math.abs(w - 600), 0);
    return dev(a.pick) < dev(b.pick);
  };
  for (let i = 1; i <= n; i++) {
    let cur = best[i - 1]!;
    for (const w of widths) {
      const k = w / step;
      if (k > i) continue;
      const prev = best[i - k]!;
      const cand = { filled: prev.filled + w, count: prev.count + 1, pick: [...prev.pick, w] };
      if (better(cand, cur)) cur = cand;
    }
    best[i] = cur;
  }
  return [...best[n]!.pick].sort((a, b) => b - a);
}

export const BASE_WIDTHS = CABINET_SPECS.base.widths;
export const WALL_WIDTHS = CABINET_SPECS.wall.widths;

/** Units of a type on a wall at floor level. */
export function unitsOn(project: KitchenProject, wall: WallId): KitchenElement[] {
  return floorUnits(project, wall);
}
