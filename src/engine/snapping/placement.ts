/**
 * Where a dragged unit lands, from the footprint centre the user is pointing at:
 * - within `WALL_CAPTURE` of a wall (or always, for wall-hung units) it snaps onto that wall, facing
 *   the room, and then snaps along the wall (neighbours, wall ends, grid);
 * - otherwise it stands free (an island): its edges align with nearby units' edges, or fall on the
 *   10 mm grid, and it keeps facing the way it faced.
 * The result carries the `DesignCommand` that commits it.
 */
import {
  allElements,
  elementLabel,
  specOf,
  WALL_ROTATION,
  WALLS,
  wallAxis,
  type DesignCommand,
  type KitchenElement,
  type KitchenProject,
  type Rotation,
  type WallId,
} from '@/domain';
import { elementBox, footprintSize } from '../geometry/box';
import { SNAP_GRID, snapAlongWall } from './alongWall';

/** Back face within this distance of a wall → the unit goes onto that wall. */
export const WALL_CAPTURE = 250;

export type PlacementSnap = (
  | { kind: 'wall'; wallId: WallId; offset: number }
  | { kind: 'free'; x: number; z: number; rotationY: Rotation }
) & { snappedTo: string | null; command: DesignCommand };

function gapToWall(project: KitchenProject, el: KitchenElement, wall: WallId, x: number, z: number): number {
  const half = el.dimensions.depth / 2;
  const { width: W, length: L } = project.room;
  return wall === 'back' ? z - half : wall === 'front' ? L - z - half : wall === 'left' ? x - half : W - x - half;
}

export function snapPlacement(project: KitchenProject, el: KitchenElement, x: number, z: number, tolerance: number): PlacementSnap {
  const spec = specOf(el);
  const nearest = [...WALLS].sort((a, b) => gapToWall(project, el, a, x, z) - gapToWall(project, el, b, x, z))[0]!;
  const elevation = spec.mount === 'wall' ? el.position.y : undefined;

  if (spec.mount === 'wall' || gapToWall(project, el, nearest, x, z) <= WALL_CAPTURE) {
    const along = wallAxis(nearest) === 'x' ? x : z;
    const onWall = { ...el, wallId: nearest, rotationY: WALL_ROTATION[nearest] };
    const snap = snapAlongWall(project, onWall, nearest, along - el.dimensions.width / 2, tolerance);
    const label = el.wallId === nearest ? snap.snappedTo : `${nearest} wall${snap.snappedTo ? ` · ${snap.snappedTo}` : ''}`;
    return {
      kind: 'wall',
      wallId: nearest,
      offset: snap.offset,
      snappedTo: label,
      command: { type: 'move_entity', entityId: el.id, placement: { wallId: nearest, offset: snap.offset, elevation } },
    };
  }

  // Free-standing: keep facing the same way it faced on the wall (or as it was rotated).
  const rotationY = el.wallId ? WALL_ROTATION[el.wallId] : el.rotationY;
  const { sx, sz } = footprintSize(el.dimensions, rotationY);
  const others = allElements(project).filter((o) => o.id !== el.id);
  const snapAxis = (centre: number, size: number, edges: { at: number; name: string }[], limit: number) => {
    let best: { value: number; name: string; d: number } | null = null;
    for (const e of edges) {
      for (const value of [e.at + size / 2, e.at - size / 2]) {
        const d = Math.abs(value - centre);
        if (d <= tolerance && (!best || d < best.d)) best = { value, name: e.name, d };
      }
    }
    const value = best ? best.value : Math.round((centre - size / 2) / SNAP_GRID) * SNAP_GRID + size / 2;
    return { value: Math.min(limit - size / 2, Math.max(size / 2, value)), name: best?.name ?? null };
  };
  const xEdges = others.flatMap((o) => {
    const b = elementBox(o);
    return [{ at: b.minX, name: elementLabel(o) }, { at: b.maxX, name: elementLabel(o) }];
  });
  const zEdges = others.flatMap((o) => {
    const b = elementBox(o);
    return [{ at: b.minZ, name: elementLabel(o) }, { at: b.maxZ, name: elementLabel(o) }];
  });
  const sxSnap = snapAxis(x, sx, xEdges, project.room.width);
  const szSnap = snapAxis(z, sz, zEdges, project.room.length);
  const names = [...new Set([sxSnap.name, szSnap.name].filter(Boolean))];
  return {
    kind: 'free',
    x: sxSnap.value,
    z: szSnap.value,
    rotationY,
    snappedTo: names.length ? `free · aligned with ${names.join(' & ')}` : 'free-standing',
    command: { type: 'place_entity', entityId: el.id, x: sxSnap.value, z: szSnap.value, rotationY },
  };
}
