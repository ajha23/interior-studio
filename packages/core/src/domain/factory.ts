import { DEFAULT_RULE_PACK } from './catalog';
import { SCHEMA_VERSION, type DecorKind, type DecorItem, type FurnitureItem, type Opening, type Project, type ProjectCore, type TvUnitItem, type WardrobeItem } from './types';
import { mm } from './units';
import { TVUNIT_TEMPLATE_VERSION, WARDROBE_TEMPLATE_VERSION } from '../furniture';

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

export function newOpening(kind: 'door' | 'window'): Opening {
  return kind === 'door'
    ? { id: uid('door'), kind, wall: 'S', offsetUm: mm(200), widthUm: mm(900), heightUm: mm(2100), sillUm: 0, hinge: 'start' }
    : { id: uid('win'), kind, wall: 'E', offsetUm: mm(800), widthUm: mm(1500), heightUm: mm(1350), sillUm: mm(900), hinge: 'start' };
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
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    name: 'Sample Residence — Master Bedroom',
    client: 'Mehta family',
    createdAt: now,
    updatedAt: now,
    room: { name: 'Master bedroom', widthUm: mm(3600), depthUm: mm(3200), ceilingUm: mm(2800), wallThicknessUm: mm(230), source: 'site_measured', floorFinish: 'oak-floor', wallColor: 'warm-white' },
    openings: [
      { id: uid('door'), kind: 'door', wall: 'S', offsetUm: mm(150), widthUm: mm(900), heightUm: mm(2100), sillUm: 0, hinge: 'start' },
      { id: uid('win'), kind: 'window', wall: 'W', offsetUm: mm(1200), widthUm: mm(1200), heightUm: mm(1350), sillUm: mm(900), hinge: 'start' },
    ],
    furniture,
    rulePack: DEFAULT_RULE_PACK,
    revisions: [],
  };
}

export function blankProject(name: string, client: string): Project {
  const p = sampleProject();
  return { ...p, id: uid('prj'), name, client, furniture: [], openings: [{ ...newOpening('door') }], room: { ...p.room, name: 'Room 1' } };
}

export function coreOf(p: Project): ProjectCore {
  return { room: p.room, openings: p.openings, furniture: p.furniture, rulePack: p.rulePack };
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
