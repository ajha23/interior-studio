/**
 * Generates a furnished home from a brief ("3BHK apartment", "4BHK villa"): the room programme,
 * a floor plan, doors and windows, finishes in one style, and furniture for every room.
 *
 * Plan: rooms are zoned into two bands per level (the approach of recursive/zoned subdivision in
 * ProcTHOR and squarified-treemap floor plans, kept deterministic): a private band (bedrooms and
 * baths) along the back of the plot and a public band (living, dining, kitchen, utility) along the
 * front, with a corridor between them. Rooms start from typical Indian sizes for the BHK count and
 * are widened so both bands make one rectangular footprint; a target carpet area scales them.
 * Rooms are separated by two partition thicknesses (≈230 mm walls).
 *
 * Everything inside a room is added with the domain's own commands, so collisions, doorway
 * clearances and size limits are checked exactly as for manual edits; a piece that does not fit is
 * left out and reported.
 */
import {
  createProject,
  executeCommand,
  HOME_SCHEMA_VERSION,
  ROOM_LIMITS,
  ROOM_TYPE_LABELS,
  type DesignCommand,
  type Home,
  type HomeRoom,
  type KitchenMaterial,
  type KitchenProject,
  type RoomType,
  type WallId,
} from '@/domain';

export interface HomeBrief {
  bhk: number;
  kind: 'apartment' | 'villa';
  name?: string;
  /** Wanted carpet area; rooms are scaled towards it (0.75×–1.4× of the typical sizes). */
  carpetAreaSqft?: number;
  style?: HomeStyleId;
}

export const HOME_STYLES = {
  modern: { label: 'Modern neutral', floor: ['White marble', '#e9e6df', 'marble', 0.2], wall: ['Warm white', '#f3f0e9', 'plaster', 0.9], wood: ['Natural oak', '#b98c5d', 'wood', 0.55], kitchen: ['White matte', '#f1f0eb', 'plain', 0.65], counter: ['White quartz', '#ebe9e4', 'marble', 0.25], soft: ['Stone linen', '#cfc6b8', 'fabric', 0.95] },
  warm: { label: 'Warm wood', floor: ['Oak planks', '#c7a27b', 'planks', 0.6], wall: ['Greige', '#d8d1c6', 'plaster', 0.9], wood: ['Walnut', '#6a4a34', 'wood', 0.5], kitchen: ['Sage green', '#8ea38b', 'plain', 0.6], counter: ['White quartz', '#ebe9e4', 'marble', 0.25], soft: ['Rust boucle', '#a8644a', 'fabric', 0.95] },
  japandi: { label: 'Japandi', floor: ['Pale ash planks', '#d9c4a5', 'planks', 0.6], wall: ['Rice paper', '#efe9df', 'plaster', 0.9], wood: ['Light ash', '#cdb08a', 'wood', 0.55], kitchen: ['Light ash', '#cdb08a', 'wood', 0.55], counter: ['Concrete', '#9c9a95', 'concrete', 0.75], soft: ['Oat linen', '#d8cdb9', 'fabric', 0.95] },
  industrial: { label: 'Industrial', floor: ['Polished concrete', '#a3a19c', 'concrete', 0.5], wall: ['Exposed brick', '#a35d43', 'brick', 0.85], wood: ['Smoked oak', '#5e4a3a', 'wood', 0.5], kitchen: ['Graphite', '#3b3c3f', 'plain', 0.45], counter: ['Black granite', '#27282b', 'stone', 0.3], soft: ['Cognac leather', '#8a5a3a', 'fabric', 0.6] },
} as const satisfies Record<string, Record<string, unknown>>;
export type HomeStyleId = keyof typeof HOME_STYLES;

interface RoomSpec {
  type: RoomType;
  name: string;
  width: number;
  length: number;
  /** Takes extra width when a band is widened. */
  stretch?: boolean;
  /** Keep this room's x the same on every level (the staircase). */
  anchor?: boolean;
}

const T = 115; // partition, each side
const GAP = 2 * T;
const CORRIDOR = 1200;
const HEIGHT = { apartment: 2900, villa: 3000 } as const;

const ft = (feet: number) => Math.round((feet * 304.8) / 10) * 10;
const r = (type: RoomType, name: string, wFt: number, lFt: number, extra: Partial<RoomSpec> = {}): RoomSpec => ({ type, name, width: ft(wFt), length: ft(lFt), ...extra });

