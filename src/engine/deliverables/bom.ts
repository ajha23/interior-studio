/**
 * Bill of materials from the modelled geometry and the chosen construction rules. Each line says
 * whether its quantity is calculated (exact for the model and rules) or estimated (boards with a
 * waste allowance, costs), and how. Cabinets without verified rules are left out and listed, so a
 * partial BOM is never presented as complete.
 *
 * Shared parts are not double-counted: worktops are one slab per run (not per cabinet); hardware is
 * totalled per item. This rule set builds every cabinet as its own box, so neighbouring cabinets
 * each have two sides by design (stated on the BOM).
 */
import { allElements, computeBom, isCabinet, isFurniture, spanAlongWall, specOf, WALL_LABEL, WALLS, type KitchenProject } from '@/domain';
import { cutList, type CutList } from '../production/cutlist';
import { unitRefs } from '../production/schedule';
import { constructionOf, type ConstructionRules } from './construction';

export type BomCategory = 'carcass' | 'back' | 'shelf' | 'front' | 'drawer box' | 'kickboard' | 'filler' | 'glass' | 'worktop' | 'edge banding' | 'board' | 'hardware' | 'appliance' | 'furniture';

export interface BomLine {
  key: string;
  category: BomCategory;
  item: string;
  material: string;
  thickness: number | null;
  length: number | null;
  width: number | null;
  qty: number;
  uom: 'pcs' | 'm' | 'm²' | 'sheets' | 'sets';
  basis: 'calculated' | 'estimated';
  formula: string;
  refs: string[];
  unitCost: number | null;
  cost: number | null;
}

export interface Bom {
  lines: BomLine[];
  rules: ConstructionRules | null;
  /** Cabinets left out (no verified rules), by reference. */
  excluded: { ref: string; id: string; reason: string }[];
  assumptions: string[];
  currency: string | null;
  totalCost: number | null;
  /** True when every cabinet is covered by verified rules and a construction method is chosen. */
  complete: boolean;
}

const CATEGORY: Record<string, BomCategory> = {
  Side: 'carcass',
  Top: 'carcass',
  Bottom: 'carcass',
  Divider: 'carcass',
  'Blind panel': 'carcass',
  Back: 'back',
  Shelf: 'shelf',
  'Glass shelf': 'glass',
  Door: 'front',
  'Drawer front': 'front',
  'Glass door frame': 'front',
  'Inner drawer front': 'front',
  'Drawer box': 'drawer box',
  Plinth: 'kickboard',
  'Bottle rack slat': 'shelf',
  'Door glass': 'glass',
};

