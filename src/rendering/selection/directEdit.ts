/**
 * Direct manipulation in the 3D view: drag a unit anywhere (it snaps onto walls or stands free),
 * or drag its width / height / depth grips. Every step is dry-run through `executeCommand`, so the
 * preview shows exactly what the commit will produce (neighbours shifting, worktops, interiors) or
 * why it is not allowed. One command is dispatched on release: a whole drag is one undo step.
 */
import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { OrthographicCamera, PerspectiveCamera, Plane, Vector3 } from 'three';
import {
  executeCommand,
  isCabinet,
  placeOnWall,
  specFor,
  widthGrowSide,
  type DesignCommand,
  type Dimensions,
  type KitchenElement,
  type KitchenProject,
} from '@/domain';
import { SNAP_GRID, snapWidth } from '@/engine/snapping/alongWall';
import { roomToLocal } from '@/engine/geometry/transform';
import { snapPlacement } from '@/engine/snapping/placement';
import type { Preview } from '@/state/editorStore';
import { MM_PER_WORLD_UNIT } from '../units';
import { claimPointer, releasePointer } from './pointerClaim';

export interface DirectEditCallbacks {
  select: (id: string) => void;
  focus: (id: string) => void;
  preview: (preview: Preview | null) => void;
  commit: (command: DesignCommand) => void;
}

export type GripAxis = 'width' | 'height' | 'depth';
type DragKind = 'move' | GripAxis;

interface Drag {
  kind: DragKind;
  el: KitchenElement;
  pointerId: number;
  startX: number;
  startY: number;
  plane: Plane;
  /** Move: offset from the grab point to the unit's footprint centre (mm). */
  grab: { x: number; z: number };
  started: boolean;
  last: DesignCommand | null;
  valid: boolean;
}

const DRAG_THRESHOLD_PX = 4;
const SNAP_PX = 12;

interface Controls {
  enabled: boolean;
}

interface Capturable {
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
}