/** The room programme per level, from typical Indian room sizes for the BHK count. */
export function programme(brief: HomeBrief): { private: RoomSpec[]; public: RoomSpec[] }[] {
  const n = Math.min(6, Math.max(1, Math.round(brief.bhk)));
  if (brief.kind === 'villa') {
    const upstairs = Math.max(1, n - 1);
    const level0 = {
      private: [r('bedroom', 'Guest bedroom', 11, 13, { stretch: true }), r('bathroom', 'Guest bath', 5, 8), r('pooja', 'Pooja room', 5, 5), r('staircase', 'Staircase', 8, 14, { anchor: true })],
      public: [r('living', 'Living room', 16, 18, { stretch: true }), r('dining', 'Dining', 12, 13, { stretch: true }), r('kitchen', 'Kitchen', 13, 12), r('utility', 'Utility', 5, 7)],
    };
    const level1Private: RoomSpec[] = [r('master-bedroom', 'Master bedroom', 14, 16, { stretch: true }), r('bathroom', 'Master bath', 6, 9)];
    for (let i = 2; i <= upstairs; i++) level1Private.push(r('bedroom', `Bedroom ${i}`, 12, 14, { stretch: true }), r('bathroom', `Bath ${i}`, 5, 8));
    level1Private.push(r('staircase', 'Staircase', 8, 14, { anchor: true }));
    const level1 = { private: level1Private, public: [r('family', 'Family lounge', 14, 16, { stretch: true }), r('study', 'Study', 10, 11), r('balcony', 'Balcony', 6, 12)] };
    return [level0, level1];
  }
  const big = n >= 3;
  const priv: RoomSpec[] = [r('master-bedroom', 'Master bedroom', big ? 13 : 12, big ? 15 : 14, { stretch: true }), r('bathroom', 'Master bath', 5, 8)];
  for (let i = 2; i <= n; i++) {
    priv.push(r('bedroom', `Bedroom ${i}`, big ? 11 : 10, big ? 13 : 12, { stretch: true }));
    if (big && i === 2) priv.push(r('bathroom', 'Bath 2', 5, 7));
  }
  priv.push(r('bathroom', 'Common bath', 5, 7));
  const pub: RoomSpec[] = [r('living', 'Living room', big ? 14 : 12, big ? 17 : 15, { stretch: true }), r('dining', 'Dining', big ? 11 : 10, big ? 12 : 11, { stretch: true }), r('kitchen', 'Kitchen', big ? 12 : 10, big ? 11 : 10)];
  if (n >= 2) pub.push(r('utility', 'Utility', 5, 6));
  if (n >= 3) pub.push(r('pooja', 'Pooja room', 5, 5));
  pub.push(r('balcony', 'Balcony', 5, big ? 12 : 10));
  return [{ private: priv, public: pub }];
}

const clampDim = (v: number, which: 'width' | 'length') => Math.min(ROOM_LIMITS[which].max, Math.max(ROOM_LIMITS[which].min, Math.round(v / 10) * 10));

interface Placed extends RoomSpec {
  x: number;
  z: number;
  band: 'private' | 'public';
  level: number;
}

const privDepthOf = (levels: { private: RoomSpec[] }[]) => Math.max(...levels.flatMap((l) => l.private.map((x) => x.length)));
const pubDepthOf = (levels: { public: RoomSpec[] }[]) => Math.max(...levels.flatMap((l) => l.public.map((x) => x.length)));

