/**
 * Cut list, glass, worktops and hardware, derived from the same procedural parts as the 3D model
 * (so what is cut is what is drawn). Panel sizes are each part's two largest dimensions; the
 * smallest is the thickness. Construction rules are illustrative and must be checked by the
 * workshop before cutting.
 */
import { computeBom, isCabinet, type KitchenCabinet, type KitchenProject } from '@/domain';
import { buildModel, type Part } from '../geometry/parts';
import { orderUnits, unitRefs } from './schedule';

export interface PanelRow {
  part: string;
  material: string;
  thickness: number;
  length: number;
  width: number;
  qty: number;
  /** Edges to band, e.g. "1 long" or "all 4". */
  banding: string;
  units: string[];
}

export interface HardwareRow {
  item: string;
  qty: number;
  note: string;
  units: string[];
}

export interface CutList {
  panels: PanelRow[];
  glass: PanelRow[];
  worktops: { wall: string; length: number; depth: number; thickness: number; finish: string }[];
  hardware: HardwareRow[];
  /** Full 2440 × 1220 boards per material and thickness, with 15 % for saw cuts and offcuts. */
  boards: { material: string; thickness: number; area: number; boards: number }[];
  bandingMetres: number;
}

export const BOARD = { length: 2440, width: 1220 };
const WASTE = 1.15;

function partName(c: KitchenCabinet, p: Part): string | null {
  const k = p.key;
  if (p.finish === 'handle' || p.finish === 'steel') return null;
  if (k === 'plinth') return 'Plinth';
  if (k === 'sideL' || k === 'sideR') return 'Side';
  if (k === 'top') return 'Top';
  if (k === 'bottom') return 'Bottom';
  if (k === 'back') return 'Back';
  if (k.startsWith('divider')) return 'Divider';
  if (k.startsWith('blind')) return 'Blind panel';
  if (/^s\d+f\d+$/.test(k)) return p.finish === 'glassPane' ? 'Glass shelf' : 'Shelf';
  if (/^s\d+f\d+(v|h)\d+$/.test(k)) return 'Bottle rack slat';
  if (/^s\d+f\d+front$/.test(k)) return 'Inner drawer front';
  if (/^(s\d+f\d+|drawer\d+)(base|sideL|sideR|back)$/.test(k)) return 'Drawer box';
  if (p.finish === 'glassPane') return 'Door glass';
  if (k.startsWith('drawer')) return 'Drawer front';
  if (p.group === 'front') return c.frontStyle === 'glass' && /[LRBT]$/.test(k) ? 'Glass door frame' : 'Door';
  return 'Panel';
}

function banding(name: string): string {
  if (['Door', 'Drawer front', 'Glass door frame', 'Blind panel'].includes(name)) return 'all 4';
  if (['Side', 'Top', 'Bottom', 'Shelf', 'Divider', 'Plinth'].includes(name)) return '1 long';
  return '—';
}

function bandingLength(row: PanelRow): number {
  if (row.banding === 'all 4') return 2 * (row.length + row.width) * row.qty;
  if (row.banding === '1 long') return row.length * row.qty;
  return 0;
}

const hingesFor = (doorHeight: number) => (doorHeight <= 900 ? 2 : doorHeight <= 1500 ? 3 : 4);

