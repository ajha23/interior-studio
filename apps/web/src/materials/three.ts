import * as THREE from 'three';
import { materialById, type MaterialCategory } from '@studio/core';
import { patternCanvas, tileMm } from './patterns';

const textures = new Map<string, THREE.CanvasTexture>();
const mats = new Map<string, THREE.MeshStandardMaterial>();

function baseTexture(id: string, category: MaterialCategory): THREE.CanvasTexture {
  const m = materialById(id, category);
  let t = textures.get(m.id);
  if (!t) {
    t = new THREE.CanvasTexture(patternCanvas(m.id, category));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(m.id, t);
  }
  return t;
}

/**
 * Shared material for a library material id. For patterned materials, pass the face size in mm
 * (`uMm` × `vMm`) when the geometry has 0…1 UVs, or `worldUv` when UVs are already in metres
 * (ShapeGeometry floors). Results are cached so identical faces share one material.
 */
export function threeMaterial(id: string | undefined, category: MaterialCategory, opts: { uMm?: number; vMm?: number; worldUv?: boolean; plain?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = materialById(id, category);
  const patterned = m.pattern !== 'plain' && !opts.plain;
  const tile = tileMm(m);
  let ru = 1;
  let rv = 1;
  if (patterned) {
    if (opts.worldUv) ru = rv = 1000 / tile;
    else {
      ru = Math.max(0.05, Math.round(((opts.uMm ?? tile) / tile) * 20) / 20);
      rv = Math.max(0.05, Math.round(((opts.vMm ?? tile) / tile) * 20) / 20);
    }
  }
  const key = `${m.id}|${patterned ? `${ru}x${rv}` : 'p'}`;
  let mat = mats.get(key);
  if (!mat) {
    const gloss = m.gloss ?? 0.2;
    const metal = m.id.startsWith('metal') || m.id === 'steel';
    const glass = m.id === 'glass';
    mat = new THREE.MeshStandardMaterial({
      color: patterned ? '#ffffff' : m.color,
      roughness: 0.95 - gloss * 0.75,
      metalness: metal ? 0.6 : 0.02,
      transparent: glass,
      opacity: glass ? 0.35 : 1,
    });
    if (patterned) {
      const t = baseTexture(m.id, category).clone();
      t.needsUpdate = true;
      t.repeat.set(ru, rv);
      mat.map = t;
    }
    mats.set(key, mat);
  }
  return mat;
}
