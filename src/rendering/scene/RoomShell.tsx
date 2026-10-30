import { Grid } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { KitchenProject } from '@/domain';
import type { SceneMaterials } from '../materials/useSceneMaterials';
import { toWorld } from '../units';

/** Height of the stub left in place of a cut-away wall, so the room outline stays readable. */
const STUB = 0.08;

interface Props {
  project: KitchenProject;
  materials: SceneMaterials;
  showGrid: boolean;
  autoHideWalls: boolean;
  onBackgroundClick: () => void;
  /** Walk mode: clicking the floor walks there (room mm) instead of clearing the selection. */
  onFloorClick?: (x: number, z: number) => void;
}

/**
 * Floor, back/left/right walls (the front is open) and the grid. With auto-hide on, a wall whose
 * outside faces the camera is cut down to a low stub, so the room is visible from any angle.
 */
export function RoomShell({ project, materials, showGrid, autoHideWalls, onBackgroundClick, onFloorClick }: Props) {
  const W = toWorld(project.room.width);
  const L = toWorld(project.room.length);
  const H = toWorld(project.room.height);
  const T = toWorld(project.room.wallThickness);
  const wall = materials.get(project.surfaces.wall);
  const floor = materials.solid(project.surfaces.floor);
  const back = useRef<Mesh>(null);
  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);

  useFrame(({ camera }) => {
    const p = camera.position;
    const set = (mesh: Mesh | null, outside: boolean) => {
      if (!mesh) return;
      const cut = autoHideWalls && outside;
      mesh.scale.y = cut ? STUB / H : 1;
      mesh.position.y = cut ? STUB / 2 : H / 2;
    };
    set(back.current, p.z < 0);
    set(left.current, p.x < 0);
    set(right.current, p.x > W);
  });

  // R3F fires onClick even at the end of an orbit drag; only a stationary click clears the selection.
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta < 4) onBackgroundClick();
  };
  const floorClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta >= 4) return;
    if (onFloorClick) onFloorClick(e.point.x * 1000, e.point.z * 1000);
    else onBackgroundClick();
  };
  return (
    <group>
      <mesh name="floor" receiveShadow material={floor} position={[W / 2, -0.01, L / 2]} onClick={floorClick}>
        <boxGeometry args={[W + 2 * T, 0.02, L + T]} />
      </mesh>
      <mesh ref={back} name="wall-back" receiveShadow castShadow material={wall} position={[W / 2, H / 2, -T / 2]} onClick={click}>
        <boxGeometry args={[W + 2 * T, H, T]} />
      </mesh>
      <mesh ref={left} name="wall-left" receiveShadow castShadow material={wall} position={[-T / 2, H / 2, L / 2]} onClick={click}>
        <boxGeometry args={[T, H, L]} />
      </mesh>
      <mesh ref={right} name="wall-right" receiveShadow castShadow material={wall} position={[W + T / 2, H / 2, L / 2]} onClick={click}>
        <boxGeometry args={[T, H, L]} />
      </mesh>
      {showGrid && (
        <Grid position={[W / 2, 0.001, L / 2]} args={[W, L]} cellSize={0.1} sectionSize={1} cellThickness={0.5} sectionThickness={1} cellColor="#9aa3ad" sectionColor="#5b6673" fadeDistance={40} />
      )}
    </group>
  );
}
