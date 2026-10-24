import { uid } from '../domain/factory';
import type { FurnitureItem, LibraryItem, ModelItem, Wall, WallSideSign } from '../domain/types';
import { mm } from '../domain/units';
import { finishById } from '../domain/catalog';
import { materialById, type Material } from '../materials/library';
import { catalogById, type CatalogDef, type Prim, type Tone } from './library';

/** New catalogue piece at a plan position, using the entry's default size and finishes. */
export function newLibraryItem(def: CatalogDef, x: number, y: number): LibraryItem {
  return {
    id: uid('item'),
    kind: 'library',
    ref: def.id,
    name: def.name,
    xUm: Math.round(x),
    yUm: Math.round(y),
    rotDeg: 0,
    params: { widthUm: mm(def.size.w), depthUm: mm(def.size.d), heightUm: mm(def.size.h), elevationUm: mm(def.size.elev ?? 0) },
    materials: { main: def.finish, accent: def.accent },
  };
}

export function newModelItem(model: { id: string; name: string; widthUm: number; depthUm: number; heightUm: number }, x: number, y: number): ModelItem {
  const native = { widthUm: Math.max(1, Math.round(model.widthUm)), depthUm: Math.max(1, Math.round(model.depthUm)), heightUm: Math.max(1, Math.round(model.heightUm)) };
  return { id: uid('item'), kind: 'model', modelId: model.id, name: model.name, xUm: Math.round(x), yUm: Math.round(y), rotDeg: 0, params: { ...native, elevationUm: 0 }, native };
}

/** Fixed tones not tied to the item's chosen finishes. */
const FIXED: Partial<Record<Tone, string>> = {
  metal: 'steel',
  glass: 'glass',
  white: 'ceramic-white',
  dark: 'metal-black',
  green: 'plant-green',
};

export interface MaterialPrim extends Prim {
  material: Material;
}

/** Geometry with resolved materials. Wrong or removed refs fall back to a plain box so scenes never break. */
export function libraryPrims(item: LibraryItem): MaterialPrim[] {
  const def = catalogById(item.ref);
  const { widthUm: w, depthUm: d, heightUm: h } = item.params;
  const prims = def ? def.build({ w, d, h }) : [{ key: 'box', shape: 'box' as const, x: 0, y: 0, z: 0, w, d, h, tone: 'main' as Tone }];
  const main = materialById(item.materials.main);
  const accent = materialById(item.materials.accent);
  const soft = materialById(def?.tags.includes('sofa') || def?.category === 'bedroom' ? 'fabric-beige' : item.materials.main);
  return prims.map((p) => {
    const fixed = FIXED[p.tone];
    const material =
      fixed ? materialById(fixed)
      : p.tone === 'accent' ? accent
      : p.tone === 'soft' ? (p.key.startsWith('pillow') ? materialById('ivory') : soft)
      : main; // 'main' and 'fabric'
    return { ...p, material };
  });
}

/** Representative colour for lists and plan fills. */
export function itemSwatch(f: FurnitureItem): string {
  switch (f.kind) {
    case 'wardrobe':
    case 'tvunit':
    case 'basecabinet':
    case 'wallcabinet':
    case 'tallcabinet':
      return finishById(f.materials.shutter).color;
    case 'library':
      return materialById(f.materials.main).color;
    case 'model':
      return '#b9b2a7';
    default:
      return f.params.color;
  }
}

/** Material id on one face of a wall, or undefined when it follows the room colour. */
export function wallFaceFinish(w: Wall, side: WallSideSign): string | undefined {
  return side === 1 ? w.finishes?.pos : w.finishes?.neg;
}
