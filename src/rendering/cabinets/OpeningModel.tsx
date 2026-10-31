import { Edges } from '@react-three/drei';
import { memo, useMemo } from 'react';
import { openingPlacement, type Opening, type Room } from '@/domain';
import { buildOpeningModel } from '@/engine/geometry/openingParts';
import type { Mover, Part } from '@/engine/geometry/parts';
import type { SceneMaterials } from '../materials/useSceneMaterials';
import type { MoverHandlers } from '../selection/interaction';
import { degToRad, toWorld } from '../units';
import { MoverGroup } from './ElementModel';

interface Props {
  opening: Opening;
  room: Room;
  /** Frames and the door leaf use the project's carcass (joinery) finish. */
  joineryMaterialId: string;
  materials: SceneMaterials;
  selected: boolean;
  openness: Record<string, number>;
  onSelect: (id: string) => void;
  moverHandlers: ((m: Mover) => MoverHandlers) | null;
}

/** A door, window or opening in its wall; the door leaf swings in Interact mode. */
export const OpeningModel = memo(function OpeningModel({ opening, room, joineryMaterialId, materials, selected, openness, onSelect, moverHandlers }: Props) {
  const { parts, movers } = useMemo(() => buildOpeningModel(opening, room), [opening, room]);
  const place = openingPlacement(room, opening);
  const joinery = materials.get(joineryMaterialId);
  const mesh = (p: Part) => (
    <mesh
      key={p.key}
      castShadow={p.finish !== 'glassPane'}
      receiveShadow
      position={[toWorld(p.center.x), toWorld(p.center.y), toWorld(p.center.z)]}
      material={p.finish === 'carcass' || p.finish === 'shutter' ? joinery : materials.fixed[p.finish]}
    >
      <boxGeometry args={[toWorld(p.size.x), toWorld(p.size.y), toWorld(p.size.z)]} />
      {materials.style !== 'realistic' && p.finish !== 'glassPane' && <Edges color="#3f3f46" threshold={20} />}
    </mesh>
  );
  const T = room.wallThickness;
  return (
    <group
      name={opening.id}
      position={[toWorld(place.position.x), 0, toWorld(place.position.z)]}
      rotation={[0, degToRad(place.rotationY), 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect(opening.id);
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
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
      {selected && (
        <mesh position={[0, toWorld(opening.sill + opening.height / 2), toWorld(-T / 2)]} raycast={() => null}>
          <boxGeometry args={[toWorld(opening.width + 40), toWorld(opening.height + 40), toWorld(T + 60)]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
          <Edges color="#3b82f6" lineWidth={2} />
        </mesh>
      )}
    </group>
  );
});
