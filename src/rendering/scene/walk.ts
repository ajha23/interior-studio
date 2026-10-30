/**
 * First-person walking: poses, collisions and "stand in front of this unit". Pure maths in room
 * millimetres, so it is tested without WebGL. Yaw 0 looks towards the back wall (−z).
 */
import { allElements, isCabinet, specFor, type KitchenElement, type KitchenProject } from '@/domain';
import { elementBox, type Box } from '@/engine/geometry/box';

export interface WalkPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Half the width of a person: how close the eye can get to cabinets and walls. */
export const BODY_RADIUS = 200;
export const MAX_PITCH = (80 * Math.PI) / 180;

export const EYE_HEIGHTS = [
  { value: 1600, label: 'Standing (1.6 m)' },
  { value: 1150, label: 'Seated (1.15 m)' },
  { value: 1000, label: 'Child (1.0 m)' },
] as const;

export function forward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function right(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Floor-standing units block walking; wall-hung units are above head-height clearance. */
export function obstacles(project: KitchenProject): Box[] {
  return allElements(project)
    .filter((el) => specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type).mount === 'floor')
    .map(elementBox);
}

export function blocked(project: KitchenProject, x: number, z: number, boxes: Box[] = obstacles(project), r = BODY_RADIUS): boolean {
  const { width, length } = project.room;
  if (x < r || z < r || x > width - r || z > length - r) return true;
  return boxes.some((b) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);
}

/** Moves by (dx, dz), sliding along whatever is in the way instead of stopping dead. */
export function step(project: KitchenProject, from: { x: number; z: number }, dx: number, dz: number, boxes: Box[] = obstacles(project)): { x: number; z: number } {
  if (!blocked(project, from.x + dx, from.z + dz, boxes)) return { x: from.x + dx, z: from.z + dz };
  if (!blocked(project, from.x + dx, from.z, boxes)) return { x: from.x + dx, z: from.z };
  if (!blocked(project, from.x, from.z + dz, boxes)) return { x: from.x, z: from.z + dz };
  return from;
}

function lookAt(from: { x: number; z: number }, eye: number, target: { x: number; y: number; z: number }): { yaw: number; pitch: number } {
  const vx = target.x - from.x;
  const vz = target.z - from.z;
  const dist = Math.max(1, Math.hypot(vx, vz));
  return { yaw: Math.atan2(-vx, -vz), pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(target.y - eye, dist))) };
}

/** Where you would stand on entering the room: by the open front, looking at the back wall. */
export function startPose(project: KitchenProject, eye: number): WalkPose {
  const boxes = obstacles(project);
  const x = project.room.width / 2;
  let z = project.room.length - 700;
  while (blocked(project, x, z, boxes) && z > BODY_RADIUS) z -= 100;
  return { x, z, ...lookAt({ x, z }, eye, { x, y: 1100, z: 0 }) };
}

/**
 * Standing in front of a unit, an arm's length from its front, looking at its working height:
 * the worktop or cooktop for floor units, the middle of wall units.
 */
export function standInFront(project: KitchenProject, el: KitchenElement, eye: number): WalkPose {
  const boxes = obstacles(project);
  const r = (el.rotationY * Math.PI) / 180;
  const front = { x: Math.sin(r), z: Math.cos(r) };
  const centre = { x: el.position.x, z: el.position.z };
  const mount = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type).mount;
  const reach = mount === 'wall' ? 700 : el.dimensions.depth / 2 + 550;
  let spot = { x: centre.x + front.x * reach, z: centre.z + front.z * reach };
  for (let d = reach; blocked(project, spot.x, spot.z, boxes) && d < reach + 1500; d += 100) spot = { x: centre.x + front.x * d, z: centre.z + front.z * d };
  if (blocked(project, spot.x, spot.z, boxes)) spot = { x: Math.min(project.room.width - BODY_RADIUS, Math.max(BODY_RADIUS, spot.x)), z: Math.min(project.room.length - BODY_RADIUS, Math.max(BODY_RADIUS, spot.z)) };
  const top = el.position.y + el.dimensions.height;
  const y = mount === 'wall' ? el.position.y + el.dimensions.height / 2 : top;
  return { ...spot, ...lookAt(spot, eye, { x: centre.x, y, z: centre.z }) };
}

/** The closest free spot on the way from `from` to `to` (clicking the floor next to a cabinet). */
export function reachable(project: KitchenProject, from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
  const boxes = obstacles(project);
  for (let t = 1; t >= 0; t -= 0.05) {
    const p = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    if (!blocked(project, p.x, p.z, boxes)) return p;
  }
  return from;
}
