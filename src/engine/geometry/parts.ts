/**
 * Procedural, dimension-driven geometry for every element, as plain box parts in millimetres.
 * The renderer only maps these parts to meshes, so tests can check geometry against the domain
 * model without WebGL.
 *
 * Local frame: origin at the bottom centre of the element; x across the width, y up, z through
 * the depth with the front face at +depth/2. "Body" parts make up the element's nominal
 * width × height × depth exactly; handles, plinths and surface details sit outside it.
 *
 * Moving parts (doors, drawers, inner drawers, baskets, appliance doors) are tagged with a `mover`
 * that says how they open: a hinge about a vertical edge, a drop-down hinge about a bottom edge,
 * or a slide out of the front. The renderer animates them; `moverPose` is the shared maths.
 */
import { BACK_PANEL, fittingName, fittingSpan, insideOf, PANEL, sectionWidths } from '@/domain/furniture/interior';
import type { Fitting, Furniture, KitchenCabinet, KitchenElement } from '@/domain/schema';
import { isCabinet, isFurniture } from '@/domain/schema';

export type PartFinish = 'shutter' | 'carcass' | 'handle' | 'steel' | 'dark' | 'glass' | 'glassPane';

export interface Part {
  key: string;
  finish: PartFinish;
  body: boolean;
  /** Fronts can be made see-through to show the interior; interior parts are dividers and fittings. */
  group?: 'front' | 'interior';
  /** Id of the mover (door, drawer…) this part moves with; absent for fixed parts. */
  mover?: string;
  size: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
}

export const FRONT_THICKNESS = 18;
export const FRONT_GAP = 3;
const HANDLE_PROJECTION = 20;
const PLINTH_SETBACK = 60;
/**
 * A blind corner unit keeps 600 mm blind next to the corner (the perpendicular run's depth plus
 * clearance), so its door can open without hitting the units round the corner.
 */
const BLIND_CORNER_BLIND = 600;

export interface Mover {
  id: string;
  label: string;
  /** hinge: swings about a vertical edge · drop: folds down about its bottom edge · slide: pulls out. */
  kind: 'hinge' | 'drop' | 'slide';
  /** Point on the rotation axis (local mm); unused for slides. */
  pivot: { x: number; y: number; z: number };
  /** hinge: signed angle about +y (rad) · drop: angle about +x (rad) · slide: travel along +z (mm). */
  amount: number;
  /** Where a hand would grab it (the handle), when closed. */
  grab: { x: number; y: number; z: number };
  /** Vertical extent of the front it belongs to. */
  span: [number, number];
  /** Movers that must be open first (the doors in front of an inner drawer). */
  requires: string[];
}

export interface ElementModel {
  parts: Part[];
  movers: Mover[];
}

const DOOR_ANGLE = (100 * Math.PI) / 180;
const DROP_ANGLE = (85 * Math.PI) / 180;

export function buildModel(el: KitchenElement): ElementModel {
  return isCabinet(el) ? cabinetModel(el) : isFurniture(el) ? furnitureModel(el) : applianceModel(el.type, el.dimensions);
}

export function buildParts(el: KitchenElement): Part[] {
  return buildModel(el).parts;
}

/** Where a local point (mm) is when its mover is open by `t` (0 closed … 1 fully open). */
export function moverPoint(m: Mover, t: number, p: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  if (m.kind === 'slide') return { x: p.x, y: p.y, z: p.z + m.amount * t };
  const a = m.amount * t;
  const dx = p.x - m.pivot.x;
  const dy = p.y - m.pivot.y;
  const dz = p.z - m.pivot.z;
  if (m.kind === 'hinge') return { x: m.pivot.x + dx * Math.cos(a) + dz * Math.sin(a), y: p.y, z: m.pivot.z - dx * Math.sin(a) + dz * Math.cos(a) };
  return { x: p.x, y: m.pivot.y + dy * Math.cos(a) - dz * Math.sin(a), z: m.pivot.z + dy * Math.sin(a) + dz * Math.cos(a) };
}

const tag = (parts: Part[], mover: string): Part[] => parts.map((p) => ({ ...p, mover }));

type Dims = KitchenElement['dimensions'];

function box(key: string, finish: PartFinish, body: boolean, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, group?: Part['group']): Part {
  return {
    key,
    finish,
    body,
    ...(group ? { group } : {}),
    size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 },
    center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  };
}

