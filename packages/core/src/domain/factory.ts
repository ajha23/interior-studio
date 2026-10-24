import { DEFAULT_RULE_PACK } from './catalog';
import { SCHEMA_VERSION, type DecorKind, type DecorItem, type FurnitureItem, type Opening, type Plan, type Project, type ProjectCore, type RoomInfo, type TvUnitItem, type BaseCabinetItem, type BaseCabinetParams, type WallCabinetItem, type WallCabinetParams, type TallCabinetItem, type TallCabinetParams, type Wall, type WallSideSign, type WardrobeItem } from './types';
import { mm } from './units';
import { BASECABINET_TEMPLATE_VERSION, DEFAULT_BASE_CABINET, DEFAULT_TALL_CABINET, DEFAULT_WALL_CABINET, TALLCABINET_TEMPLATE_VERSION, WALLCABINET_TEMPLATE_VERSION, TVUNIT_TEMPLATE_VERSION, WARDROBE_TEMPLATE_VERSION } from '../furniture';

export function uid(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36).slice(-4)}${r}`;
}

export function newWardrobe(x = mm(1200), y = mm(300)): WardrobeItem {
  return {
    id: uid('wr'),
    kind: 'wardrobe',
    name: 'Wardrobe',
    xUm: x,
    yUm: y,
    rotDeg: 0,
    templateVersion: WARDROBE_TEMPLATE_VERSION,
    rulePackVersion: DEFAULT_RULE_PACK.version,
    params: { widthUm: mm(2400), heightUm: mm(2400), depthUm: mm(600), modules: ['hanging', 'drawers', 'shelves', 'hanging'], shelvesPerModule: 4, drawersPerModule: 3, shutterCount: 4 },
    materials: { carcass: 'white-matte', shutter: 'oak-light' },
  };
}

export function newTvUnit(x = mm(1200), y = mm(200)): TvUnitItem {
  return {
    id: uid('tv'),
    kind: 'tvunit',
    name: 'TV unit',
    xUm: x,
    yUm: y,
    rotDeg: 0,
    templateVersion: TVUNIT_TEMPLATE_VERSION,
    rulePackVersion: DEFAULT_RULE_PACK.version,
    params: { widthUm: mm(1800), heightUm: mm(400), depthUm: mm(400), mountHeightUm: mm(250), modules: ['flap', 'open', 'drawer'], wallPanelHeightUm: mm(1200) },
    materials: { carcass: 'white-matte', shutter: 'walnut' },
  };
}

/** Kitchen base unit. `preset` picks a door or drawer front; width defaults to 600 mm. */
export function newBaseCabinet(x = mm(1200), y = mm(300), patch: Partial<BaseCabinetParams> = {}): BaseCabinetItem {
  const params = { ...DEFAULT_BASE_CABINET, ...patch };
  return {
    id: uid('bc'),
    kind: 'basecabinet',
    name: params.front === 'drawers' ? 'Drawer base unit' : 'Base cabinet',
    xUm: x,
    yUm: y,
    rotDeg: 0,
    templateVersion: BASECABINET_TEMPLATE_VERSION,
    rulePackVersion: DEFAULT_RULE_PACK.version,
    params,
    materials: { carcass: 'white-matte', shutter: 'sage', worktop: 'granite-black' },
  };
}

export function newWallCabinet(x = mm(1200), y = mm(200), patch: Partial<WallCabinetParams> = {}): WallCabinetItem {
  const params = { ...DEFAULT_WALL_CABINET, ...patch };
  return {
    id: uid('wc'),
    kind: 'wallcabinet',
    name: params.front === 'open' ? 'Open wall shelf' : params.front === 'flap' ? 'Wall unit (flap)' : 'Wall cabinet',
    xUm: x,
    yUm: y,
    rotDeg: 0,
    templateVersion: WALLCABINET_TEMPLATE_VERSION,
    rulePackVersion: DEFAULT_RULE_PACK.version,
    params,
    materials: { carcass: 'white-matte', shutter: 'ivory' },
  };
}

export function newTallCabinet(x = mm(1200), y = mm(300), patch: Partial<TallCabinetParams> = {}): TallCabinetItem {
  const params = { ...DEFAULT_TALL_CABINET, ...patch };
  return {
    id: uid('tc'),
    kind: 'tallcabinet',
    name: 'Tall pantry unit',
    xUm: x,
    yUm: y,
    rotDeg: 0,
    templateVersion: TALLCABINET_TEMPLATE_VERSION,
    rulePackVersion: DEFAULT_RULE_PACK.version,
    params,
    materials: { carcass: 'white-matte', shutter: 'sage' },
  };
}

const DECOR_DEFAULTS: Record<DecorKind, { name: string; w: number; d: number; h: number; color: string }> = {
  bed: { name: 'Queen bed', w: 1600, d: 2100, h: 1000, color: '#8b6b52' },
  sofa: { name: '3-seat sofa', w: 2100, d: 900, h: 820, color: '#7d8a83' },
  table: { name: 'Dining table', w: 1500, d: 900, h: 750, color: '#a07a55' },
  'side-table': { name: 'Bedside table', w: 450, d: 400, h: 500, color: '#a07a55' },
  box: { name: 'Box', w: 600, d: 600, h: 600, color: '#b9b2a6' },
};

export function newDecor(kind: DecorKind, x: number, y: number): DecorItem {
  const d = DECOR_DEFAULTS[kind];
  return { id: uid(kind), kind, name: d.name, xUm: x, yUm: y, rotDeg: 0, params: { widthUm: mm(d.w), depthUm: mm(d.d), heightUm: mm(d.h), color: d.color } };
}

export const DEFAULT_WALL_THICKNESS = mm(230);
export const DEFAULT_CEILING = mm(2800);

/**
 * Four walls enclosing a rectangular clear floor `w × d` whose inside north-west corner is (x0, y0).
 * Walls run N (west→east), E (north→south), S (east→west), W (south→north) so they form one loop.
 */
export function rectWalls(x0: number, y0: number, w: number, d: number, thicknessUm = DEFAULT_WALL_THICKNESS, heightUm = DEFAULT_CEILING): Wall[] {
  const h = thicknessUm / 2;
  const nw = { x: x0 - h, y: y0 - h };
  const ne = { x: x0 + w + h, y: y0 - h };
  const se = { x: x0 + w + h, y: y0 + d + h };
  const sw = { x: x0 - h, y: y0 + d + h };
  const mk = (a: { x: number; y: number }, b: { x: number; y: number }): Wall => ({ id: uid('wall'), a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) }, thicknessUm, heightUm });
  return [mk(nw, ne), mk(ne, se), mk(se, sw), mk(sw, nw)];
}

export function newRoomInfo(name: string, seed: { x: number; y: number }, ceilingUm = DEFAULT_CEILING): RoomInfo {
  return { id: uid('room'), name, seed: { x: Math.round(seed.x), y: Math.round(seed.y) }, ceilingUm, floorFinish: 'oak-floor', wallColor: 'warm-white' };
}

export function emptyPlan(): Plan {
  return { walls: [], rooms: [], source: 'site_measured', defaultWallThicknessUm: DEFAULT_WALL_THICKNESS, defaultCeilingUm: DEFAULT_CEILING };
}

export function newOpening(kind: 'door' | 'window', wallId: string, offsetUm: number, side: WallSideSign): Opening {
  return kind === 'door'
    ? { id: uid('door'), kind, wallId, offsetUm: Math.round(offsetUm), widthUm: mm(900), heightUm: mm(2100), sillUm: 0, hinge: 'start', side }
    : { id: uid('win'), kind, wallId, offsetUm: Math.round(offsetUm), widthUm: mm(1500), heightUm: mm(1350), sillUm: mm(900), hinge: 'start', side };
}

/** A plan with one rectangular room, its inside corner at the origin. */
export function singleRoomPlan(name: string, w: number, d: number): { plan: Plan; walls: Wall[] } {
  const walls = rectWalls(0, 0, w, d);
  return { plan: { ...emptyPlan(), walls, rooms: [newRoomInfo(name, { x: w / 2, y: d / 2 })] }, walls };
}

export function sampleProject(): Project {
  const now = new Date().toISOString();
  const wardrobe = newWardrobe(mm(1200), mm(300));
  const bed = newDecor('bed', mm(2200), mm(2150));
  const furniture: FurnitureItem[] = [wardrobe];
  // Bed headboard against the east wall: rotate so its back faces east.
  bed.rotDeg = 90;
  bed.xUm = mm(3600) - mm(1050);
  bed.yUm = mm(2000);
  furniture.push(bed);
  const nightstand = newDecor('side-table', mm(3600) - mm(200), mm(975));
  nightstand.rotDeg = 90;
  furniture.push(nightstand);
  const { plan, walls } = singleRoomPlan('Master bedroom', mm(3600), mm(3200));
  const [, , south, west] = walls;
  const h = DEFAULT_WALL_THICKNESS / 2;
  // South wall runs east→west and west wall south→north (see rectWalls); the room is on side +1 of both.
  const door = newOpening('door', south.id, mm(3600) + h - mm(150) - mm(900), 1);
  door.hinge = 'end';
  const win = { ...newOpening('window', west.id, mm(3200) + h - mm(1200) - mm(1200), 1), widthUm: mm(1200) };
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    name: 'Sample Residence — Master Bedroom',
    client: 'Mehta family',
    createdAt: now,
    updatedAt: now,
    plan,
    openings: [door, win],
    furniture,
    rulePack: DEFAULT_RULE_PACK,
    revisions: [],
  };
}

export function blankProject(name: string, client: string): Project {
  const now = new Date().toISOString();
  const { plan, walls } = singleRoomPlan('Room 1', mm(3600), mm(3200));
  const h = DEFAULT_WALL_THICKNESS / 2;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    name,
    client,
    createdAt: now,
    updatedAt: now,
    plan,
    openings: [newOpening('door', walls[2].id, h + mm(200), 1)],
    furniture: [],
    rulePack: DEFAULT_RULE_PACK,
    revisions: [],
  };
}

export function coreOf(p: Project): ProjectCore {
  return { plan: p.plan, openings: p.openings, furniture: p.furniture, rulePack: p.rulePack };
}

/** Stable SHA-256 of a project core, used to fingerprint issued revisions. */
export async function hashCore(core: ProjectCore): Promise<string> {
  const json = stableStringify(core);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
