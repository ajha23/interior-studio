/**
 * Worktops are derived, never stored: each run of touching worktop-supporting units on one wall
 * gets one slab spanning the run, as deep as its deepest unit plus the front overhang. Editing a
 * cabinet therefore updates its worktop automatically. Where two runs meet in a corner the later
 * slab is trimmed so slabs never overlap.
 */
import { elementBox, type Box } from '@/engine/geometry/box';
import { WALLS, spanAlongWall, wallAxis } from '../room/walls';
import { isCabinet, type KitchenElement, type KitchenProject, type WallId } from '../schema';
import { COUNTERTOP_OVERHANG, COUNTERTOP_THICKNESS, specFor } from './specs';

export interface Countertop {
  /** Derived from the first unit in the run, so it is stable while that unit exists. */
  id: string;
  /** The wall the run stands against; null for a free-standing (island) unit. */
  wallId: WallId | null;
  /** Plan rectangle and vertical extent in room millimetres. */
  box: Box;
  /** Length along the wall and depth from the wall, after corner trimming. */
  length: number;
  depth: number;
  thickness: number;
  entityIds: string[];
}

const JOIN_TOLERANCE = 1;

function supportsCountertop(el: KitchenElement): boolean {
  return specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type).supportsCountertop;
}

export function deriveCountertops(project: KitchenProject): Countertop[] {
  const slabs: Countertop[] = [];
  const all = [...project.cabinets, ...project.appliances];

  for (const wall of WALLS) {
    const units = all
      .filter((el) => el.wallId === wall && supportsCountertop(el))
      .sort((a, b) => spanAlongWall(a).start - spanAlongWall(b).start);
    const runs: KitchenElement[][] = [];
    for (const el of units) {
      const run = runs.at(-1);
      const prev = run?.at(-1);
      if (run && prev && Math.abs(spanAlongWall(el).start - spanAlongWall(prev).end) <= JOIN_TOLERANCE) run.push(el);
      else runs.push([el]);
    }

    for (const run of runs) {
      const boxes = run.map(elementBox);
      const top = Math.max(...boxes.map((b) => b.maxY));
      const depth = Math.max(...run.map((el) => el.dimensions.depth)) + COUNTERTOP_OVERHANG;
      const start = spanAlongWall(run[0]!).start;
      const end = spanAlongWall(run.at(-1)!).end;
      const { room } = project;
      const box: Box =
        wall === 'back' ? { minX: start, maxX: end, minZ: 0, maxZ: depth, minY: top, maxY: top + COUNTERTOP_THICKNESS }
        : wall === 'front' ? { minX: start, maxX: end, minZ: room.length - depth, maxZ: room.length, minY: top, maxY: top + COUNTERTOP_THICKNESS }
        : wall === 'left' ? { minX: 0, maxX: depth, minZ: start, maxZ: end, minY: top, maxY: top + COUNTERTOP_THICKNESS }
        : { minX: room.width - depth, maxX: room.width, minZ: start, maxZ: end, minY: top, maxY: top + COUNTERTOP_THICKNESS };

      for (const other of slabs) trimAgainst(box, other.box, wall);
      const along = wallAxis(wall) === 'x' ? box.maxX - box.minX : box.maxZ - box.minZ;
      if (along <= 0) continue;
      slabs.push({ id: `ct-${run[0]!.id}`, wallId: wall, box, length: along, depth, thickness: COUNTERTOP_THICKNESS, entityIds: run.map((el) => el.id) });
    }
  }

  // Free-standing units each get their own slab, overhanging their front.
  for (const el of all.filter((e) => !e.wallId && supportsCountertop(e))) {
    const b = elementBox(el);
    const box: Box = { ...b, minY: b.maxY, maxY: b.maxY + COUNTERTOP_THICKNESS };
    if (el.rotationY === 0) box.maxZ += COUNTERTOP_OVERHANG;
    else if (el.rotationY === 180) box.minZ -= COUNTERTOP_OVERHANG;
    else if (el.rotationY === 90) box.maxX += COUNTERTOP_OVERHANG;
    else box.minX -= COUNTERTOP_OVERHANG;
    slabs.push({ id: `ct-${el.id}`, wallId: null, box, length: el.dimensions.width, depth: el.dimensions.depth + COUNTERTOP_OVERHANG, thickness: COUNTERTOP_THICKNESS, entityIds: [el.id] });
  }
  return slabs;
}

/** Shortens `box` along its wall so it no longer overlaps `other` in plan at the same height. */
function trimAgainst(box: Box, other: Box, wall: WallId): void {
  const overlapsPlan = box.minX < other.maxX && other.minX < box.maxX && box.minZ < other.maxZ && other.minZ < box.maxZ;
  const overlapsHeight = box.minY < other.maxY && other.minY < box.maxY;
  if (!overlapsPlan || !overlapsHeight) return;
  if (wallAxis(wall) === 'x') {
    if (other.minX <= box.minX) box.minX = Math.max(box.minX, other.maxX);
    else box.maxX = Math.min(box.maxX, other.minX);
  } else if (other.minZ <= box.minZ) {
    box.minZ = Math.max(box.minZ, other.maxZ);
  } else {
    box.maxZ = Math.min(box.maxZ, other.minZ);
  }
}