/** Positions every room; both bands (and all levels) share one rectangular footprint. */
export function planLevels(levels: { private: RoomSpec[]; public: RoomSpec[] }[]): { rooms: Placed[]; plot: { width: number; length: number } } {
  const rowWidth = (row: RoomSpec[]) => row.reduce((s, x) => s + x.width, 0) + GAP * (row.length - 1);
  const width = Math.max(...levels.flatMap((l) => [rowWidth(l.private), rowWidth(l.public)]));
  const privDepth = Math.max(...levels.flatMap((l) => l.private.map((x) => x.length)));
  const pubDepth = Math.max(...levels.flatMap((l) => l.public.map((x) => x.length)));
  const rooms: Placed[] = [];
  // Rooms that must line up across levels (the staircase) go first in their band.
  const ordered = (row: RoomSpec[]) => [...row.filter((x) => x.anchor), ...row.filter((x) => !x.anchor)];
  levels.forEach((level, li) => {
    for (const band of ['private', 'public'] as const) {
      const row = ordered(level[band]).map((x) => ({ ...x }));
      // A band much shorter than the footprint gets a study or store room rather than giant rooms.
      const depthOf = band === 'private' ? privDepthOf(levels) : pubDepthOf(levels);
      for (let fillers = 0; fillers < 2 && width - rowWidth(row) >= 4200; fillers++) {
        const hasStudy = levels.some((l) => [...l.private, ...l.public].some((x) => x.type === 'study')) || row.some((x) => x.type === 'study');
        row.push(hasStudy ? { type: 'store', name: 'Store', width: 1830, length: Math.min(depthOf, 2440) } : { type: 'study', name: 'Study', width: 3050, length: Math.min(depthOf, 3350), stretch: true });
      }
      // Widen stretchable rooms (at most 1.35×) towards the full footprint.
      const extra = width - rowWidth(row);
      const stretchy = row.filter((x) => x.stretch);
      const total = stretchy.reduce((s, x) => s + x.width, 0) || 1;
      for (const x of stretchy) x.width = clampDim(Math.min(x.width * 1.35, x.width + (extra * x.width) / total), 'width');
      // Bedrooms and living spaces fill the band's depth; small rooms keep their size.
      const depth = band === 'private' ? privDepth : pubDepth;
      for (const x of row) if (x.stretch) x.length = clampDim(depth, 'length');
      let cursor = 0;
      for (const x of row) {
        const z = band === 'private' ? 0 : privDepth + GAP + CORRIDOR;
        rooms.push({ ...x, x: cursor, z, band, level: li });
        cursor += x.width + GAP;
      }
      // Rounding: the last stretchable room absorbs a small remainder (what is left beyond that stays open).
      const last = [...rooms].reverse().find((x) => x.level === li && x.band === band && x.stretch);
      const end = cursor - GAP;
      if (last && end !== width && Math.abs(width - end) < 600) last.width = clampDim(last.width + width - end, 'width');
      if (last) {
        const after = rooms.filter((x) => x.level === li && x.band === band && x.x > last.x);
        let c = last.x + last.width + GAP;
        for (const x of after) {
          x.x = c;
          c += x.width + GAP;
        }
      }
    }
  });
  return { rooms, plot: { width: width + 2 * T, length: privDepth + GAP + CORRIDOR + pubDepth + 2 * T } };
}

type Palette = (typeof HOME_STYLES)[HomeStyleId];

function styleMaterials(style: Palette): KitchenMaterial[] {
  const mk = (id: string, category: KitchenMaterial['category'], [name, color, texture, roughness]: readonly [string, string, string, number], scale?: number): KitchenMaterial => ({
    id,
    name,
    category,
    color,
    roughness,
    metalness: 0,
    ...(texture !== 'plain' ? { texture: texture as KitchenMaterial['texture'], ...(scale ? { textureScale: scale } : {}) } : {}),
  });
  return [
    mk('style-floor', 'floor', style.floor, style.floor[2] === 'planks' ? 180 : 800),
    mk('style-wall', 'wall', style.wall, style.wall[2] === 'brick' ? 300 : 2000),
    mk('style-wood', 'shutter', style.wood, 600),
    mk('style-kitchen', 'shutter', style.kitchen, 600),
    mk('style-soft', 'shutter', style.soft, 150),
    mk('style-counter', 'countertop', style.counter, 1000),
    mk('style-bath-floor', 'floor', ['Matt porcelain tile', '#c9c6c0', 'tile', 0.5], 600),
    mk('style-bath-wall', 'wall', ['White wall tile', '#eceae6', 'tile', 0.3], 300),
  ];
}

/** Applies commands one by one; a command that the domain rejects is skipped and noted. */
class Builder {
  notes: string[] = [];
  constructor(
    public project: KitchenProject,
    private readonly makeId: (prefix: string) => string,
    private readonly roomName: string,
  ) {}

