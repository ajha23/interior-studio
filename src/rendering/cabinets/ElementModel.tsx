import { Edges } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { KitchenElement } from '@/domain';
import { isCabinet } from '@/domain';
import { buildModel, type Mover, type Part } from '@/engine/geometry/parts';
import type { SceneMaterials } from '../materials/useSceneMaterials';
import type { MoverHandlers } from '../selection/interaction';
import { SelectionMarker } from '../selection/SelectionMarker';
import { degToRad, toWorld } from '../units';

export interface ElementHandlers {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>) => void;
}

interface Props {
  element: KitchenElement;
  carcassMaterialId: string;
  materials: SceneMaterials;
  selected: boolean;
  /** Make fronts see-through so shelves, drawers and racks inside are visible. */
  showInterior: boolean;
  handlers: ElementHandlers;
  /** How open each mover is (by mover id), 0…1. */
  openness: Record<string, number>;
  /** Interact mode: handlers that open and close each door/drawer. */
  moverHandlers: ((m: Mover) => MoverHandlers) | null;
}

/** Speed of the open/close animation: fraction of the remaining way covered per second (exponential). */
const OPEN_RATE = 9;

/** A door, drawer or basket: animates towards its target opening about its hinge or slide. */
function MoverGroup({ mover, target, handlers, children }: { mover: Mover; target: number; handlers: MoverHandlers | null; children: ReactNode }) {
  const inner = useRef<Group>(null);
  const current = useRef(target);
  useFrame((_, dt) => {
    const g = inner.current;
    if (!g) return;
    const diff = target - current.current;
    current.current = Math.abs(diff) < 0.0005 ? target : current.current + diff * (1 - Math.exp(-dt * OPEN_RATE));
    const t = current.current;
    if (mover.kind === 'slide') g.position.z = toWorld(mover.amount * t);
    else if (mover.kind === 'hinge') g.rotation.y = mover.amount * t;
    else g.rotation.x = mover.amount * t;
  });
  const pivot: [number, number, number] = [toWorld(mover.pivot.x), toWorld(mover.pivot.y), toWorld(mover.pivot.z)];
  return (
    <group
      name={`mover-${mover.id}`}
      position={pivot}
      {...(handlers ?? {})}
      onPointerOver={
        handlers
          ? (e) => {
              e.stopPropagation();
              document.body.style.cursor = 'grab';
            }
          : undefined
      }
    >
      <group ref={inner}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>{children}</group>
      </group>
    </group>
  );
}

/**
 * Renders one cabinet or appliance from its procedural parts. In edit mode, press selects, drag
 * moves it and double-click focuses; in interact mode its doors and drawers open like real ones.
 */
export const ElementModel = memo(function ElementModel({ element, carcassMaterialId, materials, selected, showInterior, handlers, openness, moverHandlers }: Props) {
  const { parts, movers } = useMemo(() => buildModel(element), [element]);
  const shutter = isCabinet(element) ? materials.get(element.materialId) : materials.fixed.steel;
  const carcass = isCabinet(element) ? materials.get(carcassMaterialId) : materials.fixed.steel;
  const edges = materials.style !== 'realistic';

  const mesh = (p: Part) => (
    <mesh
      key={p.key}
      castShadow={materials.style !== 'xray' && !(showInterior && p.group === 'front') && p.finish !== 'glassPane'}
      receiveShadow
      position={[toWorld(p.center.x), toWorld(p.center.y), toWorld(p.center.z)]}
      material={showInterior && p.group === 'front' ? materials.fixed.frontGhost : p.finish === 'shutter' ? shutter : p.finish === 'carcass' ? carcass : materials.fixed[p.finish]}
    >
      <boxGeometry args={[toWorld(p.size.x), toWorld(p.size.y), toWorld(p.size.z)]} />
      {edges && p.finish !== 'glassPane' && <Edges color="#3f3f46" threshold={20} />}
    </mesh>
  );

  return (
    <group
      name={element.id}
      position={[toWorld(element.position.x), toWorld(element.position.y), toWorld(element.position.z)]}
      rotation={[0, degToRad(element.rotationY), 0]}
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = moverHandlers ? 'default' : selected ? 'move' : 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {parts.filter((p) => !p.mover).map(mesh)}
      {movers.map((m) => (
        <MoverGroup key={m.id} mover={m} target={openness[m.id] ?? 0} handlers={moverHandlers ? moverHandlers(m) : null}>
          {parts.filter((p) => p.mover === m.id).map(mesh)}
        </MoverGroup>
      ))}
      {selected && <SelectionMarker dimensions={element.dimensions} />}
    </group>
  );
});