export function buildBom(project: KitchenProject): Bom {
  const rules = constructionOf(project.production.constructionId);
  const refs = unitRefs(project);
  const prices = project.production.prices;
  const cabinets = project.cabinets;
  const covered = (type: string) => !!rules && rules.verified.includes(type as never);
  const excluded = cabinets.filter((c) => !covered(c.type)).map((c) => ({ ref: refs.get(c.id) ?? c.id, id: c.id, reason: !rules ? 'No construction method chosen.' : (rules.unsupported[c.type] ?? `No cut-list rules for ${c.type} units.`) }));
  const lines: BomLine[] = [];
  const assumptions: string[] = [];
  const list: CutList | null = rules ? cutList(project, (c) => covered(c.type)) : null;

  if (list && rules) {
    for (const r of [...list.panels, ...list.glass]) {
      const category = CATEGORY[r.part] ?? 'carcass';
      lines.push({
        key: `${r.part}|${r.material}|${r.thickness}|${r.length}|${r.width}`,
        category: r.part === 'Plinth' ? 'kickboard' : category,
        item: r.part === 'Plinth' ? 'Kickboard' : r.part,
        material: r.material,
        thickness: r.thickness,
        length: r.length,
        width: r.width,
        qty: r.qty,
        uom: 'pcs',
        basis: 'calculated',
        formula: 'From the unit geometry and the rule set (part sizes as built in the 3D model).',
        refs: r.units,
        unitCost: null,
        cost: null,
      });
    }
    // Fillers: gaps of up to 150 mm between floor units, or to the wall end, on runs with units.
    for (const f of fillers(project)) lines.push({ key: `filler|${f.wall}|${f.at}`, category: 'filler', item: `Filler (${WALL_LABEL[f.wall].toLowerCase()} @ ${f.at})`, material: project.materials[f.materialId]?.name ?? 'Shutter', thickness: rules.frontThickness, length: f.height, width: f.width, qty: 1, uom: 'pcs', basis: 'calculated', formula: 'Gap between adjacent units (or unit and wall) of 1–150 mm × unit carcass height.', refs: f.refs, unitCost: null, cost: null });
    if (rules.edgeBanding) {
      lines.push({ key: 'banding', category: 'edge banding', item: `Edge banding ${rules.edgeBanding.thickness} mm`, material: 'Matching', thickness: rules.edgeBanding.thickness, length: null, width: null, qty: list.bandingMetres, uom: 'm', basis: 'calculated', formula: 'Fronts: all 4 edges; carcass panels, shelves and dividers: 1 long edge.', refs: [], unitCost: prices?.bandingPerM ?? null, cost: prices?.bandingPerM !== undefined ? round2(list.bandingMetres * prices.bandingPerM) : null });
    }
    const waste = project.production.wastePercent;
    if (waste === undefined) assumptions.push(`Board counts use no waste allowance because none is configured (the rule set suggests ${rules.defaultWastePercent} %).`);
    const boardArea = (rules.board.length * rules.board.width) / 1e6;
    for (const b of list.boards) {
      const sheets = Math.ceil((b.area * (1 + (waste ?? 0) / 100)) / boardArea);
      lines.push({ key: `board|${b.material}|${b.thickness}`, category: 'board', item: `${b.material} board ${rules.board.length} × ${rules.board.width}`, material: b.material, thickness: b.thickness, length: rules.board.length, width: rules.board.width, qty: sheets, uom: 'sheets', basis: 'estimated', formula: `ceil(${b.area} m² of panels × (1 + ${waste ?? 0} % waste) ÷ ${round2(boardArea)} m² per board); no nesting optimisation.`, refs: [], unitCost: prices?.boardPerM2 !== undefined ? round2(prices.boardPerM2 * boardArea) : null, cost: prices?.boardPerM2 !== undefined ? round2(sheets * boardArea * prices.boardPerM2) : null });
    }
    for (const h of list.hardware) {
      const product = h.item.includes('hinge') ? project.production.hinge : h.item.includes('runner') ? project.production.drawerRunner : h.item === 'Handle' ? project.production.handle : undefined;
      lines.push({ key: `hw|${h.item}`, category: 'hardware', item: product ? `${h.item}: ${product}` : `${h.item} (product not specified)`, material: '—', thickness: null, length: null, width: null, qty: h.qty, uom: h.item.includes('(pair)') ? 'sets' : 'pcs', basis: 'calculated', formula: h.note, refs: h.units, unitCost: null, cost: null });
    }
    assumptions.push(rules.description, rules.joinery, 'Each cabinet is its own box: neighbouring cabinets each have two sides; kickboards are listed per cabinet width.', 'End panels and decorative panels are not modelled and are not listed.');
  }

  // Worktops: one slab per run (shared by the cabinets under it).
  for (const w of computeBom(project).countertops) {
    lines.push({ key: `worktop|${w.id}`, category: 'worktop', item: `Worktop (${w.wall})`, material: w.finish, thickness: w.thickness, length: w.length, width: w.depth, qty: 1, uom: 'pcs', basis: 'calculated', formula: 'One slab per run of touching units: run length + overhangs, deepest unit + 20 mm.', refs: [], unitCost: prices?.worktopPerM ?? null, cost: prices?.worktopPerM !== undefined ? round2((w.length / 1000) * prices.worktopPerM) : null });
  }
  for (const a of project.appliances) lines.push({ key: `app|${a.id}`, category: 'appliance', item: `${specOf(a).label} ${a.dimensions.width} (model not specified)`, material: '—', thickness: null, length: null, width: null, qty: 1, uom: 'pcs', basis: 'calculated', formula: 'Bought in.', refs: [refs.get(a.id) ?? a.id], unitCost: null, cost: null });
  for (const f of project.furniture) lines.push({ key: `fur|${f.id}`, category: 'furniture', item: `${specOf(f).label} ${f.dimensions.width} × ${f.dimensions.depth}`, material: project.materials[f.materialId]?.name ?? f.materialId, thickness: null, length: null, width: null, qty: 1, uom: 'pcs', basis: 'calculated', formula: 'Bought in; not manufactured from this cut list.', refs: [refs.get(f.id) ?? f.id], unitCost: null, cost: null });

  if (!prices) assumptions.push('No prices are configured, so no costs are estimated.');
  const costs = lines.map((l) => l.cost).filter((c): c is number => c !== null);
  return {
    lines,
    rules,
    excluded,
    assumptions,
    currency: prices?.currency ?? null,
    totalCost: costs.length ? round2(costs.reduce((a, b) => a + b, 0)) : null,
    complete: !!rules && excluded.length === 0,
  };
}

/** Gaps of 1–150 mm between floor units on a wall, or between a unit and the wall end. */
export function fillers(project: KitchenProject): { wall: (typeof WALLS)[number]; at: number; width: number; height: number; materialId: string; refs: string[] }[] {
  const refs = unitRefs(project);
  const out: ReturnType<typeof fillers> = [];
  for (const wall of WALLS) {
    const units = allElements(project).filter((e) => e.wallId === wall && specOf(e).mount === 'floor').sort((a, b) => spanAlongWall(a).start - spanAlongWall(b).start);
    if (!units.length) continue;
    const len = wall === 'back' || wall === 'front' ? project.room.width : project.room.length;
    const cabinetOf = (i: number) => units[i] && isCabinet(units[i]!) ? units[i]! : null;
    for (let i = 0; i <= units.length; i++) {
      const a = units[i - 1];
      const b = units[i];
      const start = a ? spanAlongWall(a).end : 0;
      const end = b ? spanAlongWall(b).start : len;
      const gap = Math.round(end - start);
      // Only next to a unit; a gap at a wall end next to a perpendicular run is a corner, not a filler.
      if (gap < 1 || gap > 150 || (!a && !b)) continue;
      if ((!a || !b) && cornerRun(project, wall, !a ? 'start' : 'end')) continue;
      const neighbour = cabinetOf(i) ?? cabinetOf(i - 1);
      const height = Math.min(...[a, b].filter((x) => x && isCabinet(x)).map((x) => x!.dimensions.height), 720);
      out.push({ wall, at: Math.round(start), width: gap, height, materialId: neighbour && isCabinet(neighbour) ? neighbour.materialId : 'shutter-white-matte', refs: [a, b].filter((x): x is NonNullable<typeof x> => !!x).map((x) => refs.get(x.id) ?? x.id) });
    }
  }
  return out;
}

function cornerRun(project: KitchenProject, wall: (typeof WALLS)[number], end: 'start' | 'end'): boolean {
  const corner = wall === 'back' || wall === 'front' ? (end === 'start' ? 'left' : 'right') : end === 'start' ? 'back' : 'front';
  return allElements(project).some((e) => e.wallId === corner && specOf(e).mount === 'floor' && !isFurniture(e));
}

const round2 = (v: number) => Math.round(v * 100) / 100;
