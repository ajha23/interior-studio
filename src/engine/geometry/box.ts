/** Axis-aligned boxes in room millimetres, used for bounds, collision and drawings. */
import type { Dimensions, Position, Rotation } from '@/domain/schema';

export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Size of an element along the room's x and z axes once rotated. */
export function footprintSize(dims: Dimensions, rotationY: Rotation): { sx: number; sz: number } {
  return rotationY === 0 || rotationY === 180 ? { sx: dims.width, sz: dims.depth } : { sx: dims.depth, sz: dims.width };
}

export function elementBox(el: { dimensions: Dimensions; position: Position; rotationY: Rotation }): Box {
  const { sx, sz } = footprintSize(el.dimensions, el.rotationY);
  return {
    minX: el.position.x - sx / 2,
    maxX: el.position.x + sx / 2,
    minY: el.position.y,
    maxY: el.position.y + el.dimensions.height,
    minZ: el.position.z - sz / 2,
    maxZ: el.position.z + sz / 2,
  };
}

/** True when the boxes share volume; boxes that only touch do not intersect. */
export function boxesIntersect(a: Box, b: Box, tolerance = 0.5): boolean {
  return (
    a.minX < b.maxX - tolerance && b.minX < a.maxX - tolerance &&
    a.minY < b.maxY - tolerance && b.minY < a.maxY - tolerance &&
    a.minZ < b.maxZ - tolerance && b.minZ < a.maxZ - tolerance
  );
}

export function boxSize(b: Box): { x: number; y: number; z: number } {
  return { x: b.maxX - b.minX, y: b.maxY - b.minY, z: b.maxZ - b.minZ };
}

export function unionBoxes(boxes: Box[]): Box {
  return boxes.reduce((u, b) => ({
    minX: Math.min(u.minX, b.minX),
    maxX: Math.max(u.maxX, b.maxX),
    minY: Math.min(u.minY, b.minY),
    maxY: Math.max(u.maxY, b.maxY),
    minZ: Math.min(u.minZ, b.minZ),
    maxZ: Math.max(u.maxZ, b.maxZ),
  }));
}
