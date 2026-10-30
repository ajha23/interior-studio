import type { ThreeEvent } from '@react-three/fiber';
import { useState } from 'react';
import { isCabinet, widthGrowSide, type KitchenElement } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { degToRad, toWorld } from '../units';
import type { GripAxis } from './directEdit';

const GRIP = 70;

type GripHandlers = { onPointerDown: (e: ThreeEvent<PointerEvent>) => void; onPointerMove: (e: ThreeEvent<PointerEvent>) => void; onPointerUp: (e: ThreeEvent<PointerEvent>) => void };

const GRIPS: Record<GripAxis, { color: string; hot: string; cursor: string; title: string }> = {
  width: { color: '#3b82f6', hot: '#1d4ed8', cursor: 'ew-resize', title: 'Width' },
  height: { color: '#22c55e', hot: '#15803d', cursor: 'ns-resize', title: 'Height' },
  depth: { color: '#f59e0b', hot: '#b45309', cursor: 'nesw-resize', title: 'Depth' },
};

function Grip({ axis, position, handlers }: { axis: GripAxis; position: [number, number, number]; handlers: GripHandlers }) {
  const [hover, setHover] = useState(false);
  const g = GRIPS[axis];
  return (
    <mesh
      name={`grip-${axis}`}
      position={position}
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = g.cursor;
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
      renderOrder={10}
    >
      <boxGeometry args={[toWorld(GRIP), toWorld(GRIP), toWorld(GRIP)]} />
      <meshBasicMaterial color={hover ? g.hot : g.color} depthTest={false} transparent opacity={0.95} />
    </mesh>
  );
}

/**
 * CAD-style grips on the selected unit: blue (width, on the side that grows), green (height, on
 * top) and amber (depth, on the front face). Appliances only change width.
 */
export function ResizeGrips({ element, grip }: { element: KitchenElement; grip: (axis: GripAxis) => GripHandlers }) {
  const { width: w, height: h, depth: d } = element.dimensions;
  const s = widthGrowSide(element);
  return (
    <group position={[toWorld(element.position.x), toWorld(element.position.y), toWorld(element.position.z)]} rotation={[0, degToRad(element.rotationY), 0]}>
      <Grip axis="width" position={[toWorld((s * w) / 2), toWorld(h / 2), toWorld(d / 2)]} handlers={grip('width')} />
      {isCabinet(element) && (
        <>
          <Grip axis="height" position={[0, toWorld(h), toWorld(d / 2)]} handlers={grip('height')} />
          <Grip axis="depth" position={[toWorld((-s * w) / 4), toWorld(h / 2), toWorld(d / 2 + GRIP / 2)]} handlers={grip('depth')} />
        </>
      )}
    </group>
  );
}

/** Red outline where a dragged unit would go but is not allowed to. */
export function InvalidGhost({ attempt }: { attempt: KitchenElement }) {
  const b = elementBox(attempt);
  return (
    <mesh position={[toWorld((b.minX + b.maxX) / 2), toWorld((b.minY + b.maxY) / 2), toWorld((b.minZ + b.maxZ) / 2)]} raycast={() => null}>
      <boxGeometry args={[toWorld(b.maxX - b.minX), toWorld(b.maxY - b.minY), toWorld(b.maxZ - b.minZ)]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.3} depthWrite={false} />
    </mesh>
  );
}
