import { mm, type Um } from '../domain/units';

/**
 * Built-in catalogue. Each entry builds its geometry from the requested size, so any piece can be
 * resized exactly. Geometry is a list of primitives in the item's local frame:
 *   x along the width from the left, y from the back toward the front, z up from the item's base.
 * Ids are stable (scenes store them); never rename an id.
 */
export type CatalogCategory = 'living' | 'bedroom' | 'dining' | 'kitchen' | 'bath' | 'office' | 'kids' | 'storage' | 'appliances' | 'lighting' | 'decor';
export type Mount = 'floor' | 'wall' | 'ceiling';
export type Tone = 'main' | 'accent' | 'fabric' | 'metal' | 'glass' | 'white' | 'dark' | 'green' | 'soft';

export interface Prim {
  key: string;
  shape: 'box' | 'cylinder' | 'sphere' | 'cone';
  x: Um;
  y: Um;
  z: Um;
  w: Um;
  d: Um;
  h: Um;
  tone: Tone;
}

export interface Dims {
  w: Um;
  d: Um;
  h: Um;
}

export interface CatalogDef {
  id: string;
  name: string;
  category: CatalogCategory;
  tags: string[];
  mount: Mount;
  /** Default size in mm, and height above floor for wall/ceiling pieces. */
  size: { w: number; d: number; h: number; elev?: number };
  /** Default material ids for the main and accent tones. */
  finish: string;
  accent: string;
  build: (d: Dims) => Prim[];
}

const M = mm;
const box = (key: string, x: number, y: number, z: number, w: number, d: number, h: number, tone: Tone = 'main'): Prim => ({ key, shape: 'box', x, y, z, w: Math.max(w, 1), d: Math.max(d, 1), h: Math.max(h, 1), tone });
const cyl = (key: string, x: number, y: number, z: number, w: number, d: number, h: number, tone: Tone = 'main'): Prim => ({ ...box(key, x, y, z, w, d, h, tone), shape: 'cylinder' });
const ball = (key: string, x: number, y: number, z: number, w: number, d: number, h: number, tone: Tone = 'main'): Prim => ({ ...box(key, x, y, z, w, d, h, tone), shape: 'sphere' });
const cone = (key: string, x: number, y: number, z: number, w: number, d: number, h: number, tone: Tone = 'main'): Prim => ({ ...box(key, x, y, z, w, d, h, tone), shape: 'cone' });

/** Four square legs inset from the corners. */
function legs(w: number, d: number, h: number, t = M(45), inset = M(30), tone: Tone = 'accent'): Prim[] {
  return [
    box('leg1', inset, inset, 0, t, t, h, tone),
    box('leg2', w - inset - t, inset, 0, t, t, h, tone),
    box('leg3', inset, d - inset - t, 0, t, t, h, tone),
    box('leg4', w - inset - t, d - inset - t, 0, t, t, h, tone),
  ];
}

function table({ w, d, h }: Dims, top = M(30)): Prim[] {
  return [box('top', 0, 0, h - top, w, d, top), ...legs(w, d, h - top)];
}

function roundTable({ w, d, h }: Dims): Prim[] {
  const top = M(30);
  return [cyl('top', 0, 0, h - top, w, d, top), cyl('stem', w / 2 - M(40), d / 2 - M(40), M(20), M(80), M(80), h - top - M(20), 'accent'), cyl('foot', w / 2 - w * 0.2, d / 2 - d * 0.2, 0, w * 0.4, d * 0.4, M(20), 'accent')];
}

function sofa({ w, d, h }: Dims, arms = true): Prim[] {
  const seat = M(430);
  const arm = arms ? Math.min(M(180), w * 0.12) : 0;
  const back = Math.min(M(220), d * 0.28);
  const out: Prim[] = [
    box('plinth', M(20), M(20), M(90), w - M(40), d - M(40), seat - M(90) - M(120), 'fabric'),
    box('back', 0, 0, M(90), w, back, h - M(90), 'fabric'),
    box('cushion', arm, back, seat - M(120), w - 2 * arm, d - back, M(140), 'soft'),
    ...legs(w, d, M(90), M(40), M(50), 'dark'),
  ];
  if (arms) out.push(box('armL', 0, 0, M(90), arm, d, seat - M(90) + M(180), 'fabric'), box('armR', w - arm, 0, M(90), arm, d, seat - M(90) + M(180), 'fabric'));
  return out;
}

function chair({ w, d, h }: Dims, upholstered = false): Prim[] {
  const seat = M(450);
  return [
    box('seat', 0, 0, seat - M(40), w, d, M(40), upholstered ? 'fabric' : 'main'),
    box('back', 0, 0, seat, w, M(40), h - seat, upholstered ? 'fabric' : 'main'),
    ...legs(w, d, seat - M(40), M(35), M(15), 'accent'),
  ];
}

