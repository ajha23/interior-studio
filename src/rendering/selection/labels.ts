/**
 * Dimension labels for the 3D view, computed from the domain model. Anchors are in room
 * millimetres; the viewport projects them to screen space every frame.
 */
import { allElements, type KitchenProject } from '@/domain';
import { localToRoom } from '@/engine/geometry/transform';
import { formatLength } from '@/engine/measurement/units';
import type { Preview } from '@/state/editorStore';

export interface SceneLabel {
  id: string;
  text: string;
  /** Room-frame anchor in millimetres. */
  anchor: { x: number; y: number; z: number };
  tone: 'room' | 'selection' | 'readout' | 'invalid';
}

/**
 * Room size labels, the selected unit's W/H/D, and — while dragging — a live readout next to the
 * unit (CAD "dynamic input"): the offset and what it snapped to, or the width from a grip.
 */
export function sceneLabels(project: KitchenProject, selectedId: string | null, preview: Preview | null = null): SceneLabel[] {
  const { width, length, height } = project.room;
  const unit = project.preferences.unit;
  const f = (mm: number) => formatLength(mm, unit);
  const labels: SceneLabel[] = [
    { id: 'room-width', text: f(width), anchor: { x: width / 2, y: height + 120, z: 0 }, tone: 'room' },
    { id: 'room-length', text: f(length), anchor: { x: width, y: 0, z: length / 2 }, tone: 'room' },
  ];
  const el = selectedId ? allElements(project).find((e) => e.id === selectedId) : undefined;
  if (el) {
    const { width: w, height: h, depth: d } = el.dimensions;
    labels.push(
      { id: 'dim-width', text: `W ${f(w)}`, anchor: localToRoom(el, { x: 0, y: h + 60, z: d / 2 }), tone: 'selection' },
      { id: 'dim-height', text: `H ${f(h)}`, anchor: localToRoom(el, { x: w / 2 + 70, y: h / 2, z: d / 2 }), tone: 'selection' },
      { id: 'dim-depth', text: `D ${f(d)}`, anchor: localToRoom(el, { x: -w / 2, y: h + 60, z: 0 }), tone: 'selection' },
    );
  }
  if (preview && preview.kind !== 'candidate') {
    const target = preview.attempt ?? allElements(project).find((e) => e.id === preview.id);
    if (target) {
      const top = localToRoom(target, { x: 0, y: target.dimensions.height + 200, z: 0 });
      labels.push({ id: 'drag-readout', text: preview.valid ? preview.readout : `${preview.readout} · not allowed`, anchor: top, tone: preview.valid ? 'readout' : 'invalid' });
    }
  }
  return labels;
}