  /** The first affected id ('' when none), or null when the command was rejected. */
  run(command: DesignCommand, what?: string): string | null {
    const { project, result } = executeCommand(this.project, command, { newId: this.makeId });
    if (!result.success) {
      if (what) this.notes.push(`${this.roomName}: no room for the ${what} (${result.errors[0] ?? 'rejected'}).`);
      return null;
    }
    this.project = project;
    return result.affectedEntityIds[0] ?? '';
  }

  /** Adds a piece of furniture and stands it against a wall, or at a free-standing spot. */
  furniture(type: Extract<DesignCommand, { type: 'add_furniture' }>['furnitureType'], dims: { width: number; height: number; depth: number } | undefined, material: string, where: { wall: WallId; offset: number } | { x: number; z: number; rotation: 0 | 90 | 180 | 270 }, what: string): void {
    const at = 'wall' in where ? { placement: { wallId: where.wall, offset: Math.max(0, Math.round(where.offset)) } } : { at: { x: Math.round(where.x), z: Math.round(where.z), rotationY: where.rotation } };
    this.run({ type: 'add_furniture', furnitureType: type, ...(dims ? { dimensions: dims } : {}), materialId: material, ...at }, what);
  }
}

const isBath = (t: RoomType) => t === 'bathroom';

/** Doors, archways and windows for a room, from its band and its neighbours. */
function openings(b: Builder, room: Placed, all: Placed[], _isEnd: { left: boolean; right: boolean }): void {
  const { width: W, length: L } = b.project.room;
  const corridorWall: WallId = room.band === 'private' ? 'front' : 'back';
  const outsideWall: WallId = room.band === 'private' ? 'back' : 'front';
  const nb = (dir: -1 | 1) => all.find((o) => o.level === room.level && o.band === room.band && (dir === -1 ? o.x + o.width + GAP === room.x : room.x + room.width + GAP === o.x));
  const door = (wall: WallId, width: number, offset: number, kind: 'door' | 'opening' = 'door') => b.run({ type: 'add_opening', kind, wallId: wall, width, offset: Math.max(150, Math.round(offset)), ...(kind === 'opening' ? { height: 2100 } : {}) });
  const along = (wall: WallId) => (wall === 'back' || wall === 'front' ? W : L);

  switch (room.type) {
    case 'living':
    case 'family':
      // Main entrance (living, ground floor) on the outside wall; a wide opening to the corridor.
      if (room.type === 'living' && room.level === 0) door(outsideWall, 1050, 300);
      door(corridorWall, 1500, along(corridorWall) / 2 - 750, 'opening');
      break;
    case 'dining':
      door(corridorWall, 1500, along(corridorWall) / 2 - 750, 'opening');
      break;
    case 'kitchen': {
      // The kitchen run is on the corridor wall; it opens to the dining room beside it.
      const dining = nb(-1)?.type === 'dining' ? 'left' : nb(1)?.type === 'dining' ? 'right' : null;
      if (dining) door(dining as WallId, 1000, L / 2 - 500, 'opening');
      else door(room.band === 'private' ? 'front' : 'front', 900, 300);
      break;
    }
    case 'staircase':
      door(corridorWall, 1000, along(corridorWall) / 2 - 500, 'opening');
      break;
    case 'balcony':
      door(corridorWall, 900, along(corridorWall) / 2 - 450);
      break;
    default: {
      // Doors near a corner, so the walls stay free for the bed, wardrobe and fittings.
      const w = isBath(room.type) || room.type === 'pooja' || room.type === 'utility' ? 750 : 900;
      door(corridorWall, w, 100);
    }
  }
}

/**
 * Windows after the furniture, in wall spans that are still free (the centre first, then either
 * side): high and small in baths, none for stairs, stores and pooja rooms.
 */
