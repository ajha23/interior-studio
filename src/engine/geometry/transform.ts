/** Element-local ↔ room coordinates (mm). Local origin is the bottom centre; local +z is the front. */
import type { KitchenElement } from '@/domain/schema';

type P = { x: number; y: number; z: number };

const turn = (el: KitchenElement) => {
  const r = (el.rotationY * Math.PI) / 180;
  return { cos: Math.round(Math.cos(r)), sin: Math.round(Math.sin(r)) };
};

export function localToRoom(el: KitchenElement, p: P): P {
  const { cos, sin } = turn(el);
  return { x: el.position.x + p.x * cos + p.z * sin, y: el.position.y + p.y, z: el.position.z - p.x * sin + p.z * cos };
}

export function roomToLocal(el: KitchenElement, p: P): P {
  const { cos, sin } = turn(el);
  const dx = p.x - el.position.x;
  const dz = p.z - el.position.z;
  return { x: dx * cos - dz * sin, y: p.y - el.position.y, z: dx * sin + dz * cos };
}