const round = (v: number) => Math.round(v / SNAP_GRID) * SNAP_GRID;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function useDirectEdit(project: KitchenProject, callbacks: DirectEditCallbacks) {
  const get = useThree((s) => s.get);
  const drag = useRef<Drag | null>(null);
  const hit = useRef(new Vector3());

  const mmPerPixel = (at: Vector3) => {
    const { camera, size } = get();
    if (camera instanceof OrthographicCamera) return MM_PER_WORLD_UNIT / camera.zoom;
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 42;
    return ((2 * camera.position.distanceTo(at) * Math.tan((fov * Math.PI) / 360)) / Math.max(1, size.height)) * MM_PER_WORLD_UNIT;
  };

  const begin = (kind: DragKind, el: KitchenElement) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    callbacks.select(el.id);
    claimPointer();
    (e.target as unknown as Capturable).setPointerCapture(e.pointerId);
    let plane: Plane;
    if (kind === 'height') {
      // A vertical plane through the unit, turned towards the camera.
      const cam = get().camera.position;
      const normal = new Vector3(cam.x - e.point.x, 0, cam.z - e.point.z).normalize();
      plane = new Plane().setFromNormalAndCoplanarPoint(normal, e.point);
    } else {
      plane = new Plane(new Vector3(0, 1, 0), -e.point.y);
    }
    drag.current = {
      kind,
      el,
      pointerId: e.pointerId,
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
      plane,
      grab: { x: el.position.x - e.point.x * MM_PER_WORLD_UNIT, z: el.position.z - e.point.z * MM_PER_WORLD_UNIT },
      started: false,
      last: null,
      valid: false,
    };
  };

  const show = (d: Drag, kind: Preview['kind'], command: DesignCommand, readout: string, attempt: KitchenElement | null) => {
    const dry = executeCommand(project, command);
    d.last = command;
    d.valid = dry.result.success;
    callbacks.preview({ kind, id: d.el.id, readout, valid: dry.result.success, error: dry.result.errors[0] ?? null, project: dry.result.success ? dry.project : null, attempt });
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    if (!d.started) {
      if (Math.hypot(e.nativeEvent.clientX - d.startX, e.nativeEvent.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.started = true;
      const controls = get().controls as unknown as Controls | null;
      if (controls) controls.enabled = false;
    }
    if (!e.ray.intersectPlane(d.plane, hit.current)) return;
    const el = d.el;
    const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
    const p = { x: hit.current.x * MM_PER_WORLD_UNIT, y: hit.current.y * MM_PER_WORLD_UNIT, z: hit.current.z * MM_PER_WORLD_UNIT };
    const tolerance = SNAP_PX * mmPerPixel(hit.current);

    if (d.kind === 'move') {
      const snap = snapPlacement(project, el, p.x + d.grab.x, p.z + d.grab.z, tolerance);
      const attempt: KitchenElement =
        snap.kind === 'wall'
          ? { ...el, wallId: snap.wallId, ...placeOnWall(project.room, snap.wallId, el.dimensions, snap.offset, spec.mount === 'wall' ? el.position.y : spec.elevation) }
          : { ...el, wallId: undefined, position: { x: snap.x, y: spec.elevation, z: snap.z }, rotationY: snap.rotationY };
      const where = snap.kind === 'wall' ? `↔ ${snap.offset} mm` : `${Math.round(snap.x - (attempt.rotationY % 180 ? el.dimensions.depth : el.dimensions.width) / 2)}, ${Math.round(snap.z - (attempt.rotationY % 180 ? el.dimensions.width : el.dimensions.depth) / 2)} mm`;
      show(d, 'move', snap.command, `${where}${snap.snappedTo ? ` · ${snap.snappedTo}` : ''}`, attempt);
      return;
    }

    const local = roomToLocal(el, p);
    const dims: Dimensions = { ...el.dimensions };
    if (d.kind === 'width') {
      const s = widthGrowSide(el);
      const raw = s * local.x + el.dimensions.width / 2;
      if (spec.widthRange) {
        const standard = snapWidth(spec.widths, raw);
        dims.width = clamp(Math.abs(standard - raw) <= tolerance ? standard : round(raw), spec.widthRange.min, spec.widthRange.max);
      } else {
        dims.width = snapWidth(spec.widths, raw);
      }
    } else if (d.kind === 'height') {
      dims.height = clamp(round(local.y), spec.height.min, spec.height.max);
    } else {
      dims.depth = clamp(round(local.z + el.dimensions.depth / 2), spec.depth.min, spec.depth.max);
    }
    const command: DesignCommand = isCabinet(el)
      ? { type: 'resize_cabinet', cabinetId: el.id, dimensions: dims }
      : { type: 'resize_appliance', applianceId: el.id, width: dims.width };
    const letter = d.kind === 'width' ? 'W' : d.kind === 'height' ? 'H' : 'D';
    show(d, 'resize', command, `${letter} ${dims[d.kind]} mm`, null);
  };

  const end = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    releasePointer();
    (e.target as unknown as Capturable).releasePointerCapture(e.pointerId);
    const controls = get().controls as unknown as Controls | null;
    if (controls) controls.enabled = true;
    if (!d.started) return;
    e.stopPropagation();
    callbacks.preview(null);
    // Dropping where the unit cannot go just snaps it back; the readout already said why.
    if (d.last && d.valid) callbacks.commit(d.last);
  };

  return {
    /** Handlers for an element's body: press selects, drag moves it anywhere, double-click focuses. */
    body: (el: KitchenElement) => ({
      onPointerDown: begin('move', el),
      onPointerMove: move,
      onPointerUp: end,
      onDoubleClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        callbacks.select(el.id);
        callbacks.focus(el.id);
      },
    }),
    /** Handlers for one resize grip of the selected element. */
    grip: (el: KitchenElement, axis: GripAxis) => ({ onPointerDown: begin(axis, el), onPointerMove: move, onPointerUp: end }),
  };
}