/** Fronts filling [x0,x1] × [y0,y1], split into `columns` doors with shadow gaps. */
function fronts(prefix: string, d: Dims, x0: number, x1: number, y0: number, y1: number, columns: number, finish: PartFinish = 'shutter'): Part[] {
  const zf = d.depth / 2;
  const step = (x1 - x0) / columns;
  return Array.from({ length: columns }, (_, i) =>
    box(`${prefix}${i}`, finish, true, x0 + i * step + FRONT_GAP / 2, x0 + (i + 1) * step - FRONT_GAP / 2, y0 + FRONT_GAP / 2, y1 - FRONT_GAP / 2, zf - FRONT_THICKNESS, zf, 'front'),
  );
}

function vHandle(key: string, d: Dims, x: number, yCenter: number, length = 160): Part {
  const zf = d.depth / 2;
  return box(key, 'handle', false, x - 6, x + 6, yCenter - length / 2, yCenter + length / 2, zf, zf + HANDLE_PROJECTION, 'front');
}

function hHandle(key: string, d: Dims, yCenter: number, length: number): Part {
  const zf = d.depth / 2;
  return box(key, 'handle', false, -length / 2, length / 2, yCenter - 6, yCenter + 6, zf, zf + HANDLE_PROJECTION, 'front');
}

/** Handles for a band of doors: near the meeting stiles for pairs, at the free edge for singles. */
function doorHandles(prefix: string, d: Dims, columns: number, y: number, x0 = -d.width / 2, x1 = d.width / 2): Part[] {
  if (columns === 2) {
    const mid = (x0 + x1) / 2;
    return [vHandle(`${prefix}L`, d, mid - 45, y), vHandle(`${prefix}R`, d, mid + 45, y)];
  }
  return [vHandle(`${prefix}0`, d, x1 - 45, y)];
}

