/**
 * Textured finishes are mapped at real size: every mesh's UVs are rewritten once to metres in the
 * plane its face looks along (x/z for floors and worktops, x/y or z/y for walls and fronts), so a
 * 180 mm plank or a 600 mm tile has the same size on every part, whatever its dimensions.
 */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { BufferAttribute, type BufferGeometry, type Mesh } from 'three';

export function applyWorldUVs(geometry: BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!pos || !normal) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Faces looking up/down use the floor plane; others run along their width with height up.
    if (ny >= nx && ny >= nz) uv.set([x, z], i * 2);
    else if (nx >= nz) uv.set([z, y], i * 2);
    else uv.set([x, y], i * 2);
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.userData.worldUV = true;
}

/** Rewrites UVs of new meshes that use a textured finish (checked a few times a second). */
export function WorldUVs() {
  const frame = useRef(0);
  useFrame(({ scene }) => {
    if (frame.current++ % 15) return;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.geometry.userData.worldUV) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((m) => (m as { userData?: { worldScaled?: boolean } }).userData?.worldScaled)) applyWorldUVs(mesh.geometry);
    });
  });
  return null;
}
