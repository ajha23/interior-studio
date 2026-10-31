/** Element-local ↔ room coordinates (mm). Local origin is the bottom centre; local +z is the front. */
import type { KitchenElement } from '@/domain/schema';

type P = { x: number; y: number; z: number };
/** Anything placed in the room with a frame: a unit, or a wall opening. */
type Framed = Pick<KitchenElement, 'position' | 'rotationY'>;

const turn = (el: Framed) => {
  const r = (el.rotationY * Math.PI) / 180;
  return { cos: Math.round(Math.cos(r)), sin: Math.round(Math.sin(r)) };
};

export function localToRoom(el: Framed, p: P): P {
  const { cos, sin } = turn(el);
  return { x: el.position.x + p.x * cos + p.z * sin, y: el.position.y + p.y, z: el.position.z - p.x * sin + p.z * cos };
}

export function roomToLocal(el: Framed, p: P): P {
  const { cos, sin } = turn(el);
  const dx = p.x - el.position.x;
  const dz = p.z - el.position.z;
  return { x: dx * cos - dz * sin, y: p.y - el.position.y, z: dx * sin + dz * cos };
}
