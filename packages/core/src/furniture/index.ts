import type { DecorItem, FurnitureItem, RulePack, TvUnitItem, WardrobeItem } from '../domain/types';
import { mm, type Um } from '../domain/units';
import type { Box3, ResolvedFurniture } from './parts';
import { resolveTvUnit } from './tvunit';
import { resolveWardrobe } from './wardrobe';

export * from './parts';
export { resolveWardrobe, WARDROBE_TEMPLATE_VERSION } from './wardrobe';
export { resolveTvUnit, TVUNIT_TEMPLATE_VERSION } from './tvunit';

const cache = new WeakMap<object, { rp: RulePack; out: ResolvedFurniture }>();

/** Pure, memoized on the params object identity (params are immutable in the store). */
export function resolveParametric(item: WardrobeItem | TvUnitItem, rp: RulePack): ResolvedFurniture {
  const hit = cache.get(item.params);
  if (hit && hit.rp === rp) return hit.out;
  const out = item.kind === 'wardrobe' ? resolveWardrobe(item.params, rp) : resolveTvUnit(item.params, rp);
  cache.set(item.params, { rp, out });
  return out;
}

export interface Envelope {
  widthUm: Um;
  depthUm: Um;
  heightUm: Um; // top of the piece above floor
  zMinUm: Um;
}

export function envelope(item: FurnitureItem): Envelope {
  const p = item.params;
  if (item.kind === 'tvunit') {
    const q = item.params;
    return { widthUm: q.widthUm, depthUm: q.depthUm, heightUm: q.mountHeightUm + q.heightUm + q.wallPanelHeightUm, zMinUm: q.mountHeightUm };
  }
  return { widthUm: p.widthUm, depthUm: p.depthUm, heightUm: p.heightUm, zMinUm: 0 };
}

export interface ColoredBox extends Box3 {
  color: string;
  key: string;
}

/** Visual-only geometry for catalogue (non-manufacturable) pieces. */
export function decorBoxes(item: DecorItem): ColoredBox[] {
  const { widthUm: W, depthUm: D, heightUm: H, color } = item.params;
  const soft = '#efe9df';
  const wood = '#7a5a40';
  switch (item.kind) {
    case 'bed': {
      const base = Math.min(mm(350), H);
      const mat = mm(200);
      const head = Math.max(H, base + mat + mm(100));
      return [
        { key: 'base', x: 0, y: mm(60), z: 0, w: W, d: D - mm(60), h: base, color },
        { key: 'mattress', x: mm(25), y: mm(85), z: base, w: W - mm(50), d: D - mm(110), h: mat, color: soft },
        { key: 'headboard', x: 0, y: 0, z: 0, w: W, d: mm(60), h: head, color },
        { key: 'pillow-l', x: mm(80), y: mm(120), z: base + mat, w: W / 2 - mm(120), d: mm(380), h: mm(110), color: '#ffffff' },
        { key: 'pillow-r', x: W / 2 + mm(40), y: mm(120), z: base + mat, w: W / 2 - mm(120), d: mm(380), h: mm(110), color: '#ffffff' },
      ];
    }
    case 'sofa': {
      const seat = mm(420);
      const arm = mm(160);
      return [
        { key: 'base', x: 0, y: 0, z: mm(100), w: W, d: D, h: seat - mm(100), color },
        { key: 'back', x: 0, y: 0, z: seat, w: W, d: mm(200), h: H - seat, color },
        { key: 'arm-l', x: 0, y: 0, z: seat, w: arm, d: D, h: mm(200), color },
        { key: 'arm-r', x: W - arm, y: 0, z: seat, w: arm, d: D, h: mm(200), color },
        { key: 'cushion', x: arm, y: mm(200), z: seat, w: W - 2 * arm, d: D - mm(220), h: mm(110), color: soft },
        { key: 'legs', x: mm(40), y: mm(40), z: 0, w: W - mm(80), d: D - mm(80), h: mm(100), color: wood },
      ];
    }
    case 'table':
    case 'side-table': {
      const top = mm(30);
      const leg = mm(50);
      const lh = H - top;
      return [
        { key: 'top', x: 0, y: 0, z: lh, w: W, d: D, h: top, color },
        { key: 'leg-1', x: mm(30), y: mm(30), z: 0, w: leg, d: leg, h: lh, color: wood },
        { key: 'leg-2', x: W - mm(30) - leg, y: mm(30), z: 0, w: leg, d: leg, h: lh, color: wood },
        { key: 'leg-3', x: mm(30), y: D - mm(30) - leg, z: 0, w: leg, d: leg, h: lh, color: wood },
        { key: 'leg-4', x: W - mm(30) - leg, y: D - mm(30) - leg, z: 0, w: leg, d: leg, h: lh, color: wood },
      ];
    }
    default:
      return [{ key: 'box', x: 0, y: 0, z: 0, w: W, d: D, h: H, color }];
  }
}
