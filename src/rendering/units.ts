/**
 * The rendering boundary: the only place millimetres become Three.js world units (metres).
 * Nothing converts back; the domain model stays the source of truth.
 */
export const MM_PER_WORLD_UNIT = 1000;

export function toWorld(mm: number): number {
  return mm / MM_PER_WORLD_UNIT;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