function bed({ w, d, h }: Dims, mattressH = M(200)): Prim[] {
  const base = M(350);
  const head = Math.max(h, base + mattressH + M(150));
  return [
    box('base', 0, M(60), M(80), w, d - M(60), base - M(80)),
    box('kick', M(30), M(90), 0, w - M(60), d - M(120), M(80), 'dark'),
    box('mattress', M(25), M(85), base, w - M(50), d - M(110), mattressH, 'white'),
    box('headboard', 0, 0, 0, w, M(60), head, 'fabric'),
    box('pillowL', M(80), M(130), base + mattressH, w / 2 - M(120), M(380), M(110), 'soft'),
    box('pillowR', w / 2 + M(40), M(130), base + mattressH, w / 2 - M(120), M(380), M(110), 'soft'),
    box('throw', M(25), d - M(700), base + mattressH, w - M(50), M(500), M(20), 'accent'),
  ];
}

/** Box cabinet with door/drawer reveal lines on the front. */
function cabinet({ w, d, h }: Dims, opts: { doors?: number; drawers?: number; plinth?: number; open?: boolean } = {}): Prim[] {
  const plinth = opts.plinth ?? M(75);
  const out: Prim[] = [box('carcass', 0, 0, plinth, w, d - M(18), h - plinth)];
  if (plinth > 0) out.push(box('plinth', M(20), M(40), 0, w - M(40), d - M(80), plinth, 'dark'));
  const fz = plinth;
  const fh = h - plinth;
  if (opts.open) {
    const shelves = Math.max(1, Math.round(fh / M(350)));
    for (let i = 1; i < shelves; i++) out.push(box(`shelf${i}`, M(18), M(18), fz + (fh * i) / shelves, w - M(36), d - M(36), M(18), 'accent'));
    return out;
  }
  const doors = opts.doors ?? 0;
  const drawers = opts.drawers ?? 0;
  if (drawers > 0) {
    const dh = doors > 0 ? fh * 0.3 : fh;
    for (let i = 0; i < drawers; i++) out.push(box(`drawer${i}`, M(3), d - M(18), fz + fh - (dh * (i + 1)) / drawers + M(2), w - M(6), M(18), dh / drawers - M(4), 'accent'));
    if (doors > 0) {
      const dw = w / doors;
      for (let i = 0; i < doors; i++) out.push(box(`door${i}`, i * dw + M(2), d - M(18), fz + M(2), dw - M(4), M(18), fh - dh - M(4), 'accent'));
    }
  } else if (doors > 0) {
    const dw = w / doors;
    for (let i = 0; i < doors; i++) out.push(box(`door${i}`, i * dw + M(2), d - M(18), fz + M(2), dw - M(4), M(18), fh - M(4), 'accent'));
  }
  return out;
}

function lamp({ w, d, h }: Dims): Prim[] {
  const b = Math.min(M(260), w, d);
  return [cyl('base', w / 2 - b / 2, d / 2 - b / 2, 0, b, b, M(30), 'metal'), cyl('pole', w / 2 - M(12), d / 2 - M(12), M(30), M(24), M(24), h - M(380), 'metal'), cyl('shade', 0, 0, h - M(350), w, d, M(350), 'soft')];
}

function plant({ w, d, h }: Dims): Prim[] {
  const pot = Math.min(h * 0.35, M(450));
  return [cyl('pot', w * 0.15, d * 0.15, 0, w * 0.7, d * 0.7, pot, 'main'), ball('foliage', 0, 0, pot * 0.8, w, d, h - pot * 0.8, 'green')];
}

