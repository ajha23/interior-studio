/**
 * Walls as solid pieces around their openings: for each wall, full-height piers between openings,
 * plus the part below each opening's sill and above its head. Room millimetres; the back and front
 * walls run past the corners by the wall thickness so the corners are closed.
 */
import type { Opening, Room, WallId } from '@/domain/schema';
import type { Box } from './box';

export function wallPieces(room: Room, wallId: WallId, openings: Opening[]): Box[] {
  const { width: W, length: L, height: H, wallThickness: T } = room;
  const alongX = wallId === 'back' || wallId === 'front';
  const [a0, a1] = alongX ? [-T, W + T] : [0, L];
  const slab = (lo: number, hi: number, y0: number, y1: number): Box => {
    switch (wallId) {
      case 'back':
        return { minX: lo, maxX: hi, minY: y0, maxY: y1, minZ: -T, maxZ: 0 };
      case 'front':
        return { minX: lo, maxX: hi, minY: y0, maxY: y1, minZ: L, maxZ: L + T };
      case 'left':
        return { minX: -T, maxX: 0, minY: y0, maxY: y1, minZ: lo, maxZ: hi };
      case 'right':
        return { minX: W, maxX: W + T, minY: y0, maxY: y1, minZ: lo, maxZ: hi };
    }
  };
  const pieces: Box[] = [];
  let cursor = a0;
  for (const o of openings.filter((x) => x.wallId === wallId).sort((p, q) => p.offset - q.offset)) {
    const start = Math.max(cursor, o.offset);
    const end = Math.min(a1, o.offset + o.width);
    if (start > cursor) pieces.push(slab(cursor, start, 0, H));
    if (o.sill > 0) pieces.push(slab(start, end, 0, o.sill));
    if (o.sill + o.height < H) pieces.push(slab(start, end, o.sill + o.height, H));
    cursor = Math.max(cursor, end);
  }
  if (cursor < a1) pieces.push(slab(cursor, a1, 0, H));
  return pieces;
}
