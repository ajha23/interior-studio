/**
 * Measurements of a layout, computed from the actual geometry (never estimated by a model).
 * Every figure states its assumptions so the designer can judge it.
 */
import { allElements, deriveCountertops, insideOf, isCabinet, specOf, type KitchenElement, type KitchenProject } from '@/domain';
import { elementBox, type Box } from '@/engine/geometry/box';
import { localToRoom } from '@/engine/geometry/transform';

/** Storage: inside volume of cabinet carcasses. A sink unit counts half (plumbing and bowl). */
export const STORAGE_ASSUMPTION = 'Storage is the inside volume of each cabinet (outside size minus 18 mm panels and 8 mm back); sink units count half for plumbing.';

export function storageLitres(project: KitchenProject): number {
  let total = 0;
  for (const c of project.cabinets) {
    const i = insideOf(c.dimensions);
    const litres = (Math.max(0, i.width) * Math.max(0, i.height) * Math.max(0, i.depth)) / 1e6;
    total += c.type === 'sink' ? litres / 2 : litres;
  }
  return Math.round(total);
}

export function counterLength(project: KitchenProject): number {
  return Math.round(deriveCountertops(project).reduce((s, c) => s + c.length, 0));
}

/**
 * Indicative cabinet prices for comparing options, not quotes: a fixed cost per box plus a cost per
 * millimetre of width. Configure for the studio's supplier; the currency is a label only.
 */
export const COST_TABLE = {
  currency: 'GBP',
  perBox: { base: 140, drawer: 260, sink: 180, corner: 220, wall: 110, tall: 320 } as Record<string, number>,
  perMm: { base: 0.22, drawer: 0.3, sink: 0.24, corner: 0.26, wall: 0.18, tall: 0.45 } as Record<string, number>,
  source: 'Placeholder price table (src/ai/layout/metrics.ts); replace with supplier prices.',
};

export function cabinetCost(type: string, width: number): number {
  return Math.round((COST_TABLE.perBox[type] ?? 150) + (COST_TABLE.perMm[type] ?? 0.25) * width);
}

/** Cost of the cabinets a change adds (existing and removed units cost nothing). */
export function changeCost(before: KitchenProject, after: KitchenProject): number {
  const existing = new Set(before.cabinets.map((c) => c.id));
  return after.cabinets.filter((c) => !existing.has(c.id)).reduce((s, c) => s + cabinetCost(c.type, c.dimensions.width), 0);
}

const facing = (el: KitchenElement): { x: number; z: number } => {
  const f = localToRoom(el, { x: 0, y: 0, z: 1 });
  return { x: Math.round(f.x - el.position.x), z: Math.round(f.z - el.position.z) };
};

/**
 * Clear floor in front of each floor unit: from its front to the nearest unit facing back at it,
 * a free-standing unit, or the opposite wall, within the unit's width. Units at right angles (the
 * other leg of an L or U) are corners, not obstacles. Returns the smallest such gap per unit.
 */
export function frontClearances(project: KitchenProject): { id: string; gap: number; against: string }[] {
  const floor = allElements(project).filter((e) => specOf(e).mount === 'floor' && e.position.y < 300);
  const boxes = new Map(floor.map((e) => [e.id, elementBox(e)]));
  const { width: W, length: L } = project.room;
  const out: { id: string; gap: number; against: string }[] = [];
  for (const el of floor) {
    const f = facing(el);
    const b = boxes.get(el.id)!;
    const alongX = f.x === 0; // faces ±z, spans along x
    const [lo, hi] = alongX ? [b.minX, b.maxX] : [b.minZ, b.maxZ];
    const front = f.z === 1 ? b.maxZ : f.z === -1 ? b.minZ : f.x === 1 ? b.maxX : b.minX;
    let gap = f.z === 1 ? L - front : f.z === -1 ? front : f.x === 1 ? W - front : front;
    let against = 'wall';
    for (const other of floor) {
      if (other.id === el.id) continue;
      const o = boxes.get(other.id)!;
      const [olo, ohi] = alongX ? [o.minX, o.maxX] : [o.minZ, o.maxZ];
      if (Math.min(hi, ohi) - Math.max(lo, olo) < 100) continue;
      const of = facing(other);
      const opposite = of.x === -f.x && of.z === -f.z;
      if (other.wallId && !opposite) continue; // a perpendicular run (corner), not a walkway obstacle
      const d = f.z === 1 ? o.minZ - front : f.z === -1 ? front - o.maxZ : f.x === 1 ? o.minX - front : front - o.maxX;
      if (d >= 0 && d < gap) {
        gap = d;
        against = other.id;
      }
    }
    out.push({ id: el.id, gap: Math.round(gap), against });
  }
  return out;
}

export function minWalkway(project: KitchenProject): number | null {
  const gaps = frontClearances(project);
  return gaps.length ? Math.min(...gaps.map((g) => g.gap)) : null;
}

/** Sink → hob → fridge legs (mm) measured between the centres of their fronts, if all exist. */
export function workTriangle(project: KitchenProject): { legs: [number, number, number]; total: number } | null {
  const all = allElements(project);
  const sink = all.find((e) => isCabinet(e) && e.type === 'sink');
  const hob = all.find((e) => !isCabinet(e) && e.type === 'range');
  const fridge = all.find((e) => !isCabinet(e) && e.type === 'fridge');
  if (!sink || !hob || !fridge) return null;
  const front = (e: KitchenElement) => localToRoom(e, { x: 0, y: 0, z: e.dimensions.depth / 2 });
  const [s, h, f] = [front(sink), front(hob), front(fridge)];
  const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));
  const legs: [number, number, number] = [d(s, h), d(h, f), d(f, s)];
  return { legs, total: legs[0] + legs[1] + legs[2] };
}

export interface LayoutMetrics {
  storageLitres: number;
  counterMm: number;
  minWalkwayMm: number | null;
  triangle: { legs: [number, number, number]; total: number } | null;
  cabinets: number;
  changeCost: number;
}

export function layoutMetrics(before: KitchenProject, after: KitchenProject): LayoutMetrics {
  return {
    storageLitres: storageLitres(after),
    counterMm: counterLength(after),
    minWalkwayMm: minWalkway(after),
    triangle: workTriangle(after),
    cabinets: after.cabinets.length,
    changeCost: changeCost(before, after),
  };
}

export type { Box };