/** `include` limits the list to some cabinets (e.g. those with verified construction rules). */
export function cutList(project: KitchenProject, include: (c: KitchenCabinet) => boolean = () => true): CutList {
  const refs = unitRefs(project);
  const groups = new Map<string, PanelRow>();
  const glassGroups = new Map<string, PanelRow>();
  const hardware = new Map<string, HardwareRow>();
  const addHardware = (item: string, qty: number, note: string, ref: string) => {
    const row = hardware.get(item) ?? { item, qty: 0, note, units: [] };
    row.qty += qty;
    if (!row.units.includes(ref)) row.units.push(ref);
    hardware.set(item, row);
  };

  for (const el of orderUnits(project)) {
    if (!isCabinet(el) || !include(el)) continue;
    const ref = refs.get(el.id)!;
    const { parts, movers } = buildModel(el);
    for (const p of parts) {
      const name = partName(el, p);
      if (!name) continue;
      // The 3D plinth is a solid block; what is cut is an 18 mm kickboard across the front.
      const [length, width, thickness] = (name === 'Plinth' ? [p.size.x, p.size.y, 18] : [p.size.x, p.size.y, p.size.z].sort((a, b) => b - a)).map((v) => Math.round(v)) as [number, number, number];
      const material =
        name === 'Plinth' ? 'Plinth board'
        : p.finish === 'shutter' ? (project.materials[el.materialId]?.name ?? 'Shutter')
        : p.finish === 'glassPane' ? 'Toughened glass'
        : (project.materials[project.surfaces.carcass]?.name ?? 'Carcass board');
      const target = p.finish === 'glassPane' ? glassGroups : groups;
      const key = `${name}|${material}|${thickness}|${length}|${width}`;
      const row = target.get(key) ?? { part: name, material, thickness, length, width, qty: 0, banding: p.finish === 'glassPane' ? '—' : banding(name), units: [] };
      row.qty += 1;
      if (!row.units.includes(ref)) row.units.push(ref);
      target.set(key, row);
    }
    // Hardware from the moving parts and fittings.
    for (const m of movers) {
      if (m.kind === 'hinge') addHardware('Concealed hinge', hingesFor(m.span[1] - m.span[0]), '2 per door up to 900 mm, 3 up to 1500 mm, 4 above', ref);
      if (m.kind === 'slide' && (m.id.startsWith('drawer') || /^s\d+f\d+$/.test(m.id))) {
        const isBasket = el.interior.sections.some((s, si) => s.fittings.some((f, fi) => `s${si}f${fi}` === m.id && f.kind === 'basket'));
        addHardware(isBasket ? 'Pull-out basket with runners' : 'Drawer runners (pair)', 1, isBasket ? 'Wire basket, full-extension' : 'Full-extension, soft close', ref);
      }
    }
    const handles = parts.filter((p) => p.finish === 'handle' && p.group === 'front').length;
    if (handles) addHardware('Handle', handles, 'Bar handle', ref);
    for (const section of el.interior.sections) {
      for (const f of section.fittings) {
        if (f.kind === 'shelf') addHardware(f.glass ? 'Glass shelf support' : 'Shelf support', 4, '4 per shelf', ref);
        if (f.kind === 'rail') addHardware('Hanging rail with end supports', 1, 'Cut to section width', ref);
        if (f.kind === 'plate-rack') addHardware('Plate rack insert', 1, 'Steel', ref);
        if (f.kind === 'bottle-rack') addHardware('Bottle rack', 1, 'Built from slats (see panels)', ref);
      }
    }
    if (el.type !== 'wall' && el.position.y > 0) addHardware('Adjustable leg', el.dimensions.width > 900 ? 6 : 4, '4 per unit, 6 over 900 mm wide', ref);
    if (el.type === 'wall') addHardware('Wall hanging bracket', 2, '2 per wall unit', ref);
  }

  const panels = [...groups.values()];
  const area = new Map<string, { material: string; thickness: number; area: number }>();
  for (const r of panels) {
    const key = `${r.material}|${r.thickness}`;
    const a = area.get(key) ?? { material: r.material, thickness: r.thickness, area: 0 };
    a.area += (r.length * r.width * r.qty) / 1e6;
    area.set(key, a);
  }
  const boardArea = (BOARD.length * BOARD.width) / 1e6;
  return {
    panels,
    glass: [...glassGroups.values()],
    worktops: computeBom(project).countertops.map((c) => ({ wall: c.wall, length: c.length, depth: c.depth, thickness: c.thickness, finish: c.finish })),
    hardware: [...hardware.values()],
    boards: [...area.values()].map((a) => ({ ...a, area: Math.round(a.area * 100) / 100, boards: Math.ceil((a.area * WASTE) / boardArea) })),
    bandingMetres: Math.round(panels.reduce((s, r) => s + bandingLength(r), 0) / 100) / 10,
  };
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** One line per panel group (glass included), for the workshop's cutting software or a spreadsheet. */
export function cutListCsv(list: CutList): string {
  const header = ['Part', 'Material', 'Thickness (mm)', 'Length (mm)', 'Width (mm)', 'Qty', 'Edge banding', 'Units'];
  const rows = [...list.panels, ...list.glass].map((r) => [r.part, r.material, r.thickness, r.length, r.width, r.qty, r.banding, r.units.join(' ')]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
