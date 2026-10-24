import type { Command } from '../domain/commands';
import type { FurnitureItem, Plan } from '../domain/types';
import { mm } from '../domain/units';
import { envelope } from '../furniture';
import { wallGaps } from '../plan/snap';

/**
 * When a piece changes size, keep what designers expect fixed: its back stays where it is (depth
 * grows forward), and an end touching a wall stays on the wall (width grows away from it).
 * Returns the position update for `next` (same id), or null when the centre needn't move.
 * Only axis-aligned pieces are anchored; others grow about their centre.
 */
export function anchoredMove(prev: FurnitureItem, next: FurnitureItem, plan: Plan): Command | null {
  if (Math.round(prev.rotDeg) % 90 !== 0) return null;
  const a = (prev.rotDeg * Math.PI) / 180;
  const e0 = envelope(prev);
  const e1 = envelope(next);
  let { xUm: x, yUm: y } = prev;
  const dW = (e1.widthUm - e0.widthUm) / 2;
  if (dW !== 0) {
    const g = wallGaps(prev, plan);
    const ax = { x: Math.round(Math.cos(a)), y: Math.round(Math.sin(a)) }; // local +x (width) in plan
    const startGap = ax.x === 1 ? g.west : ax.x === -1 ? g.east : ax.y === 1 ? g.north : g.south;
    const endGap = ax.x === 1 ? g.east : ax.x === -1 ? g.west : ax.y === 1 ? g.south : g.north;
    const sign = startGap <= mm(1) ? 1 : endGap <= mm(1) ? -1 : 0;
    x += ax.x * dW * sign;
    y += ax.y * dW * sign;
  }
  const dD = (e1.depthUm - e0.depthUm) / 2;
  if (dD !== 0) {
    // Front direction in plan is (−sin a, cos a): move the centre forward by half the growth.
    x += -Math.sin(a) * dD;
    y += Math.cos(a) * dD;
  }
  x = Math.round(x);
  y = Math.round(y);
  return x === prev.xUm && y === prev.yUm ? null : { type: 'furniture.update', id: prev.id, patch: { xUm: x, yUm: y } };
}