function cabinetModel(c: KitchenCabinet): ElementModel {
  const d = c.dimensions;
  const w = d.width;
  const h = d.height;
  const xl = -w / 2;
  const xr = w / 2;
  const zb = -d.depth / 2;
  const zf = d.depth / 2;
  const open = c.frontStyle === 'open' && c.type !== 'drawer';
  // Open units have no fronts, so the carcass runs the full depth.
  const zc = open ? zf : zf - FRONT_THICKNESS;
  const parts: Part[] = [
    box('sideL', 'carcass', true, xl, xl + PANEL, 0, h, zb, zc),
    box('sideR', 'carcass', true, xr - PANEL, xr, 0, h, zb, zc),
    box('bottom', 'carcass', true, xl + PANEL, xr - PANEL, 0, PANEL, zb, zc),
    box('top', 'carcass', true, xl + PANEL, xr - PANEL, h - PANEL, h, zb, zc),
    box('back', 'carcass', true, xl + PANEL, xr - PANEL, PANEL, h - PANEL, zb, zb + BACK_PANEL),
  ];
  const movers: Mover[] = [];
  const cols = w > 600 ? 2 : 1;
  const style = c.frontStyle;
  const bandName: Record<string, string> = { door: '', lower: 'Lower ', upper: 'Upper ' };
  /**
   * Doors over [x0,x1] × [y0,y1]: singles hinge on the left (handle on the right), pairs hinge on
   * their outer edges. `hingeRight` forces a single door to hinge on the right.
   */
  const doors = (prefix: string, x0: number, x1: number, y0: number, y1: number, n: number, handleY: number, hingeRight = false) => {
    if (open) return;
    const panels = style === 'glass' ? glassFronts(prefix, d, x0, x1, y0, y1, n) : fronts(prefix, d, x0, x1, y0, y1, n);
    const handles = hingeRight ? [vHandle(`${prefix}Handle0`, d, x0 + 45, handleY)] : doorHandles(`${prefix}Handle`, d, n, handleY, x0, x1);
    const step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const id = `${prefix}${i}`;
      const left = n === 2 ? i === 0 : !hingeRight;
      const handle = handles[n === 2 ? i : 0]!;
      parts.push(...tag(panels.filter((p) => p.key === id || (p.key.startsWith(id) && /[LRBTG]$/.test(p.key.slice(id.length)) && p.key.length === id.length + 1)), id));
      parts.push({ ...handle, mover: id });
      const side = n === 2 ? (i === 0 ? 'left ' : 'right ') : '';
      const label = `${bandName[prefix] ?? ''}${side}door`.trim();
      movers.push({
        id,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        kind: 'hinge',
        pivot: { x: left ? x0 + i * step : x0 + (i + 1) * step, y: 0, z: zf - FRONT_THICKNESS },
        amount: left ? -DOOR_ANGLE : DOOR_ANGLE,
        grab: handle.center,
        span: [y0, y1],
        requires: [],
      });
    }
  };

  switch (c.type) {
    case 'base':
    case 'sink':
      doors('door', xl, xr, 0, h, cols, h - 90);
      break;
    case 'wall':
      doors('door', xl, xr, 0, h, cols, 90);
      break;
    case 'drawer': {
      // Top to bottom: a shallow cutlery drawer, then two deep pan drawers.
      const bands = [0.22, 0.34, 0.44];
      const names = ['Top drawer', 'Middle drawer', 'Bottom drawer'];
      let top = h;
      bands.forEach((f, i) => {
        const bottom = i === bands.length - 1 ? 0 : Math.round(top - h * f);
        const id = `drawer${i}`;
        const handle = hHandle(`handle${i}`, d, top - 45, Math.min(300, w * 0.5));
        // The drawer box behind each front, hidden in the carcass until it is pulled out.
        const bx0 = xl + PANEL + 12;
        const bx1 = xr - PANEL - 12;
        const by0 = Math.max(PANEL + 4, bottom + 30);
        const by1 = top - 40;
        const bz0 = zb + BACK_PANEL + 20;
        const bz1 = zc - 2;
        parts.push(
          ...tag(fronts(`drawer${i}-`, d, xl, xr, bottom, top, 1), id),
          { ...handle, mover: id },
          ...tag(
            [
              box(`${id}base`, 'carcass', false, bx0, bx1, by0, by0 + 12, bz0, bz1, 'interior'),
              box(`${id}sideL`, 'carcass', false, bx0, bx0 + 12, by0, by1, bz0, bz1, 'interior'),
              box(`${id}sideR`, 'carcass', false, bx1 - 12, bx1, by0, by1, bz0, bz1, 'interior'),
              box(`${id}back`, 'carcass', false, bx0, bx1, by0, by1, bz0, bz0 + 12, 'interior'),
            ],
            id,
          ),
        );
        movers.push({ id, label: names[i]!, kind: 'slide', pivot: { x: 0, y: 0, z: 0 }, amount: Math.round((d.depth - FRONT_THICKNESS - BACK_PANEL) * 0.8), grab: handle.center, span: [bottom, top], requires: [] });
        top = bottom;
      });
      break;
    }
    case 'tall': {
      const split = Math.round(h * 0.6);
      doors('lower', xl, xr, 0, split, cols, split - 120);
      doors('upper', xl, xr, split, h, cols, split + 120);
      break;
    }
    case 'corner': {
      // Blind corner: the left part is hidden behind the perpendicular run, so it gets a fixed
      // carcass-finish filler; the opening door is on the right.
      const doorX = xr - Math.max(300, w - BLIND_CORNER_BLIND);
      if (!open) parts.push(...fronts('blind', d, xl, doorX, 0, h, 1, 'carcass'));
      // The opening is on the right, so its handle sits by the blind panel and it hinges on the right.
      doors('door', doorX, xr, 0, h, 1, h - 90, true);
      break;
    }
  }
  if (c.type !== 'drawer') parts.push(...interiorParts(c, zc, movers));
  // Floor units stand on a recessed plinth that fills the gap down to the floor; wall units hang free.
  if (c.type !== 'wall' && c.position.y > 0) parts.push(box('plinth', 'dark', false, xl + 2, xr - 2, -c.position.y, 0, zb, zf - PLINTH_SETBACK));
  return { parts, movers };
}

/** Glass doors: a 60 mm shutter-finish frame around a glass pane. */
function glassFronts(prefix: string, d: Dims, x0: number, x1: number, y0: number, y1: number, columns: number): Part[] {
  const zf = d.depth / 2;
  const z0 = zf - FRONT_THICKNESS;
  const step = (x1 - x0) / columns;
  const rail = 60;
  return Array.from({ length: columns }, (_, i) => {
    const a = x0 + i * step + FRONT_GAP / 2;
    const b = x0 + (i + 1) * step - FRONT_GAP / 2;
    const lo = y0 + FRONT_GAP / 2;
    const hi = y1 - FRONT_GAP / 2;
    return [
      box(`${prefix}${i}L`, 'shutter', true, a, a + rail, lo, hi, z0, zf, 'front'),
      box(`${prefix}${i}R`, 'shutter', true, b - rail, b, lo, hi, z0, zf, 'front'),
      box(`${prefix}${i}B`, 'shutter', true, a + rail, b - rail, lo, lo + rail, z0, zf, 'front'),
      box(`${prefix}${i}T`, 'shutter', true, a + rail, b - rail, hi - rail, hi, z0, zf, 'front'),
      box(`${prefix}${i}G`, 'glassPane', false, a + rail, b - rail, lo + rail, hi - rail, z0 + 6, z0 + 10, 'front'),
    ];
  }).flat();
}

