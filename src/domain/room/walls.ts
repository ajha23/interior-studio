/**
 * Wall frames. An element on a wall has its back against that wall and faces into the room.
 * Its "offset" is the distance from the start of the wall run (the left wall for back/front,
 * the back wall for left/right) to the element's nearest edge.
 */
import { footprintSize } from '@/engine/geometry/box';
import type { Dimensions, KitchenElement, Position, Room, Rotation, WallId } from '../schema';

export const WALLS: readonly WallId[] = ['back', 'left', 'right', 'front'];

export const WALL_LABEL: Record<WallId, string> = { back: 'Back wall', left: 'Left wall', right: 'Right wall', front: 'Front wall' };

/** Rotation that makes an element's front face away from the wall (local +z = into the room). */
export const WALL_ROTATION: Record<WallId, Rotation> = { back: 0, left: 90, right: 270, front: 180 };

/** Which room axis a wall runs along. */
export function wallAxis(wall: WallId): 'x' | 'z' {
  return wall === 'back' || wall === 'front' ? 'x' : 'z';
}

export function wallLength(room: Room, wall: WallId): number {
  return wallAxis(wall) === 'x' ? room.width : room.length;
}

/** Centre position of an element of these dimensions placed on a wall at an offset and elevation. */
export function placeOnWall(room: Room, wall: WallId, dims: Dimensions, offset: number, elevation: number): { position: Position; rotationY: Rotation } {
  const rotationY = WALL_ROTATION[wall];
  const { sx, sz } = footprintSize(dims, rotationY);
  const along = offset + (wallAxis(wall) === 'x' ? sx : sz) / 2;
  const position: Position =
    wall === 'back' ? { x: along, y: elevation, z: sz / 2 }
    : wall === 'front' ? { x: along, y: elevation, z: room.length - sz / 2 }
    : wall === 'left' ? { x: sx / 2, y: elevation, z: along }
    : { x: room.width - sx / 2, y: elevation, z: along };
  return { position, rotationY };
}

/** Distance from the start of the element's wall to its nearest edge along that wall. */
export function offsetAlongWall(el: KitchenElement): number {
  const { sx, sz } = footprintSize(el.dimensions, el.rotationY);
  const wall = el.wallId ?? 'back';
  return wallAxis(wall) === 'x' ? el.position.x - sx / 2 : el.position.z - sz / 2;
}

/**
 * Which local side (±x) moves when the element's width changes. Wall units keep their start along
 * the wall; free-standing units keep their left side (local −x). Mirrors `resize` in the commands.
 */
export function widthGrowSide(el: KitchenElement): 1 | -1 {
  if (!el.wallId) return 1;
  return el.rotationY === 90 || el.rotationY === 180 ? -1 : 1;
}

/** Start and end of an element along its wall's axis. */
export function spanAlongWall(el: KitchenElement): { start: number; end: number } {
  const start = offsetAlongWall(el);
  return { start, end: start + el.dimensions.width };
}
