/**
 * Interact mode: handle doors, drawers and appliance doors as in real life. A click toggles one
 * open or shut; pressing and dragging pulls it, following the handle along its real path on screen
 * (projected from closed to fully open), so a drawer comes towards you and a door swings as you pull.
 */
import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import type { KitchenElement } from '@/domain';
import { moverPoint, type Mover } from '@/engine/geometry/parts';
import { localToRoom } from '@/engine/geometry/transform';
import { MM_PER_WORLD_UNIT } from '../units';
import { claimPointer, releasePointer } from './pointerClaim';

export interface InteractCallbacks {
  select: (id: string) => void;
  opening: (elementId: string, moverId: string) => number;
  setOpening: (elementId: string, moverId: string, t: number) => void;
  toggle: (elementId: string, moverId: string) => void;
}

interface Pull {
  pointerId: number;
  startX: number;
  startY: number;
  t0: number;
  /** Screen vector from the handle closed to the handle fully open. */
  v: { x: number; y: number };
  moved: boolean;
}

interface Controls {
  enabled: boolean;
}

interface Capturable {
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
}

export function useInteraction(callbacks: InteractCallbacks) {
  const get = useThree((s) => s.get);
  const pull = useRef<Pull | null>(null);

  const toScreen = (el: KitchenElement, local: { x: number; y: number; z: number }) => {
    const { camera, size } = get();
    const r = localToRoom(el, local);
    const v = new Vector3(r.x / MM_PER_WORLD_UNIT, r.y / MM_PER_WORLD_UNIT, r.z / MM_PER_WORLD_UNIT).project(camera);
    return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
  };

  const setControls = (enabled: boolean) => {
    const c = get().controls as unknown as Controls | null;
    if (c) c.enabled = enabled;
  };

  return (el: KitchenElement, m: Mover) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      callbacks.select(el.id);
      claimPointer();
      (e.target as unknown as Capturable).setPointerCapture(e.pointerId);
      const a = toScreen(el, m.grab);
      const b = toScreen(el, moverPoint(m, 1, m.grab));
      pull.current = { pointerId: e.pointerId, startX: e.nativeEvent.clientX, startY: e.nativeEvent.clientY, t0: callbacks.opening(el.id, m.id), v: { x: b.x - a.x, y: b.y - a.y }, moved: false };
      setControls(false);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const p = pull.current;
      if (!p || p.pointerId !== e.pointerId) return;
      e.stopPropagation();
      const dx = e.nativeEvent.clientX - p.startX;
      const dy = e.nativeEvent.clientY - p.startY;
      if (!p.moved && Math.hypot(dx, dy) < 4) return;
      p.moved = true;
      const len2 = p.v.x * p.v.x + p.v.y * p.v.y;
      if (len2 < 1) return;
      callbacks.setOpening(el.id, m.id, p.t0 + (dx * p.v.x + dy * p.v.y) / len2);
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const p = pull.current;
      if (!p || p.pointerId !== e.pointerId) return;
      e.stopPropagation();
      pull.current = null;
      releasePointer();
      (e.target as unknown as Capturable).releasePointerCapture(e.pointerId);
      setControls(true);
      if (!p.moved) callbacks.toggle(el.id, m.id);
    },
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
  });
}

export type MoverHandlers = ReturnType<ReturnType<typeof useInteraction>>;
