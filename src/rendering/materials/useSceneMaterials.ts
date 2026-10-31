import { useEffect, useMemo } from 'react';
import { Color, MeshStandardMaterial } from 'three';
import type { KitchenMaterial } from '@/domain';
import type { PartFinish } from '@/engine/geometry/parts';
import type { VisualStyle } from '@/state/editorStore';
import { finishMaps } from './textures';

export type FixedFinish = Exclude<PartFinish, 'shutter' | 'carcass' | 'glassPane'>;

const FIXED: Record<FixedFinish, { color: string; roughness: number; metalness: number }> = {
  // The scene has image-based lighting, so metals reflect the room instead of reading as black.
  handle: { color: '#b8bcc2', roughness: 0.28, metalness: 0.9 },
  steel: { color: '#cfd3d8', roughness: 0.32, metalness: 0.85 },
  dark: { color: '#2a2b2e', roughness: 0.6, metalness: 0.1 },
  glass: { color: '#1d2329', roughness: 0.05, metalness: 0.4 },
  ceramic: { color: '#f4f4f2', roughness: 0.12, metalness: 0 },
  fabric: { color: '#e9e4da', roughness: 0.95, metalness: 0 },
};

/** X-ray (CAD visual style): see-through solids so units behind others stay visible. */
const XRAY_OPACITY = 0.28;

function make(params: { color: Color | string; roughness: number; metalness: number }, ghost: boolean): MeshStandardMaterial {
  return new MeshStandardMaterial({ ...params, transparent: ghost, opacity: ghost ? XRAY_OPACITY : 1, depthWrite: !ghost });
}

/** A finish with its generated texture (wood, tile, marble…) when it has one. */
function makeFinish(m: KitchenMaterial): MeshStandardMaterial {
  const maps = finishMaps(m);
  const mat = make({ color: maps ? '#ffffff' : new Color(m.color), roughness: m.roughness, metalness: m.metalness }, false);
  if (maps) {
    mat.map = maps.map;
    mat.roughnessMap = maps.roughnessMap;
    mat.normalMap = maps.normalMap;
    mat.normalScale.set(0.6, 0.6);
    mat.userData.worldScaled = true;
  }
  return mat;
}

/**
 * One Three.js material per project finish plus fixed appliance finishes, disposed on change.
 * `get` returns the style-appropriate material; `solid` always returns the opaque one (floors).
 */
export function useSceneMaterials(materials: Record<string, KitchenMaterial>, style: VisualStyle = 'realistic', textured = true) {
  const ghost = style === 'xray';
  // Built on first use: a project carries the whole finish library, but a design uses a few of them.
  const solid = useMemo(() => {
    const map = new Map<string, MeshStandardMaterial>();
    return {
      map,
      get: (id: string) => {
        let mat = map.get(id);
        const m = materials[id];
        if (!mat && m) map.set(id, (mat = textured ? makeFinish(m) : make({ color: new Color(m.color), roughness: m.roughness, metalness: m.metalness }, false)));
        return mat;
      },
    };
  }, [materials, textured]);
  // X-ray: see-through copies (no textures), only while that style is on.
  const styled = useMemo(() => {
    if (!ghost) return null;
    const map = new Map<string, MeshStandardMaterial>();
    for (const m of Object.values(materials)) map.set(m.id, make({ color: new Color(m.color), roughness: m.roughness, metalness: m.metalness }, true));
    return map;
  }, [materials, ghost]);
  const fixed = useMemo(() => {
    const opaque = Object.fromEntries(Object.entries(FIXED).map(([k, v]) => [k, make(v, ghost)])) as Record<FixedFinish, MeshStandardMaterial>;
    return {
      ...opaque,
      // Glass is always see-through; `frontGhost` replaces fronts when the interior is shown.
      glassPane: new MeshStandardMaterial({ color: '#cfe6ee', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
      frontGhost: new MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6, transparent: true, opacity: 0.12, depthWrite: false }),
    };
  }, [ghost]);

  useEffect(() => () => solid.map.forEach((m) => m.dispose()), [solid]);
  useEffect(() => () => styled?.forEach((m) => m.dispose()), [styled]);
  useEffect(() => () => Object.values(fixed).forEach((m) => m.dispose()), [fixed]);

  return useMemo(
    () => ({
      get: (id: string) => (styled ? styled.get(id) : solid.get(id)) ?? fixed.dark,
      solid: (id: string) => solid.get(id) ?? fixed.dark,
      fixed,
      style,
    }),
    [styled, solid, fixed, style],
  );
}

export type SceneMaterials = ReturnType<typeof useSceneMaterials>;
