import { useEffect, useMemo } from 'react';
import { Color, MeshStandardMaterial } from 'three';
import type { KitchenMaterial } from '@/domain';
import type { PartFinish } from '@/engine/geometry/parts';
import type { VisualStyle } from '@/state/editorStore';

export type FixedFinish = Exclude<PartFinish, 'shutter' | 'carcass' | 'glassPane'>;

const FIXED: Record<FixedFinish, { color: string; roughness: number; metalness: number }> = {
  // Low metalness: there is no environment map in Phase 1, and metallic surfaces would read as black.
  handle: { color: '#7d8186', roughness: 0.35, metalness: 0.35 },
  steel: { color: '#d3d6da', roughness: 0.4, metalness: 0.15 },
  dark: { color: '#2a2b2e', roughness: 0.6, metalness: 0.1 },
  glass: { color: '#1d2329', roughness: 0.08, metalness: 0.3 },
};

/** X-ray (CAD visual style): see-through solids so units behind others stay visible. */
const XRAY_OPACITY = 0.28;

function make(params: { color: Color | string; roughness: number; metalness: number }, ghost: boolean): MeshStandardMaterial {
  return new MeshStandardMaterial({ ...params, transparent: ghost, opacity: ghost ? XRAY_OPACITY : 1, depthWrite: !ghost });
}

/**
 * One Three.js material per project finish plus fixed appliance finishes, disposed on change.
 * `get` returns the style-appropriate material; `solid` always returns the opaque one (floors).
 */
export function useSceneMaterials(materials: Record<string, KitchenMaterial>, style: VisualStyle = 'realistic') {
  const ghost = style === 'xray';
  const solid = useMemo(() => {
    const map = new Map<string, MeshStandardMaterial>();
    for (const m of Object.values(materials)) map.set(m.id, make({ color: new Color(m.color), roughness: m.roughness, metalness: m.metalness }, false));
    return map;
  }, [materials]);
  const styled = useMemo(() => {
    if (!ghost) return solid;
    const map = new Map<string, MeshStandardMaterial>();
    for (const m of Object.values(materials)) map.set(m.id, make({ color: new Color(m.color), roughness: m.roughness, metalness: m.metalness }, true));
    return map;
  }, [materials, ghost, solid]);
  const fixed = useMemo(() => {
    const opaque = Object.fromEntries(Object.entries(FIXED).map(([k, v]) => [k, make(v, ghost)])) as Record<FixedFinish, MeshStandardMaterial>;
    return {
      ...opaque,
      // Glass is always see-through; `frontGhost` replaces fronts when the interior is shown.
      glassPane: new MeshStandardMaterial({ color: '#cfe6ee', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
      frontGhost: new MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6, transparent: true, opacity: 0.12, depthWrite: false }),
    };
  }, [ghost]);

  useEffect(() => () => solid.forEach((m) => m.dispose()), [solid]);
  useEffect(() => () => {
    if (styled !== solid) styled.forEach((m) => m.dispose());
  }, [styled, solid]);
  useEffect(() => () => Object.values(fixed).forEach((m) => m.dispose()), [fixed]);

  return useMemo(
    () => ({
      get: (id: string) => styled.get(id) ?? fixed.dark,
      solid: (id: string) => solid.get(id) ?? fixed.dark,
      fixed,
      style,
    }),
    [styled, solid, fixed, style],
  );
}

export type SceneMaterials = ReturnType<typeof useSceneMaterials>;