function windows(b: Builder, room: Placed, isEnd: { left: boolean; right: boolean }): void {
  if (room.type === 'staircase' || room.type === 'store' || room.type === 'foyer' || room.type === 'pooja' || room.type === 'balcony') return;
  const { width: W, length: L } = b.project.room;
  const outsideWall: WallId = room.band === 'private' ? 'back' : 'front';
  const tryAt = (wall: WallId, length: number, width: number, height: number, sill: number) => {
    for (const at of [(length - width) / 2, 300, length - width - 300, length * 0.25 - width / 2, length * 0.75 - width / 2]) {
      if (at < 150 || at + width > length - 150) continue;
      if (b.run({ type: 'add_opening', kind: 'window', wallId: wall, width, height, sill, offset: Math.round(at) }) !== null) return true;
    }
    return false;
  };
  if (isBath(room.type)) {
    tryAt(outsideWall, W, Math.min(600, W - 400), 600, 1500);
    return;
  }
  for (const ww of [1500, 1200, 900]) if (ww <= W - 600 && tryAt(outsideWall, W, ww, 1200, room.type === 'kitchen' ? 1050 : 900)) break;
  // Corner living spaces get a second window on the end wall when it is free.
  if (room.type === 'living' || room.type === 'dining' || room.type === 'family' || room.type === 'study')
    for (const side of ['left', 'right'] as const) if (isEnd[side] && L >= 3000) tryAt(side, L, 1200, 1200, 900);
}