export const CATALOG: CatalogDef[] = [
  // Living
  { id: 'sofa-3', name: '3-seat sofa', category: 'living', tags: ['sofa', 'couch', 'seating'], mount: 'floor', size: { w: 2100, d: 900, h: 820 }, finish: 'fabric-beige', accent: 'walnut', build: (d) => sofa(d) },
  { id: 'sofa-2', name: '2-seat sofa', category: 'living', tags: ['sofa', 'loveseat', 'seating'], mount: 'floor', size: { w: 1600, d: 880, h: 820 }, finish: 'fabric-grey', accent: 'walnut', build: (d) => sofa(d) },
  {
    id: 'sofa-l', name: 'L-shaped sofa', category: 'living', tags: ['sofa', 'sectional', 'corner', 'l shape'], mount: 'floor', size: { w: 2700, d: 1700, h: 820 }, finish: 'fabric-grey', accent: 'walnut',
    build: ({ w, d, h }) => [...sofa({ w, d: M(900), h }), ...sofa({ w: M(900), d: d - M(900), h }, false).map((p) => ({ ...p, key: `ch-${p.key}`, x: p.x + w - M(900), y: p.y + M(900) }))],
  },
  { id: 'armchair', name: 'Armchair', category: 'living', tags: ['chair', 'accent chair', 'seating'], mount: 'floor', size: { w: 800, d: 820, h: 800 }, finish: 'fabric-teal', accent: 'walnut', build: (d) => sofa(d) },
  { id: 'diwan', name: 'Diwan', category: 'living', tags: ['diwan', 'divan', 'daybed', 'india'], mount: 'floor', size: { w: 1900, d: 800, h: 450 }, finish: 'teak', accent: 'fabric-mustard', build: ({ w, d, h }) => [box('frame', 0, 0, M(100), w, d, h - M(250)), box('mattress', M(20), M(20), h - M(150), w - M(40), d - M(40), M(120), 'accent'), ...legs(w, d, M(100), M(60), M(40), 'main'), box('bolsterL', M(30), M(60), h - M(30), M(220), d - M(120), M(200), 'soft'), box('bolsterR', w - M(250), M(60), h - M(30), M(220), d - M(120), M(200), 'soft')] },
  { id: 'coffee-table', name: 'Coffee table', category: 'living', tags: ['table', 'centre table', 'center table'], mount: 'floor', size: { w: 1100, d: 600, h: 420 }, finish: 'walnut', accent: 'metal-black', build: (d) => table(d, M(40)) },
  { id: 'coffee-table-round', name: 'Round coffee table', category: 'living', tags: ['table', 'centre table', 'round'], mount: 'floor', size: { w: 850, d: 850, h: 400 }, finish: 'marble', accent: 'metal-brass', build: roundTable },
  { id: 'side-table', name: 'Side table', category: 'living', tags: ['table', 'end table'], mount: 'floor', size: { w: 450, d: 450, h: 550 }, finish: 'walnut', accent: 'metal-black', build: roundTable },
  { id: 'tv-console', name: 'TV console', category: 'living', tags: ['tv', 'media', 'console', 'low unit'], mount: 'floor', size: { w: 1800, d: 420, h: 480 }, finish: 'walnut', accent: 'oak-light', build: (d) => cabinet(d, { drawers: 0, doors: 3, plinth: M(100) }) },
  { id: 'tv-65', name: 'TV 65" (wall)', category: 'living', tags: ['tv', 'television', 'screen'], mount: 'wall', size: { w: 1450, d: 60, h: 840, elev: 1000 }, finish: 'metal-black', accent: 'metal-black', build: ({ w, d, h }) => [box('panel', 0, 0, 0, w, d, h, 'dark')] },
  { id: 'bookshelf', name: 'Bookshelf', category: 'living', tags: ['shelf', 'books', 'storage', 'open'], mount: 'floor', size: { w: 900, d: 350, h: 1900 }, finish: 'oak-light', accent: 'oak-light', build: (d) => cabinet(d, { open: true, plinth: 0 }) },
  { id: 'rug', name: 'Rug', category: 'living', tags: ['rug', 'carpet', 'dhurrie'], mount: 'floor', size: { w: 2400, d: 1700, h: 12 }, finish: 'fabric-beige', accent: 'fabric-beige', build: ({ w, d, h }) => [box('rug', 0, 0, 0, w, d, h, 'main')] },
  { id: 'ottoman', name: 'Pouf / ottoman', category: 'living', tags: ['pouf', 'ottoman', 'stool'], mount: 'floor', size: { w: 500, d: 500, h: 420 }, finish: 'fabric-mustard', accent: 'fabric-mustard', build: ({ w, d, h }) => [cyl('pouf', 0, 0, 0, w, d, h, 'main')] },
  { id: 'jhoola', name: 'Jhoola (swing)', category: 'living', tags: ['jhoola', 'swing', 'india'], mount: 'floor', size: { w: 1400, d: 700, h: 2400 }, finish: 'teak', accent: 'metal-brass', build: ({ w, d, h }) => [box('seat', M(100), M(100), M(450), w - M(200), d - M(200), M(60)), box('back', M(100), M(100), M(510), w - M(200), M(50), M(400)), cyl('chainL', M(150), d / 2 - M(10), M(510), M(20), M(20), h - M(510), 'accent'), cyl('chainR', w - M(170), d / 2 - M(10), M(510), M(20), M(20), h - M(510), 'accent')] },

  // Bedroom
  { id: 'bed-king', name: 'King bed', category: 'bedroom', tags: ['bed', 'king', 'double'], mount: 'floor', size: { w: 1980, d: 2150, h: 1100 }, finish: 'walnut', accent: 'fabric-beige', build: (d) => bed(d) },
  { id: 'bed-queen', name: 'Queen bed', category: 'bedroom', tags: ['bed', 'queen', 'double'], mount: 'floor', size: { w: 1600, d: 2100, h: 1000 }, finish: 'oak-light', accent: 'fabric-grey', build: (d) => bed(d) },
  { id: 'bed-single', name: 'Single bed', category: 'bedroom', tags: ['bed', 'single'], mount: 'floor', size: { w: 1000, d: 2000, h: 900 }, finish: 'oak-light', accent: 'fabric-teal', build: (d) => bed(d, M(180)) },
  { id: 'bed-storage', name: 'Storage bed (hydraulic)', category: 'bedroom', tags: ['bed', 'storage', 'hydraulic', 'box'], mount: 'floor', size: { w: 1830, d: 2130, h: 1050 }, finish: 'walnut', accent: 'fabric-grey', build: ({ w, d, h }) => bed({ w, d, h }).map((p) => (p.key === 'kick' ? { ...p, h: M(300), z: 0 } : p.key === 'base' ? { ...p, z: M(300), h: M(50) } : p)) },
  { id: 'nightstand', name: 'Bedside table', category: 'bedroom', tags: ['nightstand', 'bedside', 'side table'], mount: 'floor', size: { w: 450, d: 400, h: 500 }, finish: 'walnut', accent: 'oak-light', build: (d) => cabinet(d, { drawers: 2, plinth: M(120) }) },
  { id: 'dresser', name: 'Dresser', category: 'bedroom', tags: ['dresser', 'chest', 'drawers'], mount: 'floor', size: { w: 1200, d: 450, h: 800 }, finish: 'oak-light', accent: 'oak-light', build: (d) => cabinet(d, { drawers: 4 }) },
  { id: 'dressing-unit', name: 'Dressing unit with mirror', category: 'bedroom', tags: ['dressing', 'vanity', 'mirror'], mount: 'floor', size: { w: 900, d: 400, h: 1800 }, finish: 'white-matte', accent: 'glass', build: ({ w, d, h }) => [...cabinet({ w, d, h: M(750) }, { drawers: 2 }), box('mirror', M(100), 0, M(900), w - M(200), M(25), h - M(950), 'glass')] },
  { id: 'study-desk', name: 'Study desk', category: 'bedroom', tags: ['desk', 'study', 'table'], mount: 'floor', size: { w: 1200, d: 600, h: 750 }, finish: 'oak-light', accent: 'metal-black', build: (d) => table(d, M(25)) },
  { id: 'mirror-full', name: 'Full-length mirror', category: 'bedroom', tags: ['mirror'], mount: 'wall', size: { w: 600, d: 30, h: 1600, elev: 300 }, finish: 'glass', accent: 'metal-brass', build: ({ w, d, h }) => [box('frame', 0, 0, 0, w, d, h, 'accent'), box('glass', M(25), d - M(5), M(25), w - M(50), M(5), h - M(50), 'glass')] },

  // Dining
  { id: 'dining-6', name: 'Dining table, 6 seats', category: 'dining', tags: ['dining', 'table', '6 seater'], mount: 'floor', size: { w: 1800, d: 900, h: 750 }, finish: 'teak', accent: 'teak', build: (d) => table(d, M(35)) },
  { id: 'dining-4', name: 'Dining table, 4 seats', category: 'dining', tags: ['dining', 'table', '4 seater'], mount: 'floor', size: { w: 1200, d: 800, h: 750 }, finish: 'oak-light', accent: 'oak-light', build: (d) => table(d, M(35)) },
  { id: 'dining-round', name: 'Round dining table', category: 'dining', tags: ['dining', 'table', 'round'], mount: 'floor', size: { w: 1100, d: 1100, h: 750 }, finish: 'marble', accent: 'metal-black', build: roundTable },
  { id: 'dining-chair', name: 'Dining chair', category: 'dining', tags: ['chair', 'dining'], mount: 'floor', size: { w: 460, d: 500, h: 880 }, finish: 'teak', accent: 'teak', build: (d) => chair(d) },
  { id: 'dining-chair-uph', name: 'Upholstered dining chair', category: 'dining', tags: ['chair', 'dining', 'upholstered'], mount: 'floor', size: { w: 480, d: 540, h: 900 }, finish: 'fabric-beige', accent: 'walnut', build: (d) => chair(d, true) },
  { id: 'sideboard', name: 'Sideboard / crockery', category: 'dining', tags: ['sideboard', 'crockery', 'buffet'], mount: 'floor', size: { w: 1600, d: 450, h: 850 }, finish: 'walnut', accent: 'oak-light', build: (d) => cabinet(d, { doors: 4, drawers: 2 }) },
  { id: 'bar-stool', name: 'Bar stool', category: 'dining', tags: ['stool', 'bar', 'counter'], mount: 'floor', size: { w: 400, d: 400, h: 750 }, finish: 'leather-tan', accent: 'metal-black', build: ({ w, d, h }) => [cyl('seat', 0, 0, h - M(60), w, d, M(60)), cyl('stem', w / 2 - M(25), d / 2 - M(25), M(20), M(50), M(50), h - M(80), 'accent'), cyl('foot', w * 0.15, d * 0.15, 0, w * 0.7, d * 0.7, M(20), 'accent')] },

  // Kitchen
  { id: 'fridge-double', name: 'Refrigerator, double door', category: 'kitchen', tags: ['fridge', 'refrigerator', 'appliance'], mount: 'floor', size: { w: 700, d: 720, h: 1750 }, finish: 'steel', accent: 'steel', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), box('line', M(10), d, h * 0.62, w - M(20), M(5), M(8), 'dark'), box('handle', w - M(60), d, h * 0.3, M(20), M(30), h * 0.25, 'dark')] },
  { id: 'fridge-side', name: 'Refrigerator, side-by-side', category: 'kitchen', tags: ['fridge', 'refrigerator', 'appliance'], mount: 'floor', size: { w: 910, d: 730, h: 1780 }, finish: 'steel', accent: 'steel', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), box('split', w / 2 - M(4), d, M(20), M(8), M(5), h - M(40), 'dark')] },
  { id: 'kitchen-base', name: 'Kitchen base run', category: 'kitchen', tags: ['kitchen', 'counter', 'base unit', 'modular'], mount: 'floor', size: { w: 2400, d: 600, h: 900 }, finish: 'white-matte', accent: 'white-matte', build: ({ w, d, h }) => [...cabinet({ w, d, h: h - M(40) }, { doors: Math.max(1, Math.round(w / M(600))), plinth: M(100) }), box('counter', 0, 0, h - M(40), w, d + M(20), M(40), 'dark')] },
  { id: 'kitchen-wall', name: 'Kitchen wall cabinets', category: 'kitchen', tags: ['kitchen', 'overhead', 'wall unit', 'loft'], mount: 'wall', size: { w: 2400, d: 350, h: 700, elev: 1500 }, finish: 'white-matte', accent: 'white-matte', build: (d) => cabinet(d, { doors: Math.max(1, Math.round(d.w / M(600))), plinth: 0 }) },
  { id: 'hob', name: 'Gas hob, 3 burner', category: 'kitchen', tags: ['hob', 'stove', 'cooktop', 'gas'], mount: 'floor', size: { w: 750, d: 450, h: 900 }, finish: 'glass', accent: 'metal-black', build: ({ w, d, h }) => [box('glass', 0, 0, h - M(20), w, d, M(20), 'dark'), cyl('b1', w * 0.15, d * 0.3, h, M(120), M(120), M(25), 'metal'), cyl('b2', w * 0.45, d * 0.3, h, M(120), M(120), M(25), 'metal'), cyl('b3', w * 0.72, d * 0.3, h, M(120), M(120), M(25), 'metal')] },
  { id: 'chimney', name: 'Kitchen chimney', category: 'kitchen', tags: ['chimney', 'hood', 'exhaust'], mount: 'wall', size: { w: 900, d: 480, h: 900, elev: 1550 }, finish: 'steel', accent: 'glass', build: ({ w, d, h }) => [box('hood', 0, 0, 0, w, d, M(120)), box('glass', M(20), d * 0.2, M(120), w - M(40), d * 0.6, M(10), 'glass'), box('duct', w / 2 - M(150), 0, M(120), M(300), M(250), h - M(120))] },
  { id: 'microwave', name: 'Microwave / OTG', category: 'kitchen', tags: ['microwave', 'otg', 'oven'], mount: 'floor', size: { w: 520, d: 400, h: 310 }, finish: 'metal-black', accent: 'glass', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), box('door', M(20), d, M(20), w * 0.7, M(5), h - M(40), 'glass')] },
  { id: 'sink-kitchen', name: 'Kitchen sink, single bowl', category: 'kitchen', tags: ['sink', 'kitchen'], mount: 'floor', size: { w: 800, d: 500, h: 900 }, finish: 'steel', accent: 'steel', build: ({ w, d, h }) => [box('rim', 0, 0, h - M(15), w, d, M(15)), box('bowl', M(60), M(60), h - M(220), w - M(120), d - M(120), M(205), 'metal'), cyl('tap', w / 2 - M(15), M(10), h, M(30), M(30), M(250), 'metal')] },
  { id: 'dishwasher', name: 'Dishwasher', category: 'kitchen', tags: ['dishwasher', 'appliance'], mount: 'floor', size: { w: 600, d: 600, h: 850 }, finish: 'steel', accent: 'steel', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), box('handle', M(60), d, h - M(80), w - M(120), M(25), M(20), 'dark')] },
  { id: 'water-purifier', name: 'Water purifier (RO)', category: 'kitchen', tags: ['ro', 'water purifier', 'india'], mount: 'wall', size: { w: 280, d: 300, h: 480, elev: 1200 }, finish: 'white-matte', accent: 'glass', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), box('tank', M(30), d, h * 0.3, w - M(60), M(5), h * 0.4, 'glass')] },

  // Bath
  { id: 'wc', name: 'Wall-hung WC', category: 'bath', tags: ['wc', 'toilet', 'commode'], mount: 'floor', size: { w: 370, d: 540, h: 800 }, finish: 'ceramic-white', accent: 'ceramic-white', build: ({ w, d }) => [box('cistern', 0, 0, M(380), w, M(120), M(420), 'white'), box('bowl', M(10), M(120), M(250), w - M(20), d - M(120), M(160), 'white'), box('seat', M(10), M(120), M(410), w - M(20), d - M(130), M(25), 'white')] },
  { id: 'basin-vanity', name: 'Washbasin with vanity', category: 'bath', tags: ['basin', 'washbasin', 'vanity', 'sink'], mount: 'floor', size: { w: 800, d: 480, h: 850 }, finish: 'oak-light', accent: 'ceramic-white', build: ({ w, d, h }) => [...cabinet({ w, d, h: h - M(150) }, { doors: 2, plinth: M(150) }).filter((p) => p.key !== 'plinth'), box('basin', M(40), M(30), h - M(150), w - M(80), d - M(50), M(150), 'accent'), cyl('tap', w / 2 - M(15), M(20), h, M(30), M(30), M(200), 'metal')] },
  { id: 'shower', name: 'Shower enclosure', category: 'bath', tags: ['shower', 'enclosure', 'glass'], mount: 'floor', size: { w: 900, d: 900, h: 2000 }, finish: 'glass', accent: 'steel', build: ({ w, d, h }) => [box('tray', 0, 0, 0, w, d, M(40), 'white'), box('glassF', 0, d - M(10), M(40), w, M(10), h - M(40), 'glass'), box('glassS', w - M(10), 0, M(40), M(10), d, h - M(40), 'glass'), cyl('head', M(100), M(60), h - M(150), M(200), M(200), M(15), 'metal')] },
  { id: 'bathtub', name: 'Bathtub', category: 'bath', tags: ['bathtub', 'tub'], mount: 'floor', size: { w: 1700, d: 750, h: 580 }, finish: 'ceramic-white', accent: 'ceramic-white', build: ({ w, d, h }) => [box('tub', 0, 0, 0, w, d, h, 'white')] },
  { id: 'geyser', name: 'Geyser', category: 'bath', tags: ['geyser', 'water heater', 'india'], mount: 'wall', size: { w: 400, d: 380, h: 520, elev: 1800 }, finish: 'white-matte', accent: 'white-matte', build: ({ w, d, h }) => [cyl('tank', 0, 0, 0, w, d, h)] },
  { id: 'towel-rail', name: 'Towel rail', category: 'bath', tags: ['towel', 'rail', 'rod'], mount: 'wall', size: { w: 600, d: 100, h: 60, elev: 1200 }, finish: 'steel', accent: 'steel', build: ({ w, d, h }) => [cyl('rod', 0, d / 2, 0, w, M(25), h, 'metal')] },

  // Office
  { id: 'office-desk', name: 'Office desk', category: 'office', tags: ['desk', 'work', 'table'], mount: 'floor', size: { w: 1400, d: 700, h: 750 }, finish: 'oak-light', accent: 'metal-black', build: (d) => table(d, M(25)) },
  { id: 'office-chair', name: 'Office chair', category: 'office', tags: ['chair', 'office', 'task'], mount: 'floor', size: { w: 650, d: 650, h: 1100 }, finish: 'fabric-grey', accent: 'metal-black', build: ({ w, d, h }) => [cyl('base', M(50), M(50), 0, w - M(100), d - M(100), M(60), 'accent'), cyl('gas', w / 2 - M(30), d / 2 - M(30), M(60), M(60), M(60), M(380), 'accent'), box('seat', M(60), M(60), M(440), w - M(120), d - M(120), M(80), 'fabric'), box('back', M(80), M(40), M(520), w - M(160), M(60), h - M(520), 'fabric')] },
  { id: 'filing-cabinet', name: 'Filing cabinet', category: 'office', tags: ['filing', 'pedestal', 'drawers'], mount: 'floor', size: { w: 400, d: 500, h: 650 }, finish: 'graphite', accent: 'graphite', build: (d) => cabinet(d, { drawers: 3, plinth: M(30) }) },

  // Kids
  { id: 'bunk-bed', name: 'Bunk bed', category: 'kids', tags: ['bunk', 'bed', 'kids'], mount: 'floor', size: { w: 1000, d: 2050, h: 1650 }, finish: 'oak-light', accent: 'fabric-teal', build: ({ w, d, h }) => [...bed({ w, d, h: M(500) }).filter((p) => p.key !== 'headboard'), ...bed({ w, d, h: M(500) }).filter((p) => p.key !== 'headboard').map((p) => ({ ...p, key: `up-${p.key}`, z: p.z + M(950) })), box('post1', 0, 0, 0, M(60), M(60), h), box('post2', w - M(60), 0, 0, M(60), M(60), h), box('post3', 0, d - M(60), 0, M(60), M(60), h), box('post4', w - M(60), d - M(60), 0, M(60), M(60), h)] },
  { id: 'kids-table', name: 'Kids study table', category: 'kids', tags: ['kids', 'desk', 'study'], mount: 'floor', size: { w: 900, d: 550, h: 600 }, finish: 'white-matte', accent: 'sage', build: (d) => table(d) },
  { id: 'toy-storage', name: 'Toy storage', category: 'kids', tags: ['kids', 'storage', 'toys'], mount: 'floor', size: { w: 900, d: 350, h: 700 }, finish: 'white-matte', accent: 'sage', build: (d) => cabinet(d, { open: true, plinth: M(40) }) },

  // Storage
  { id: 'shoe-rack', name: 'Shoe rack', category: 'storage', tags: ['shoe', 'rack', 'entrance', 'india'], mount: 'floor', size: { w: 900, d: 350, h: 1000 }, finish: 'walnut', accent: 'oak-light', build: (d) => cabinet(d, { doors: 2, plinth: M(100) }) },
  { id: 'pooja-unit', name: 'Pooja unit / mandir', category: 'storage', tags: ['pooja', 'mandir', 'temple', 'prayer', 'india'], mount: 'floor', size: { w: 900, d: 450, h: 1800 }, finish: 'teak', accent: 'metal-brass', build: ({ w, d, h }) => [...cabinet({ w, d, h: M(700) }, { drawers: 1, doors: 2, plinth: M(100) }), box('backpanel', 0, 0, M(700), w, M(25), h - M(800)), box('shelf', 0, 0, M(1100), w, d - M(80), M(25)), box('arch', 0, 0, h - M(100), w, d, M(100)), box('bellL', M(80), d - M(120), h - M(300), M(40), M(40), M(200), 'accent'), box('bellR', w - M(120), d - M(120), h - M(300), M(40), M(40), M(200), 'accent')] },
  { id: 'wardrobe-loose', name: 'Freestanding wardrobe', category: 'storage', tags: ['wardrobe', 'almirah', 'cupboard'], mount: 'floor', size: { w: 1200, d: 580, h: 2000 }, finish: 'white-matte', accent: 'oak-light', build: (d) => cabinet(d, { doors: 2, plinth: M(60) }) },
  { id: 'wall-shelf', name: 'Floating shelf', category: 'storage', tags: ['shelf', 'floating', 'wall'], mount: 'wall', size: { w: 900, d: 220, h: 30, elev: 1400 }, finish: 'oak-light', accent: 'oak-light', build: ({ w, d, h }) => [box('shelf', 0, 0, 0, w, d, h)] },

  // Appliances
  { id: 'washing-machine', name: 'Washing machine, front load', category: 'appliances', tags: ['washing machine', 'washer', 'laundry'], mount: 'floor', size: { w: 600, d: 560, h: 850 }, finish: 'white-matte', accent: 'glass', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), cyl('door', w / 2 - M(160), d, h * 0.35, M(320), M(10), M(320), 'glass')] },
  { id: 'split-ac', name: 'Split AC indoor unit', category: 'appliances', tags: ['ac', 'air conditioner', 'split', 'india'], mount: 'wall', size: { w: 980, d: 230, h: 320, elev: 2150 }, finish: 'white-matte', accent: 'white-matte', build: ({ w, d, h }) => [box('body', 0, 0, 0, w, d, h), box('vent', M(30), d, M(30), w - M(60), M(5), M(30), 'dark')] },

  // Lighting
  { id: 'ceiling-fan', name: 'Ceiling fan', category: 'lighting', tags: ['fan', 'ceiling fan', 'india'], mount: 'ceiling', size: { w: 1200, d: 1200, h: 350 }, finish: 'white-matte', accent: 'metal-brass', build: ({ w, d, h }) => [cyl('rod', w / 2 - M(15), d / 2 - M(15), M(150), M(30), M(30), h - M(150), 'accent'), cyl('motor', w / 2 - M(120), d / 2 - M(120), M(60), M(240), M(240), M(110)), box('blade1', w / 2, d / 2 - M(55), M(100), w / 2, M(110), M(8)), box('blade2', 0, d / 2 - M(55), M(100), w / 2, M(110), M(8)), box('blade3', w / 2 - M(55), 0, M(100), M(110), d / 2, M(8))] },
  { id: 'pendant', name: 'Pendant light', category: 'lighting', tags: ['pendant', 'light', 'hanging'], mount: 'ceiling', size: { w: 380, d: 380, h: 900 }, finish: 'metal-brass', accent: 'metal-black', build: ({ w, d, h }) => [cyl('cord', w / 2 - M(4), d / 2 - M(4), M(250), M(8), M(8), h - M(250), 'accent'), cone('shade', 0, 0, 0, w, d, M(250))] },
  { id: 'chandelier', name: 'Chandelier', category: 'lighting', tags: ['chandelier', 'light'], mount: 'ceiling', size: { w: 800, d: 800, h: 900 }, finish: 'metal-brass', accent: 'glass', build: ({ w, d, h }) => [cyl('rod', w / 2 - M(10), d / 2 - M(10), M(450), M(20), M(20), h - M(450)), cyl('ring', 0, 0, M(300), w, d, M(40)), ball('glow', w * 0.3, d * 0.3, 0, w * 0.4, d * 0.4, M(320), 'glass')] },
  { id: 'floor-lamp', name: 'Floor lamp', category: 'lighting', tags: ['lamp', 'floor lamp', 'light'], mount: 'floor', size: { w: 400, d: 400, h: 1600 }, finish: 'fabric-beige', accent: 'metal-black', build: lamp },
  { id: 'wall-light', name: 'Wall sconce', category: 'lighting', tags: ['sconce', 'wall light'], mount: 'wall', size: { w: 180, d: 160, h: 280, elev: 1800 }, finish: 'metal-brass', accent: 'ivory', build: ({ w, d, h }) => [box('plate', w / 2 - M(40), 0, h / 2 - M(60), M(80), M(20), M(120)), cone('shade', 0, M(20), 0, w, d - M(20), h, 'soft')] },

  // Decor
  { id: 'plant-large', name: 'Floor plant', category: 'decor', tags: ['plant', 'tree', 'green'], mount: 'floor', size: { w: 600, d: 600, h: 1600 }, finish: 'terracotta-pot', accent: 'plant-green', build: plant },
  { id: 'plant-small', name: 'Table plant', category: 'decor', tags: ['plant', 'small', 'green'], mount: 'floor', size: { w: 300, d: 300, h: 450 }, finish: 'ceramic-white', accent: 'plant-green', build: plant },
  { id: 'wall-art', name: 'Wall art frame', category: 'decor', tags: ['art', 'painting', 'frame'], mount: 'wall', size: { w: 900, d: 30, h: 600, elev: 1300 }, finish: 'metal-black', accent: 'fabric-mustard', build: ({ w, d, h }) => [box('frame', 0, 0, 0, w, d, h), box('canvas', M(30), d - M(2), M(30), w - M(60), M(4), h - M(60), 'accent')] },
  { id: 'curtains', name: 'Curtains (pair)', category: 'decor', tags: ['curtain', 'drapes', 'window'], mount: 'wall', size: { w: 2000, d: 120, h: 2600, elev: 50 }, finish: 'fabric-beige', accent: 'metal-black', build: ({ w, d, h }) => [cyl('rod', 0, d / 2 - M(12), h - M(25), w, M(25), M(25), 'accent'), box('left', 0, M(20), 0, w * 0.22, d - M(20), h - M(40), 'main'), box('right', w * 0.78, M(20), 0, w * 0.22, d - M(20), h - M(40), 'main')] },
  { id: 'tall-vase', name: 'Tall vase', category: 'decor', tags: ['vase', 'decor', 'accessory'], mount: 'floor', size: { w: 250, d: 250, h: 700 }, finish: 'terracotta-pot', accent: 'terracotta-pot', build: ({ w, d, h }) => [cyl('body', 0, 0, 0, w, d, h)] },
];

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogById(id: string): CatalogDef | undefined {
  return byId.get(id);
}

export const CATALOG_CATEGORIES: { id: CatalogCategory; label: string }[] = [
  { id: 'living', label: 'Living' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'dining', label: 'Dining' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bath', label: 'Bath' },
  { id: 'storage', label: 'Storage' },
  { id: 'office', label: 'Office' },
  { id: 'kids', label: 'Kids' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'decor', label: 'Decor' },
];

/** Case-insensitive search over name and tags, optionally within a category. */
export function searchCatalog(query: string, category?: CatalogCategory | 'all'): CatalogDef[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return CATALOG.filter((c) => (!category || category === 'all' || c.category === category) && terms.every((t) => c.name.toLowerCase().includes(t) || c.tags.some((g) => g.includes(t))));
}
