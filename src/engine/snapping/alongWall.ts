/**
 * Object snap for moving units along their wall (the CAD "OSNAP" for this domain). Candidates:
 * the wall's start and end, flush against each neighbour at the same height, aligned with units
 * above/below, and clear of units standing on the perpendicular walls. The nearest candidate within
 * the tolerance wins; otherwise the offset rounds to the grid.
 */
import { allElements, elementLabel, spanAlongWall, wallAxis, wallLength, type KitchenElement, type KitchenProject, type WallId } from '@/domain';
import { elementBox } from '../geometry/box';

export interface SnapResult {
  offset: number;
  /** What the offset snapped to, for the live readout; null when it fell back to the grid. */
  snappedTo: string | null;
}

export const SNAP_GRID = 10;

interface Candidate {
  offset: number;
  label: string;
  /** Breaks ties at equal distance: wall ends, then flush, then clearances, then alignments. */
  priority: number;
}

export function snapCandidates(project: KitchenProject, el: KitchenElement, wallId: WallId): Candidate[] {
  const width = el.dimensions.width;
  const len = wallLength(project.room, wallId);
  const axis = wallAxis(wallId);
  const own = elementBox(el);
  const verticalOverlap = (o: KitchenElement) => {
    const b = elementBox(o);
    return b.minY < own.maxY && own.minY < b.maxY;
  };
  const out: Candidate[] = [
    { offset: 0, label: 'wall start', priority: 0 },
    { offset: len - width, label: 'wall end', priority: 0 },
  ];
  for (const o of allElements(project)) {
    if (o.id === el.id) continue;
    const name = elementLabel(o);
    if (o.wallId === wallId) {
      const { start, end } = spanAlongWall(o);
      if (verticalOverlap(o)) {
        out.push({ offset: end, label: `after ${name}`, priority: 1 }, { offset: start - width, label: `before ${name}`, priority: 1 });
      } else {
        out.push({ offset: start, label: `aligned with ${name}`, priority: 3 }, { offset: end - width, label: `aligned with ${name}`, priority: 3 });
      }
    } else if (verticalOverlap(o)) {
      const b = elementBox(o);
      const [min, max] = axis === 'x' ? [b.minX, b.maxX] : [b.minZ, b.maxZ];
      out.push({ offset: max, label: `clear of ${name}`, priority: 2 }, { offset: min - width, label: `clear of ${name}`, priority: 2 });
    }
  }
  return out.filter((c) => c.offset >= 0 && c.offset <= len - width);
}

export function snapAlongWall(project: KitchenProject, el: KitchenElement, wallId: WallId, raw: number, tolerance: number): SnapResult {
  const len = wallLength(project.room, wallId);
  const max = Math.max(0, len - el.dimensions.width);
  let best: Candidate | null = null;
  for (const c of snapCandidates(project, el, wallId)) {
    const d = Math.abs(c.offset - raw);
    if (d > tolerance) continue;
    const bestD = best ? Math.abs(best.offset - raw) : Infinity;
    if (d < bestD || (d === bestD && best && c.priority < best.priority)) best = c;
  }
  if (best) return { offset: Math.round(best.offset), snappedTo: best.label };
  return { offset: Math.min(max, Math.max(0, Math.round(raw / SNAP_GRID) * SNAP_GRID)), snappedTo: null };
}

/** Nearest supported module width to a dragged width. */
export function snapWidth(widths: readonly number[], raw: number): number {
  return widths.reduce((best, w) => (Math.abs(w - raw) < Math.abs(best - raw) ? w : best), widths[0]!);
}
