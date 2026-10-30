/**
 * Where the camera should go for each navigation request, in world metres. Pure maths, so it is
 * unit-tested without WebGL. "Radius" is the bounding-sphere radius of what must fit in view.
 */
import { allElements, type KitchenProject } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import type { CameraRequest } from '@/state/editorStore';
import { toWorld } from '../units';

export type Vec3 = [number, number, number];

export interface CameraGoal {
  position: Vec3;
  target: Vec3;
  radius: number;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Distance at which a sphere of `radius` fits a perspective view with this vertical FOV and aspect. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 1.1): number {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return (radius * margin) / Math.sin(Math.min(v, h) / 2);
}

function goal(target: Vec3, direction: Vec3, radius: number, fovDeg: number, aspect: number, minDistance = 0.8): CameraGoal {
  const d = Math.max(minDistance, fitDistance(radius, fovDeg, aspect));
  const n = norm(direction);
  return { position: [target[0] + n[0] * d, target[1] + n[1] * d, target[2] + n[2] * d], target, radius };
}

export function cameraGoal(project: KitchenProject, request: CameraRequest, fovDeg: number, aspect: number): CameraGoal | null {
  const W = toWorld(project.room.width);
  const L = toWorld(project.room.length);
  const H = toWorld(project.room.height);
  const centre: Vec3 = [W / 2, H / 2, L / 2];

  if (request.kind === 'focus') {
    const el = allElements(project).find((e) => e.id === request.id);
    if (!el) return null;
    const b = elementBox(el);
    const target: Vec3 = [toWorld((b.minX + b.maxX) / 2), toWorld((b.minY + b.maxY) / 2), toWorld((b.minZ + b.maxZ) / 2)];
    const radius = Math.max(0.35, toWorld(Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ)) / 2);
    // Look at the element's front (local +z), from slightly above and to the side.
    const r = (el.rotationY * Math.PI) / 180;
    const front: Vec3 = [Math.sin(r), 0, Math.cos(r)];
    const side: Vec3 = [Math.cos(r), 0, -Math.sin(r)];
    return goal(target, [front[0] + side[0] * 0.35, 0.45, front[2] + side[2] * 0.35], radius * 1.8, fovDeg, aspect);
  }

  if (request.kind === 'fit') {
    return goal(centre, [0.55, 0.62, 1], Math.hypot(W, L, H) / 2, fovDeg, aspect);
  }

  switch (request.preset) {
    case 'top':
      return goal([W / 2, 0, L / 2], [0, 1, 0.0001], Math.hypot(W, L) / 2, fovDeg, aspect);
    case 'front': // elevation of the back wall, seen from inside the room
      return goal([W / 2, H / 2, 0], [0, 0, 1], Math.hypot(W, H) / 2, fovDeg, aspect);
    case 'left': // elevation of the left wall
      return goal([0, H / 2, L / 2], [1, 0, 0], Math.hypot(L, H) / 2, fovDeg, aspect);
    case 'right': // elevation of the right wall
      return goal([W, H / 2, L / 2], [-1, 0, 0], Math.hypot(L, H) / 2, fovDeg, aspect);
    case 'iso':
      return goal(centre, [1, 0.9, 1], Math.hypot(W, L, H) / 2, fovDeg, aspect);
  }
}
