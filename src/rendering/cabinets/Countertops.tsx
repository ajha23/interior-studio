import { useMemo } from 'react';
import { deriveCountertops, type KitchenProject } from '@/domain';
import type { SceneMaterials } from '../materials/useSceneMaterials';
import { degToRad, toWorld } from '../units';

/** Worktop slabs derived from the cabinet runs, plus a basin over every sink unit. */
export function Countertops({ project, materials }: { project: KitchenProject; materials: SceneMaterials }) {
  const slabs = useMemo(() => deriveCountertops(project), [project]);
  const top = materials.get(project.surfaces.countertop);
  const sinks = project.cabinets.filter((c) => c.type === 'sink');
  return (
    <group>
      {slabs.map((s) => {
        const b = s.box;
        return (
          <mesh key={s.id} castShadow receiveShadow material={top} position={[toWorld((b.minX + b.maxX) / 2), toWorld((b.minY + b.maxY) / 2), toWorld((b.minZ + b.maxZ) / 2)]}>
            <boxGeometry args={[toWorld(b.maxX - b.minX), toWorld(b.maxY - b.minY), toWorld(b.maxZ - b.minZ)]} />
          </mesh>
        );
      })}
      {sinks.map((c) => {
        const slab = slabs.find((s) => s.entityIds.includes(c.id));
        if (!slab) return null;
        // The basin sits in the sink unit's own frame, so it follows the unit on any wall or island.
        return (
          <group key={`basin-${c.id}`} position={[toWorld(c.position.x), toWorld(slab.box.maxY) + 0.001, toWorld(c.position.z)]} rotation={[0, degToRad(c.rotationY), 0]}>
            <mesh position={[0, 0, 0.01]} material={materials.fixed.steel} receiveShadow>
              <boxGeometry args={[toWorld(c.dimensions.width - 220), 0.004, toWorld(c.dimensions.depth - 180)]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