/** Furniture for a room by what it is for. Walls: back = outside for the private band, corridor for the public band. */
function furnish(b: Builder, room: Placed, levelHeight: number): void {
  const { width: W, length: L } = b.project.room;
  const outside: WallId = room.band === 'private' ? 'back' : 'front';
  const inner: WallId = room.band === 'private' ? 'front' : 'back';
  switch (room.type) {
    case 'master-bedroom':
    case 'bedroom': {
      const bedW = room.type === 'master-bedroom' ? (L >= 3600 ? 1800 : 1500) : L >= 3300 ? 1500 : 1200;
      const bedOffset = Math.round((L - bedW) / 2);
      // Head against the end wall (the outside wall keeps its window), a bedside table each side,
      // the wardrobe on the opposite wall; the door is in the free corner.
      b.furniture('bed', { width: bedW, height: 1000, depth: 2100 }, 'style-wood', { wall: 'right', offset: bedOffset }, 'bed');
      b.furniture('nightstand', undefined, 'style-wood', { wall: 'right', offset: bedOffset - 500 }, 'bedside table');
      b.furniture('nightstand', undefined, 'style-wood', { wall: 'right', offset: bedOffset + bedW + 50 }, 'bedside table');
      const wardW = Math.min(2400, Math.max(900, Math.floor((L - 1500) / 300) * 300));
      if (W - 2100 - 600 >= 900) b.furniture('wardrobe', { width: wardW, height: 2100, depth: 600 }, 'style-wood', { wall: 'left', offset: outside === 'back' ? 200 : L - wardW - 200 }, 'wardrobe');
      if (room.type !== 'master-bedroom' && W >= 3300) b.furniture('desk', undefined, 'style-wood', { wall: outside, offset: 700 }, 'desk');
      break;
    }
    case 'bathroom': {
      // Shower in the far corner, WC and basin along the side wall; the door (near the other corner) swings clear.
      const far = (size: number) => (outside === 'back' ? 0 : L - size);
      b.furniture('shower', { width: 900, height: 2100, depth: 800 }, 'style-wood', { wall: 'left', offset: far(900) }, 'shower');
      b.furniture('toilet', undefined, 'style-wood', { wall: 'right', offset: outside === 'back' ? 1000 : L - 1000 - 380 }, 'WC');
      b.furniture('basin', { width: 500, height: 850, depth: 450 }, 'style-wood', { wall: outside === 'back' ? 'back' : 'front', offset: W - 500 - 20 }, 'wash basin');
      break;
    }
    case 'living':
    case 'family': {
      const sofaW = L >= 4000 ? 2400 : 2000;
      b.furniture('sofa', { width: sofaW, height: 820, depth: 900 }, 'style-soft', { wall: 'left', offset: (L - sofaW) / 2 }, 'sofa');
      b.furniture('tv-unit', undefined, 'style-wood', { wall: 'right', offset: (L - 1800) / 2 }, 'TV unit');
      b.furniture('coffee-table', undefined, 'style-wood', { x: 900 + 450 + 300, z: L / 2, rotation: 90 }, 'coffee table');
      if (W >= 4200) b.furniture('armchair', undefined, 'style-soft', { x: W / 2 + 300, z: L / 2 + (outside === 'front' ? 900 : -900), rotation: outside === 'front' ? 180 : 0 }, 'armchair');
      break;
    }
    case 'dining': {
      const seats = W >= 3400 ? 6 : 4;
      const tw = seats === 6 ? 1800 : 1200;
      b.furniture('table', { width: tw, height: 750, depth: 900 }, 'style-wood', { x: W / 2, z: L / 2, rotation: 0 }, 'dining table');
      const per = seats / 2;
      for (let i = 0; i < per; i++) {
        const cx = W / 2 - tw / 2 + (tw / per) * (i + 0.5);
        b.furniture('chair', undefined, 'style-wood', { x: cx, z: L / 2 - 450 - 250, rotation: 0 }, 'chair');
        b.furniture('chair', undefined, 'style-wood', { x: cx, z: L / 2 + 450 + 250, rotation: 180 }, 'chair');
      }
      break;
    }
    case 'kitchen': {
      // A straight run on the corridor wall, fitted to its length; wall units above.
      const slots: ([('appliance'), 'fridge' | 'dishwasher' | 'range'] | ['cabinet', 'base' | 'sink' | 'drawer'])[] = [
        ['appliance', 'fridge'], ['cabinet', 'base'], ['cabinet', 'sink'], ['appliance', 'dishwasher'], ['appliance', 'range'], ['cabinet', 'drawer'], ['cabinet', 'base'],
      ];
      const widths = { fridge: 700, dishwasher: 600, range: 600, base: 600, sink: 800, drawer: 600 } as const;
      const essential = new Set(['fridge', 'sink', 'range']);
      let run = [...slots];
      const len = W - 50;
      while (run.reduce((s, [, t]) => s + widths[t], 0) > len) {
        const drop = [...run].reverse().findIndex(([, t]) => !essential.has(t));
        if (drop < 0) break;
        run = run.filter((_, i) => i !== run.length - 1 - drop);
      }
      let at = 0;
      for (const [kind, t] of run) {
        const placement = { wallId: inner, offset: at };
        if (kind === 'appliance') b.run({ type: 'add_appliance', applianceType: t, width: widths[t], placement }, t);
        else b.run({ type: 'add_cabinet', cabinetType: t, materialId: 'style-kitchen', dimensions: { width: widths[t], height: 720, depth: 560 }, placement }, `${t} cabinet`);
        if (t === 'range') b.run({ type: 'add_appliance', applianceType: 'hood', width: 600, placement: { wallId: inner, offset: at } }, 'hood');
        else if (t !== 'fridge') b.run({ type: 'add_cabinet', cabinetType: 'wall', materialId: 'style-kitchen', dimensions: { width: widths[t], height: 720, depth: 350 }, placement: { wallId: inner, offset: at } });
        at += widths[t];
      }
      b.run({ type: 'set_surface_material', surface: 'countertop', materialId: 'style-counter' });
      break;
    }
    case 'study':
      b.furniture('desk', undefined, 'style-wood', { wall: outside, offset: (W - 1200) / 2 }, 'desk');
      b.furniture('chair', undefined, 'style-wood', { x: W / 2, z: outside === 'back' ? 900 : L - 900, rotation: outside === 'back' ? 180 : 0 }, 'chair');
      b.furniture('bookshelf', undefined, 'style-wood', { wall: 'left', offset: (L - 1000) / 2 }, 'bookshelf');
      break;
    case 'pooja':
      b.run({ type: 'add_cabinet', cabinetType: 'base', materialId: 'style-wood', dimensions: { width: 600, height: 720, depth: 560 }, placement: { wallId: outside, offset: Math.max(0, (W - 600) / 2) } }, 'mandir unit');
      break;
    case 'utility':
      b.run({ type: 'add_cabinet', cabinetType: 'sink', materialId: 'style-kitchen', dimensions: { width: 800, height: 720, depth: 560 }, placement: { wallId: outside, offset: 0 } }, 'utility sink');
      break;
    case 'balcony':
      b.furniture('chair', undefined, 'style-wood', { x: W / 2 - 350, z: L / 2, rotation: 90 }, 'chair');
      b.furniture('chair', undefined, 'style-wood', { x: W / 2 + 350, z: L / 2, rotation: 270 }, 'chair');
      break;
    case 'staircase':
      // Against the back of the stair hall, leaving the landing in front of the opening clear.
      b.furniture('stairs', { width: Math.min(1100, W - 600), height: Math.min(3600, levelHeight, b.project.room.height), depth: Math.min(4200, L - 1000) }, 'style-wood', { x: W / 2, z: Math.min(4200, L - 1000) / 2 + 80, rotation: 0 }, 'staircase');
      break;
    default:
      break;
  }
}

