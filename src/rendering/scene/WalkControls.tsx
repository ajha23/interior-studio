import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { allElements, type KitchenProject } from '@/domain';
import type { WalkRequest } from '@/state/editorStore';
import { pointerClaimed } from '../selection/pointerClaim';
import { MM_PER_WORLD_UNIT } from '../units';
import { blocked, forward, MAX_PITCH, obstacles, reachable, right, standInFront, startPose, step, type WalkPose } from './walk';

const WALK_SPEED = 1400; // mm/s, a normal walking pace
const RUN_SPEED = 3000;
const TURN_SPEED = 1.8; // rad/s for Q/E
const LOOK_PER_PX = 0.004;
const WHEEL_STEP = 250; // mm per wheel notch
const GLIDE_SPEED = 2500; // mm/s when travelling to a clicked spot
const WALK_FOV = 70;

interface Props {
  project: KitchenProject;
  eye: number;
  request: WalkRequest;
  nonce: number;
  onPose: (pose: WalkPose) => void;
}

function typing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * First-person walking at eye height: W A S D to walk, Q / E to
 * turn, Shift to hurry; drag empty space (or right-drag anywhere) to look around; scroll to step
 * forwards or back. Requests glide the viewer to a clicked floor spot, in front of a unit, or to a
 * saved viewpoint. The walker never passes through floor units or walls.
 */
export function WalkControls({ project, eye, request, nonce, onPose }: Props) {

  const gl = useThree((s) => s.gl);
  const boxes = useMemo(() => obstacles(project), [project]);
  const pose = useRef<WalkPose>(startPose(project, eye));
  const glide = useRef<WalkPose | null>(null);
  const keys = useRef(new Set<string>());
  const lastPublish = useRef(0);
  const projectRef = useRef(project);
  const eyeRef = useRef(eye);
  useEffect(() => {
    projectRef.current = project;
    eyeRef.current = eye;
  }, [project, eye]);

  // Requests: start, stand in front of a unit, walk to a floor spot, jump to a saved viewpoint.
  useEffect(() => {
    const p = projectRef.current;
    if (request.kind === 'start') glide.current = startPose(p, eyeRef.current);
    else if (request.kind === 'pose') glide.current = request.pose;
    else if (request.kind === 'goto') glide.current = { ...pose.current, ...reachable(p, pose.current, { x: request.x, z: request.z }) };
    else {
      const el = allElements(p).find((e) => e.id === request.id);
      if (el) glide.current = standInFront(p, el, eyeRef.current);
    }
    // React only to a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(k)) {
        keys.current.add(k);
        glide.current = null;
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();

    let look: { id: number; x: number; y: number } | null = null;
    const canvas = gl.domElement;
    // Runs after R3F's own handlers: if a unit, grip or door took the press, do not look around.
    const pdown = (e: PointerEvent) => {
      if (e.target !== canvas || (e.button !== 0 && e.button !== 2) || (e.button === 0 && pointerClaimed())) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const pmove = (e: PointerEvent) => {
      if (!look || e.pointerId !== look.id || pointerClaimed()) return;
      const p = pose.current;
      p.yaw -= (e.clientX - look.x) * LOOK_PER_PX;
      p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch - (e.clientY - look.y) * LOOK_PER_PX));
      look = { ...look, x: e.clientX, y: e.clientY };
      glide.current = null;
    };
    const pup = (e: PointerEvent) => {
      if (look && e.pointerId === look.id) look = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = forward(pose.current.yaw);
      const d = -Math.sign(e.deltaY) * WHEEL_STEP;
      Object.assign(pose.current, step(projectRef.current, pose.current, f.x * d, f.z * d));
      glide.current = null;
    };
    const menu = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', pdown);
    window.addEventListener('pointermove', pmove);
    window.addEventListener('pointerup', pup);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', menu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', pdown);
      window.removeEventListener('pointermove', pmove);
      window.removeEventListener('pointerup', pup);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', menu);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const p = pose.current;
    const k = keys.current;
    const proj = projectRef.current;
    const speed = (k.has('shift') ? RUN_SPEED : WALK_SPEED) * dt;
    if (k.has('q')) p.yaw += TURN_SPEED * dt;
    if (k.has('e')) p.yaw -= TURN_SPEED * dt;
    const f = forward(p.yaw);
    const r = right(p.yaw);
    const ahead = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
    const side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    if (ahead || side) {
      const len = Math.hypot(ahead, side);
      Object.assign(p, step(proj, p, ((f.x * ahead + r.x * side) / len) * speed, ((f.z * ahead + r.z * side) / len) * speed, boxes));
    }

    const g = glide.current;
    if (g) {
      const dx = g.x - p.x;
      const dz = g.z - p.z;
      const dist = Math.hypot(dx, dz);
      const move = Math.min(dist, GLIDE_SPEED * dt);
      // Glides may pass close to units (the target is free); walking keeps the collision rules.
      if (dist > 1) Object.assign(p, { x: p.x + (dx / dist) * move, z: p.z + (dz / dist) * move });
      let dyaw = g.yaw - p.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const ease = 1 - Math.exp(-dt * 8);
      p.yaw += dyaw * ease;
      p.pitch += (g.pitch - p.pitch) * ease;
      if (dist <= 1 && Math.abs(dyaw) < 0.002 && Math.abs(g.pitch - p.pitch) < 0.002) {
        glide.current = null;
        Object.assign(p, g);
      }
    }
    if (!g && blocked(proj, p.x, p.z, boxes)) Object.assign(p, reachable(proj, startPose(proj, eyeRef.current), p));

    state.camera.position.set(p.x / MM_PER_WORLD_UNIT, eyeRef.current / MM_PER_WORLD_UNIT, p.z / MM_PER_WORLD_UNIT);
    state.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');

    const now = state.clock.elapsedTime;
    if (now - lastPublish.current > 0.12) {
      lastPublish.current = now;
      onPose({ ...p });
    }
  });

  return <PerspectiveCamera makeDefault fov={WALK_FOV} near={0.05} far={100} />;
}