/** Dividers and fittings inside the carcass, positioned from the domain interior. */
function interiorParts(c: KitchenCabinet, zc: number, movers: Mover[]): Part[] {
  const d = c.dimensions;
  const inside = insideOf(d);
  const x0 = -d.width / 2 + PANEL;
  const zb = -d.depth / 2 + BACK_PANEL;
  const zFront = zc - 2;
  const floor = PANEL;
  const sized = sectionWidths(c.interior, inside.width);
  const widths = 'widths' in sized ? sized.widths : c.interior.sections.map(() => (inside.width - (c.interior.sections.length - 1) * PANEL) / c.interior.sections.length);
  const parts: Part[] = [];
  const doors = movers.filter((m) => m.kind === 'hinge');
  /** Inner drawers and baskets slide out once every door in front of them is open. */
  const addSlider = (id: string, f: Fitting, si: number, fi: number, a: number, b: number, lo: number, hi: number, frontZ: number) => {
    const where = c.interior.sections.length > 1 ? ` (section ${si + 1})` : '';
    movers.push({
      id,
      label: `${fittingName(f)} ${fi + 1}${where}`,
      kind: 'slide',
      pivot: { x: 0, y: 0, z: 0 },
      amount: Math.round(inside.depth * 0.75),
      grab: { x: (a + b) / 2, y: (lo + hi) / 2, z: frontZ },
      span: [lo, hi],
      requires: doors.filter((m) => m.span[0] < hi && lo < m.span[1]).map((m) => m.id),
    });
  };
  let cursor = x0;
  c.interior.sections.forEach((section, si) => {
    const a = cursor;
    const b = cursor + widths[si]!;
    cursor = b + PANEL;
    if (si < c.interior.sections.length - 1) parts.push(box(`divider${si}`, 'carcass', false, b, b + PANEL, floor, floor + inside.height, zb, zFront, 'interior'));
    section.fittings.forEach((f, fi) => {
      const key = `s${si}f${fi}`;
      const [lo, hi] = fittingSpan(f).map((v) => floor + v) as [number, number];
      const zMid = (zb + zFront) / 2;
      switch (f.kind) {
        case 'shelf':
          parts.push(box(key, f.glass ? 'glassPane' : 'carcass', false, a, b, lo, hi, zb, zFront - 20, 'interior'));
          break;
        case 'rail':
          parts.push(box(key, 'handle', false, a + 10, b - 10, lo + 5, lo + 25, zMid - 10, zMid + 10, 'interior'));
          break;
        case 'drawer': {
          const t = 12;
          parts.push(
            ...tag(
              [
                box(`${key}front`, 'carcass', false, a + 4, b - 4, lo, hi - 10, zFront - 30, zFront - 14, 'interior'),
                box(`${key}base`, 'carcass', false, a + 4, b - 4, lo, lo + 8, zb + 10, zFront - 30, 'interior'),
                box(`${key}sideL`, 'carcass', false, a + 4, a + 4 + t, lo, hi - 30, zb + 10, zFront - 30, 'interior'),
                box(`${key}sideR`, 'carcass', false, b - 4 - t, b - 4, lo, hi - 30, zb + 10, zFront - 30, 'interior'),
                box(`${key}back`, 'carcass', false, a + 4, b - 4, lo, hi - 30, zb + 10, zb + 10 + t, 'interior'),
              ],
              key,
            ),
          );
          addSlider(key, f, si, fi, a, b, lo, hi, zFront - 14);
          break;
        }
        case 'plate-rack': {
          parts.push(box(`${key}tray`, 'steel', false, a + 5, b - 5, lo, lo + 8, zb + 10, zFront - 20, 'interior'));
          const pinTop = lo + 8 + Math.min(220, (hi - lo) * 0.75);
          for (let x = a + 30, i = 0; x < b - 25; x += 45, i++) {
            for (const [r, z] of [[0, zMid - 70], [1, zMid + 70]] as const) parts.push(box(`${key}pin${i}-${r}`, 'steel', false, x - 3, x + 3, lo + 8, pinTop, z - 3, z + 3, 'interior'));
          }
          break;
        }
        case 'bottle-rack': {
          const cell = 110;
          for (let x = a + cell, i = 0; x < b - 20; x += cell, i++) parts.push(box(`${key}v${i}`, 'carcass', false, x - 5, x + 5, lo, hi, zb, zFront - 20, 'interior'));
          for (let y = lo + cell, i = 0; y < hi - 20; y += cell, i++) parts.push(box(`${key}h${i}`, 'carcass', false, a, b, y - 5, y + 5, zb, zFront - 20, 'interior'));
          break;
        }
        case 'basket': {
          const wire = 4;
          const za = zb + 20;
          const zz = zFront - 10;
          parts.push(
            ...tag(
              [
                box(`${key}base`, 'steel', false, a + 10, b - 10, lo, lo + wire, za, zz, 'interior'),
                box(`${key}front`, 'steel', false, a + 10, b - 10, lo, hi, zz - wire, zz, 'interior'),
                box(`${key}back`, 'steel', false, a + 10, b - 10, lo, hi, za, za + wire, 'interior'),
                box(`${key}sideL`, 'steel', false, a + 10, a + 10 + wire, lo, hi, za, zz, 'interior'),
                box(`${key}sideR`, 'steel', false, b - 10 - wire, b - 10, lo, hi, za, zz, 'interior'),
              ],
              key,
            ),
          );
          addSlider(key, f, si, fi, a, b, lo, hi, zz);
          break;
        }
      }
    });
  });
  return parts;
}

