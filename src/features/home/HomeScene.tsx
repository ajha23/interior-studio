/**
 * The whole home in 3D, as a dollhouse: every room of the shown levels with its walls, doors,
 * windows, units and furniture in their real finishes; walls facing the camera are cut away so
 * every room can be seen into. Click a room to select it, double-click to open it in the editor.
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { allElements, type Home, type HomeRoom } from '@/domain';
import { Countertops } from '@/rendering/cabinets/Countertops';
import { ElementModel } from '@/rendering/cabinets/ElementModel';
import { OpeningModel } from '@/rendering/cabinets/OpeningModel';
import { useSceneMaterials } from '@/rendering/materials/useSceneMaterials';
import { WorldUVs } from '@/rendering/materials/worldUVs';
import { Lighting } from '@/rendering/scene/Lighting';
import { RoomShell } from '@/rendering/scene/RoomShell';
import { toWorld } from '@/rendering/units';

const NONE: Record<string, number> = {};
const noop = () => undefined;

const Room = memo(function Room({ room, y, selected, textured, onSelect, onOpen }: { room: HomeRoom; y: number; selected: boolean; textured: boolean; onSelect: (id: string) => void; onOpen: (id: string) => void }) {
  const p = room.design;
  const materials = useSceneMaterials(p.materials, 'realistic', textured);
  const origin = { x: toWorld(room.x), z: toWorld(room.z) };
  const handlers = useMemo(
    () => ({
      onPointerDown: noop,
      onPointerMove: noop,
      onPointerUp: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onSelect(room.id);
      },
      onDoubleClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onOpen(room.id);
      },
    }),
    [room.id, onSelect, onOpen],
  );
  return (
    <group position={[origin.x, toWorld(y), origin.z]} onDoubleClick={(e) => (e.stopPropagation(), onOpen(room.id))}>
      <RoomShell project={p} materials={materials} showGrid={false} autoHideWalls origin={origin} onBackgroundClick={() => onSelect(room.id)} onWallClick={() => onSelect(room.id)} selectedWall={null} />
      <Countertops project={p} materials={materials} />
      {allElements(p).map((el) => (
        <ElementModel key={el.id} element={el} carcassMaterialId={p.surfaces.carcass} materials={materials} selected={false} showInterior={false} handlers={handlers} openness={NONE} moverHandlers={null} />
      ))}
      {p.openings.map((o) => (
        <OpeningModel key={o.id} opening={o} room={p.room} joineryMaterialId={p.surfaces.carcass} materials={materials} selected={false} openness={NONE} onSelect={() => onSelect(room.id)} moverHandlers={null} />
      ))}
      {selected && (
        <mesh position={[toWorld(p.room.width) / 2, 0.005, toWorld(p.room.length) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[toWorld(p.room.width), toWorld(p.room.length)]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
});

export function HomeScene({ home, level, selectedRoomId, textured, onSelect, onOpen }: { home: Home; level: number; selectedRoomId: string | null; textured: boolean; onSelect: (id: string | null) => void; onOpen: (id: string) => void }) {
  // The chosen level and those below it (upper floors would hide the one being looked at).
  const rooms = home.rooms.filter((r) => r.level <= level);
  const W = toWorld(home.plot.width);
  const L = toWorld(home.plot.length);
  const top = toWorld(level * home.floorHeight);
  const height = Math.max(...home.rooms.map((r) => r.design.room.height));
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [W * 0.5, top + Math.max(W, L) * 0.95, L * 1.35], fov: 40, near: 0.1, far: 300 }} gl={{ preserveDrawingBuffer: true, antialias: true }} onPointerMissed={() => onSelect(null)} data-testid="home-3d">
      <color attach="background" args={['#dcdad6']} />
      <Lighting style="realistic" high={textured} room={{ width: home.plot.width, length: home.plot.length, height }} />
      <WorldUVs />
      {/* The plot slab, so passages between rooms read as floor. */}
      <mesh position={[W / 2, top - 0.02, L / 2]} receiveShadow>
        <boxGeometry args={[W, 0.03, L]} />
        <meshStandardMaterial color="#cfcac2" roughness={0.9} />
      </mesh>
      {rooms.map((r) => (
        <Room key={r.id} room={r} y={r.level * home.floorHeight} selected={r.id === selectedRoomId} textured={textured} onSelect={onSelect} onOpen={onOpen} />
      ))}
      <OrbitControls makeDefault target={[W / 2, top, L / 2]} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  );
}
