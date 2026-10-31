import { Grid } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { WALLS, type KitchenProject, type WallId } from '@/domain';
import { wallPieces } from '@/engine/geometry/walls';
import type { SceneMaterials } from '../materials/useSceneMaterials';
import { toWorld } from '../units';

/** Height of the stub left in place of a cut-away wall, so the room outline stays readable. */
const STUB = 80;
const HIDDEN_LAYER = 31;

interface Props {
  project: KitchenProject;
  materials: SceneMaterials;
  showGrid: boolean;
  autoHideWalls: boolean;
  onBackgroundClick: () => void;
  /** Clicking a wall selects it (stationary clicks only). */
  onWallClick: (wallId: WallId) => void;
  selectedWall: WallId | null;
  /** Walk mode: clicking the floor walks there (room mm) instead of clearing the selection. */
  onFloorClick?: (x: number, z: number) => void;
  /** Where the room sits in the world (a room of a home), in world units, for the wall cut-away. */
  origin?: { x: number; z: number };
}

/**
 * Floor, the four walls (built as pieces around their doors and windows) and the grid. With
 * auto-hide on, a wall whose outside faces the camera is cut down to a low stub, so the room is
 * visible from any angle; from inside (walking) every wall stands.
 */
export function RoomShell({ project, materials, showGrid, autoHideWalls, onBackgroundClick, onWallClick, selectedWall, onFloorClick, origin }: Props) {
  const { width, length, wallThickness } = project.room;
  const W = toWorld(width);
  const L = toWorld(length);
  const T = toWorld(wallThickness);
  const wall = materials.get(project.surfaces.wall);
  const floor = materials.solid(project.surfaces.floor);
  const pieces = useMemo(
    () => Object.fromEntries(WALLS.map((w) => [w, wallPieces(project.room, w, project.openings)])) as Record<WallId, ReturnType<typeof wallPieces>>,
    [project.room, project.openings],
  );
  const full = useRef<Partial<Record<WallId, Group | null>>>({});
  const stub = useRef<Partial<Record<WallId, Mesh | null>>>({});

  useFrame(({ camera }) => {
    const p = { x: camera.position.x - (origin?.x ?? 0), z: camera.position.z - (origin?.z ?? 0) };
    const outside: Record<WallId, boolean> = { back: p.z < 0, front: p.z > L, left: p.x < 0, right: p.x > W };
    for (const w of WALLS) {
      const cut = autoHideWalls && outside[w];
      const g = full.current[w];
      const s = stub.current[w];
      if (g && g.visible === cut) {
        g.visible = !cut;
        // Raycasting ignores visibility: park a cut-away wall on a layer clicks never test, so it
        // cannot catch clicks meant for the units behind it.
        g.traverse((o) => (cut ? o.layers.set(HIDDEN_LAYER) : o.layers.set(0)));
      }
      if (s) s.visible = cut;
    }
  });

  // R3F fires onClick even at the end of an orbit drag; only stationary clicks select or walk.
  const floorClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta >= 4) return;
    if (onFloorClick) onFloorClick(e.point.x * 1000, e.point.z * 1000);
    else onBackgroundClick();
  };
  const boxMesh = (key: string, b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, w: WallId) => (
    <mesh
      key={key}
      receiveShadow
      castShadow
      material={wall}
      position={[toWorld((b.minX + b.maxX) / 2), toWorld((b.minY + b.maxY) / 2), toWorld((b.minZ + b.maxZ) / 2)]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta < 4) onWallClick(w);
      }}
    >
      <boxGeometry args={[toWorld(b.maxX - b.minX), toWorld(b.maxY - b.minY), toWorld(b.maxZ - b.minZ)]} />
      {selectedWall === w && <meshBasicMaterial attach="material" color="#3b82f6" transparent opacity={0.35} />}
    </mesh>
  );

  return (
    <group>
      <mesh name="floor" receiveShadow material={floor} position={[W / 2, -0.01, L / 2]} onClick={floorClick}>
        <boxGeometry args={[W + 2 * T, 0.02, L + 2 * T]} />
      </mesh>
      {WALLS.map((w) => (
        <group key={w} name={`wall-${w}`}>
          <group ref={(g) => void (full.current[w] = g)}>{pieces[w].map((b, i) => boxMesh(`${w}${i}`, b, w))}</group>
          {/* Shown instead of the wall when it is cut away. */}
          <mesh ref={(m) => void (stub.current[w] = m)} visible={false} material={wall} {...stubGeometry(project, w)} />
        </group>
      ))}
      {showGrid && (
        <Grid position={[W / 2, 0.001, L / 2]} args={[W, L]} cellSize={0.1} sectionSize={1} cellThickness={0.5} sectionThickness={1} cellColor="#9aa3ad" sectionColor="#5b6673" fadeDistance={40} />
      )}
    </group>
  );
}

function stubGeometry(project: KitchenProject, w: WallId) {
  const { width, length, wallThickness: T } = project.room;
  const b =
    w === 'back' ? { minX: -T, maxX: width + T, minZ: -T, maxZ: 0 }
    : w === 'front' ? { minX: -T, maxX: width + T, minZ: length, maxZ: length + T }
    : w === 'left' ? { minX: -T, maxX: 0, minZ: 0, maxZ: length }
    : { minX: width, maxX: width + T, minZ: 0, maxZ: length };
  return {
    position: [toWorld((b.minX + b.maxX) / 2), toWorld(STUB / 2), toWorld((b.minZ + b.maxZ) / 2)] as [number, number, number],
    children: <boxGeometry args={[toWorld(b.maxX - b.minX), toWorld(STUB), toWorld(b.maxZ - b.minZ)]} />,
  };
}