function applianceModel(type: KitchenElement['type'], d: Dims): ElementModel {
  const w = d.width;
  const h = d.height;
  const xl = -w / 2;
  const xr = w / 2;
  const zb = -d.depth / 2;
  const zf = d.depth / 2;
  switch (type) {
    case 'fridge': {
      const split = Math.round(h * 0.35);
      const freezerHandle = vHandle('freezerHandle', d, xr - 50, split - 160, 220);
      const fridgeHandle = vHandle('fridgeHandle', d, xr - 50, split + 260, 400);
      const hinge = (id: string, label: string, handle: Part, span: [number, number]): Mover => ({
        id,
        label,
        kind: 'hinge',
        pivot: { x: xl, y: 0, z: zf - 30 },
        amount: -DOOR_ANGLE,
        grab: handle.center,
        span,
        requires: [],
      });
      return {
        parts: [
          box('body', 'steel', true, xl, xr, 0, h, zb, zf - 30),
          { ...box('freezerDoor', 'steel', true, xl + 2, xr - 2, 2, split - 2, zf - 30, zf), mover: 'freezer' },
          { ...box('fridgeDoor', 'steel', true, xl + 2, xr - 2, split + 2, h - 2, zf - 30, zf), mover: 'fridge' },
          { ...freezerHandle, mover: 'freezer' },
          { ...fridgeHandle, mover: 'fridge' },
          // Shelves inside the fridge, visible when the door opens.
          ...[0.5, 0.68, 0.84].map((f, i) => box(`fridgeShelf${i}`, 'glassPane', false, xl + 30, xr - 30, h * f, h * f + 6, zb + 40, zf - 60)),
        ],
        movers: [hinge('freezer', 'Freezer door', freezerHandle, [0, split]), hinge('fridge', 'Fridge door', fridgeHandle, [split, h])],
      };
    }
    case 'range': {
      const burners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: (sx * w) / 4, z: (sz * d.depth) / 5 })));
      const doorLo = Math.round(h * 0.1);
      const doorHi = Math.round(h * 0.66);
      const handle = hHandle('ovenHandle', d, h * 0.62, w * 0.7);
      return {
        parts: [
          box('body', 'steel', true, xl, xr, 0, h - 20, zb, zf - 20),
          box('cooktop', 'dark', true, xl, xr, h - 20, h, zb, zf),
          box('kick', 'dark', true, xl, xr, 0, doorLo, zf - 20, zf),
          box('fascia', 'steel', true, xl, xr, doorHi, h - 20, zf - 20, zf),
          { ...box('ovenDoor', 'steel', true, xl + 2, xr - 2, doorLo, doorHi, zf - 20, zf), mover: 'oven' },
          { ...box('ovenWindow', 'glass', false, xl + w * 0.15, xr - w * 0.15, h * 0.2, h * 0.55, zf, zf + 2), mover: 'oven' },
          { ...handle, mover: 'oven' },
          box('ovenCavity', 'dark', false, xl + 40, xr - 40, doorLo + 20, doorHi - 20, zb + 40, zf - 22),
          ...burners.map((b, i) => box(`burner${i}`, 'steel', false, b.x - 60, b.x + 60, h, h + 6, b.z - 60, b.z + 60)),
        ],
        movers: [{ id: 'oven', label: 'Oven door', kind: 'drop', pivot: { x: 0, y: doorLo, z: zf }, amount: DROP_ANGLE, grab: handle.center, span: [doorLo, doorHi], requires: [] }],
      };
    }
    case 'dishwasher': {
      const handle = hHandle('handle', d, h - 110, w * 0.6);
      return {
        parts: [
          box('body', 'steel', true, xl, xr, 0, h, zb, zf - FRONT_THICKNESS),
          { ...box('door', 'steel', true, xl + FRONT_GAP / 2, xr - FRONT_GAP / 2, 0, h - 70, zf - FRONT_THICKNESS, zf), mover: 'door' },
          { ...box('controls', 'dark', true, xl + FRONT_GAP / 2, xr - FRONT_GAP / 2, h - 68, h, zf - FRONT_THICKNESS, zf), mover: 'door' },
          { ...handle, mover: 'door' },
          // Racks inside, seen when the door folds down.
          box('lowerRack', 'handle', false, xl + 40, xr - 40, 120, 130, zb + 40, zf - 40),
          box('upperRack', 'handle', false, xl + 40, xr - 40, h * 0.55, h * 0.55 + 10, zb + 40, zf - 40),
        ],
        movers: [{ id: 'door', label: 'Dishwasher door', kind: 'drop', pivot: { x: 0, y: 0, z: zf }, amount: DROP_ANGLE, grab: handle.center, span: [0, h], requires: [] }],
      };
    }
    case 'hood': {
      const chimneyW = Math.min(300, w * 0.5);
      return {
        parts: [box('canopy', 'steel', true, xl, xr, 0, 120, zb, zf), box('chimney', 'steel', true, -chimneyW / 2, chimneyW / 2, 120, h, zb, zb + 250)],
        movers: [],
      };
    }
    default:
      return { parts: [box('body', 'steel', true, xl, xr, 0, h, zb, zf)], movers: [] };
  }
}

