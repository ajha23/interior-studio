import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import { toWorld } from '../units';
import type { SceneLabel } from './labels';

/**
 * Positions DOM labels (rendered by the viewport, outside the canvas) over their 3D anchors.
 * Writing transforms directly each frame avoids re-rendering React while the camera moves.
 */
export function LabelProjector({ labels, overlay }: { labels: SceneLabel[]; overlay: RefObject<HTMLDivElement | null> }) {
  const points = useMemo(() => labels.map((l) => ({ id: l.id, v: new Vector3(toWorld(l.anchor.x), toWorld(l.anchor.y), toWorld(l.anchor.z)) })), [labels]);
  const scratch = useMemo(() => new Vector3(), []);

  useFrame(({ camera, size }) => {
    const root = overlay.current;
    if (!root) return;
    for (const p of points) {
      const node = root.querySelector<HTMLElement>(`[data-label="${p.id}"]`);
      if (!node) continue;
      scratch.copy(p.v).project(camera);
      const visible = scratch.z < 1 && Math.abs(scratch.x) < 1.2 && Math.abs(scratch.y) < 1.2;
      node.style.visibility = visible ? 'visible' : 'hidden';
      node.style.transform = `translate(-50%, -50%) translate(${((scratch.x + 1) / 2) * size.width}px, ${((1 - scratch.y) / 2) * size.height}px)`;
    }
  });
  return null;
}
