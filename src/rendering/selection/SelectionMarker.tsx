import { Edges } from '@react-three/drei';
import type { Dimensions } from '@/domain';
import { toWorld } from '../units';

const PAD = 6;

/** Highlight box around the selected element, in its local frame. Its dimension labels are DOM overlays. */
export function SelectionMarker({ dimensions: d }: { dimensions: Dimensions }) {
  return (
    <mesh position={[0, toWorld(d.height / 2), 0]} raycast={() => null}>
      <boxGeometry args={[toWorld(d.width + PAD), toWorld(d.height + PAD), toWorld(d.depth + PAD)]} />
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.08} depthWrite={false} />
      <Edges color="#3b82f6" lineWidth={2} />
    </mesh>
  );
}