/** Loose furniture in its finish ("shutter" parts use the piece's material); legs are dark. */
function furnitureModel(f: Furniture): ElementModel {
  const { width: w, height: h, depth: d } = f.dimensions;
  const xl = -w / 2;
  const xr = w / 2;
  const zb = -d / 2;
  const zf = d / 2;
  const leg = 45;
  const legs = (top: number, inset: number) =>
    [
      [xl + inset, zb + inset],
      [xr - inset - leg, zb + inset],
      [xl + inset, zf - inset - leg],
      [xr - inset - leg, zf - inset - leg],
    ].map(([x, z], i) => box(`leg${i}`, 'dark', true, x!, x! + leg, 0, top, z!, z! + leg));
  switch (f.type) {
    case 'table':
      return { parts: [box('top', 'shutter', true, xl, xr, h - 30, h, zb, zf), ...legs(h - 30, 60)], movers: [] };
    case 'chair': {
      const seat = 450;
      return {
        parts: [
          box('seat', 'shutter', true, xl, xr, seat - 40, seat, zb, zf),
          ...legs(seat - 40, 20),
          box('back', 'shutter', true, xl, xr, seat, h, zb, zb + 30),
        ],
        movers: [],
      };
    }
    case 'sofa': {
      const arm = Math.min(180, w * 0.12);
      const seat = 420;
      return {
        parts: [
          box('base', 'shutter', true, xl, xr, 60, seat - 120, zb, zf),
          box('cushions', 'shutter', true, xl + arm, xr - arm, seat - 120, seat, zb + 200, zf),
          box('backrest', 'shutter', true, xl, xr, seat - 120, h, zb, zb + 200),
          box('armL', 'shutter', true, xl, xl + arm, seat - 120, 620, zb + 200, zf),
          box('armR', 'shutter', true, xr - arm, xr, seat - 120, 620, zb + 200, zf),
          ...[
            [xl + 40, zb + 40],
            [xr - 80, zb + 40],
            [xl + 40, zf - 80],
            [xr - 80, zf - 80],
          ].map(([x, z], i) => box(`foot${i}`, 'dark', true, x!, x! + 40, 0, 60, z!, z! + 40)),
        ],
        movers: [],
      };
    }
  }
}