/** A furnished home for a brief, plus notes on anything that did not fit. */
export function generateHome(brief: HomeBrief, makeId: (prefix: string) => string): { home: Home; notes: string[] } {
  const style = HOME_STYLES[brief.style ?? 'modern'];
  let levels = programme(brief);
  // Scale towards a wanted carpet area.
  if (brief.carpetAreaSqft) {
    const natural = levels.flatMap((l) => [...l.private, ...l.public]).reduce((s, x) => s + x.width * x.length, 0) / 1e6 * 10.7639;
    const k = Math.min(1.4, Math.max(0.75, Math.sqrt(brief.carpetAreaSqft / natural)));
    levels = levels.map((l) => ({ private: l.private.map((x) => ({ ...x, width: clampDim(x.width * k, 'width'), length: clampDim(x.length * k, 'length') })), public: l.public.map((x) => ({ ...x, width: clampDim(x.width * k, 'width'), length: clampDim(x.length * k, 'length') })) }));
  }
  const { rooms: placed, plot } = planLevels(levels);
  const height = HEIGHT[brief.kind];
  const floorHeight = height + 250;
  const materials = styleMaterials(style);
  const notes: string[] = [];
  const rooms: HomeRoom[] = placed.map((p, i) => {
    const id = `room-${i + 1}`;
    let design = createProject({ name: p.name, room: { width: clampDim(p.width, 'width'), length: clampDim(p.length, 'length'), height, wallThickness: T }, layout: 'empty', id: `${id}-design` }, makeId);
    for (const m of materials) design = executeCommand(design, { type: 'define_material', material: m }).project;
    const b = new Builder(design, makeId, p.name);
    b.run({ type: 'set_surface_material', surface: 'floor', materialId: isBath(p.type) ? 'style-bath-floor' : 'style-floor' });
    b.run({ type: 'set_surface_material', surface: 'wall', materialId: isBath(p.type) ? 'style-bath-wall' : 'style-wall' });
    const bandRooms = placed.filter((o) => o.level === p.level && o.band === p.band);
    const ends = { left: bandRooms[0] === p, right: bandRooms.at(-1) === p };
    openings(b, p, placed, ends);
    furnish(b, p, floorHeight);
    windows(b, p, ends);
    notes.push(...b.notes);
    return { id, name: p.name, type: p.type, level: p.level, x: p.x + T, z: p.z + T, design: b.project };
  });
  const kindLabel = brief.kind === 'villa' ? 'villa' : 'apartment';
  const n = Math.min(6, Math.max(1, Math.round(brief.bhk)));
  const home: Home = {
    schemaVersion: HOME_SCHEMA_VERSION,
    id: makeId('home'),
    name: brief.name?.trim() || `${n}BHK ${kindLabel}`,
    kind: brief.kind,
    bhk: n,
    plot,
    levels: levels.length,
    floorHeight,
    rooms,
    style: style.label,
  };
  return { home, notes };
}

export const roomTypeLabel = (t: RoomType) => ROOM_TYPE_LABELS[t];

/**
 * Applies a style to every room: the shared style finishes are redefined (so units and furniture
 * that use them change with them) and each room's floor and walls are set to the style's
 * (tiles in bathrooms).
 */
export function restyleHome(home: Home, styleId: HomeStyleId): Home {
  const style = HOME_STYLES[styleId];
  const materials = styleMaterials(style);
  const rooms = home.rooms.map((room) => {
    let design = room.design;
    for (const m of materials) design = executeCommand(design, { type: 'define_material', material: m }).project;
    const bath = isBath(room.type);
    for (const [surface, id] of [['floor', bath ? 'style-bath-floor' : 'style-floor'], ['wall', bath ? 'style-bath-wall' : 'style-wall']] as const) design = executeCommand(design, { type: 'set_surface_material', surface, materialId: id }).project;
    if (design.cabinets.length) design = executeCommand(design, { type: 'set_surface_material', surface: 'countertop', materialId: 'style-counter' }).project;
    return { ...room, design };
  });
  return { ...home, rooms, style: style.label };
}
