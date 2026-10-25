/**
 * Bill of materials, studio price list and client quote.
 *
 * Two views of the same scene:
 * - **BOM (workshop):** what to buy — whole board sheets per board/finish, edge banding metres,
 *   worktop area, hardware counts, catalogue products — at internal cost.
 * - **Quote (client):** one line per piece with its size and finish. Boards are priced by area
 *   (including the waste allowance) so each unit carries its own share; labour, installation and
 *   the studio margin are folded into the unit prices; GST is added on the total.
 * All money is in whole rupees; quantities keep their natural units.
 */
import { BOARD_SHEET, finishById } from '../domain/catalog';
import { isDecor, isParametric, type FurnitureItem, type ParametricItem, type Project } from '../domain/types';
import { areaM2, fmtMm } from '../domain/units';
import { catalogById } from '../catalog/library';
import { envelope, resolveParametric } from '../furniture';
import type { Part } from '../furniture/parts';
import { centroid } from '../plan/polygon';
import { detectRooms, roomAt } from '../plan/rooms';
import { footprint } from '../geometry/furniture';

export const PRICE_LIST_VERSION = 1;
const SQFT_PER_M2 = 10.7639;

export interface PriceList {
  version: number;
  currency: 'INR';
  /** 18 mm carcass/shutter board (BWP ply + laminate or finish), per 8×4 ft sheet, by finish id. */
  boardPerSheet: Record<string, number>;
  /** Fallback for finishes not listed. */
  boardDefault: number;
  /** 6 mm back panels and drawer bottoms, per sheet. */
  backPerSheet: number;
  /** Matching edge banding, per running metre. */
  edgeBandPerM: number;
  /** Worktop slab supplied and fixed, per sq ft, by worktop finish id. */
  worktopPerSqft: Record<string, number>;
  /** Hardware unit prices by line name (see the templates' hardware lists). */
  hardware: Record<string, number>;
  hardwareDefault: number;
  /** Catalogue products by catalogue id (0 or missing = price on request). */
  catalogue: Record<string, number>;
  /** Workshop labour as a percentage of manufactured material cost. */
  labourPct: number;
  /** Site installation per manufactured unit. */
  installPerUnit: number;
  /** Worktop cut-out (sink or hob), each, labour and polishing. */
  cutoutEach: number;
  /** Studio margin on the pre-tax total. */
  marginPct: number;
  /** GST on the quote (18% for modular furniture and services in India). */
  gstPct: number;
}

/** Sample Indian rates (late 2026) so quotes work out of the box; every studio should set its own. */
export const DEFAULT_PRICE_LIST: PriceList = {
  version: PRICE_LIST_VERSION,
  currency: 'INR',
  boardPerSheet: { 'white-matte': 4800, ivory: 4900, 'oak-light': 5600, walnut: 5900, teak: 7800, graphite: 5400, sage: 6900, terracotta: 6900 },
  boardDefault: 5200,
  backPerSheet: 1450,
  edgeBandPerM: 28,
  worktopPerSqft: { 'granite-black': 260, 'quartz-white': 560, marble: 420, 'oak-butcher': 650, steel: 900 },
  hardware: {
    'Concealed hinge': 180,
    'Drawer runner (pair)': 1250,
    Handle: 260,
    'Adjustable leg': 65,
    'Plinth clip': 25,
    'Shelf support': 6,
    'Lift-up stay': 2400,
    'Flap stay': 650,
    'Wall-hanging bracket': 480,
    'Wall-hung bracket': 520,
    'Anti-tip wall bracket': 220,
    'Push-to-open latch': 240,
    'Cable grommet': 90,
    'Wardrobe rail': 420,
    'Rail end bracket': 60,
    'Wall anchor bracket': 140,
  },
  hardwareDefault: 150,
  catalogue: {},
  labourPct: 18,
  installPerUnit: 750,
  cutoutEach: 900,
  marginPct: 20,
  gstPct: 18,
};

const finite = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const rates = (v: unknown, d: Record<string, number>, hi: number): Record<string, number> => {
  const out: Record<string, number> = { ...d };
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 500)) if (typeof x === 'number' && Number.isFinite(x)) out[String(k).slice(0, 80)] = Math.min(hi, Math.max(0, x));
  return out;
};

/** Merge stored (possibly older or partial) rates over the defaults, clamped to sane ranges. */
export function sanitizePriceList(input: unknown): PriceList {
  const p = (input ?? {}) as Partial<PriceList>;
  const d = DEFAULT_PRICE_LIST;
  return {
    version: PRICE_LIST_VERSION,
    currency: 'INR',
    boardPerSheet: rates(p.boardPerSheet, d.boardPerSheet, 200_000),
    boardDefault: finite(p.boardDefault, 0, 200_000, d.boardDefault),
    backPerSheet: finite(p.backPerSheet, 0, 100_000, d.backPerSheet),
    edgeBandPerM: finite(p.edgeBandPerM, 0, 5_000, d.edgeBandPerM),
    worktopPerSqft: rates(p.worktopPerSqft, d.worktopPerSqft, 50_000),
    hardware: rates(p.hardware, d.hardware, 200_000),
    hardwareDefault: finite(p.hardwareDefault, 0, 200_000, d.hardwareDefault),
    catalogue: rates(p.catalogue, d.catalogue, 10_000_000),
    labourPct: finite(p.labourPct, 0, 200, d.labourPct),
    installPerUnit: finite(p.installPerUnit, 0, 100_000, d.installPerUnit),
    cutoutEach: finite(p.cutoutEach, 0, 50_000, d.cutoutEach),
    marginPct: finite(p.marginPct, 0, 300, d.marginPct),
    gstPct: finite(p.gstPct, 0, 40, d.gstPct),
  };
}

const SHEET_M2 = areaM2(BOARD_SHEET.lengthUm, BOARD_SHEET.widthUm);
const round = (n: number) => Math.round(n);

/** Finish id a part is made in. */
function partFinish(part: Part, item: ParametricItem): string {
  if (part.material === 'worktop') return item.kind === 'basecabinet' ? item.materials.worktop : item.materials.shutter;
  if (part.material === 'shutter') return item.materials.shutter;
  return item.materials.carcass;
}

/** Banded edge length of a part, from its code ("2L1S" = both long edges and one short edge). */
export function edgeBandM(part: Part): number {
  const m = /(?:(\d)L)?(?:(\d)S)?/.exec(part.edgeBanding);
  const long = Number(m?.[1] ?? 0);
  const short = Number(m?.[2] ?? 0);
  return (long * part.lengthUm + short * part.widthUm) / 1_000_000;
}

export interface BomLine {
  section: 'Boards' | 'Edge banding' | 'Worktops' | 'Hardware' | 'Furniture & decor';
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface Bom {
  lines: BomLine[];
  /** Material cost of manufactured units (boards at whole sheets, banding, worktops, hardware). */
  manufacturedCost: number;
  productsCost: number;
  /** Products without a price in the list (shown as "on request"). */
  unpriced: string[];
}

/** Workshop BOM at internal cost: whole sheets per board, banding, worktops, hardware, products. */
export function buildBom(project: Project, priceList: PriceList): Bom {
  const boards = new Map<string, { finish: string; back: boolean; thicknessUm: number; m2: number }>();
  let bandM = 0;
  const worktops = new Map<string, number>();
  const hardware = new Map<string, { name: string; spec: string; qty: number }>();
  const products: BomLine[] = [];
  const unpriced: string[] = [];
  for (const f of project.furniture) {
    if (isParametric(f)) {
      const r = resolveParametric(f, project.rulePack);
      for (const p of r.parts) {
        if (p.material === 'worktop') {
          const id = partFinish(p, f);
          worktops.set(id, (worktops.get(id) ?? 0) + areaM2(p.lengthUm, p.widthUm) * SQFT_PER_M2);
          continue;
        }
        const back = p.material === 'back';
        const finish = back ? 'back' : partFinish(p, f);
        const key = `${finish}|${p.thicknessUm}`;
        const b = boards.get(key) ?? { finish, back, thicknessUm: p.thicknessUm, m2: 0 };
        b.m2 += areaM2(p.lengthUm, p.widthUm);
        boards.set(key, b);
        bandM += edgeBandM(p);
      }
      for (const h of r.hardware) {
        const key = `${h.name}|${h.spec}`;
        const cur = hardware.get(key) ?? { name: h.name, spec: h.spec, qty: 0 };
        cur.qty += h.qty;
        hardware.set(key, cur);
      }
    } else {
      const { rate, label } = productRate(f, priceList);
      if (!rate) unpriced.push(f.name);
      products.push({ section: 'Furniture & decor', description: label, qty: 1, unit: 'no.', rate, amount: rate });
    }
  }
  const lines: BomLine[] = [];
  for (const b of [...boards.values()].sort((a, c) => Number(a.back) - Number(c.back) || a.finish.localeCompare(c.finish))) {
    const sheets = Math.ceil((b.m2 * BOARD_SHEET.wasteFactor) / SHEET_M2);
    const rate = b.back ? priceList.backPerSheet : priceList.boardPerSheet[b.finish] ?? priceList.boardDefault;
    const description = b.back ? `Back / drawer-bottom ply ${fmtMm(b.thicknessUm)} mm` : `Board ${fmtMm(b.thicknessUm)} mm · ${finishById(b.finish).name}`;
    lines.push({ section: 'Boards', description: `${description} (${b.m2.toFixed(2)} m² + ${Math.round((BOARD_SHEET.wasteFactor - 1) * 100)}% waste)`, qty: sheets, unit: 'sheet', rate, amount: round(sheets * rate) });
  }
  if (bandM > 0) {
    const qty = Math.ceil(bandM * 1.1);
    lines.push({ section: 'Edge banding', description: 'Matching PVC edge band (10% allowance)', qty, unit: 'm', rate: priceList.edgeBandPerM, amount: round(qty * priceList.edgeBandPerM) });
  }
  for (const [id, sqft] of worktops) {
    const qty = Math.round(sqft * 10) / 10;
    const rate = priceList.worktopPerSqft[id] ?? 0;
    lines.push({ section: 'Worktops', description: `Worktop · ${finishById(id).name}`, qty, unit: 'sq ft', rate, amount: round(qty * rate) });
  }
  const cutouts = project.furniture.filter((f) => isParametric(f) && hasCutout(f)).length;
  if (cutouts > 0) lines.push({ section: 'Worktops', description: 'Worktop cut-outs (sink / hob)', qty: cutouts, unit: 'no.', rate: priceList.cutoutEach, amount: round(cutouts * priceList.cutoutEach) });
  for (const h of [...hardware.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const rate = priceList.hardware[h.name] ?? priceList.hardwareDefault;
    lines.push({ section: 'Hardware', description: `${h.name} — ${h.spec}`, qty: h.qty, unit: 'no.', rate, amount: round(h.qty * rate) });
  }
  lines.push(...products);
  const manufacturedCost = lines.filter((l) => l.section !== 'Furniture & decor').reduce((s, l) => s + l.amount, 0);
  const productsCost = products.reduce((s, l) => s + l.amount, 0);
  return { lines, manufacturedCost, productsCost, unpriced };
}

function productRate(f: FurnitureItem, pl: PriceList): { rate: number; label: string } {
  if (f.kind === 'library') {
    const def = catalogById(f.ref);
    return { rate: pl.catalogue[f.ref] ?? 0, label: `${f.name}${def && def.name !== f.name ? ` (${def.name})` : ''}` };
  }
  if (f.kind === 'model') return { rate: pl.catalogue[`model:${f.modelId}`] ?? 0, label: `${f.name} (studio model)` };
  return { rate: isDecor(f) ? pl.catalogue[`block:${f.kind}`] ?? 0 : 0, label: f.name };
}

export interface QuoteLine {
  itemId: string;
  room: string;
  name: string;
  /** W × D × H in mm. */
  size: string;
  finish: string;
  kind: 'manufactured' | 'product';
  qty: number;
  /** Client price per unit, including labour, installation and margin, before GST. */
  amount: number;
  /** Internal cost before margin (not shown to clients). */
  cost: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  gst: number;
  total: number;
  /** Internal summary (never printed on the client quote). */
  internal: { materials: number; labour: number; install: number; products: number; cost: number; margin: number };
  unpriced: string[];
}

const hasCutout = (f: ParametricItem) => f.kind === 'basecabinet' && f.params.worktopUm > 0 && (f.params.cutout === 'sink' || f.params.cutout === 'hob');

/** Area-based material cost of one manufactured unit (its share of sheets incl. waste). */
function unitMaterialCost(f: ParametricItem, project: Project, pl: PriceList): number {
  const r = resolveParametric(f, project.rulePack);
  let cost = 0;
  for (const p of r.parts) {
    const m2 = areaM2(p.lengthUm, p.widthUm);
    if (p.material === 'worktop') {
      cost += m2 * SQFT_PER_M2 * (pl.worktopPerSqft[partFinish(p, f)] ?? 0);
      continue;
    }
    const sheet = p.material === 'back' ? pl.backPerSheet : pl.boardPerSheet[partFinish(p, f)] ?? pl.boardDefault;
    cost += ((m2 * BOARD_SHEET.wasteFactor) / SHEET_M2) * sheet;
    cost += edgeBandM(p) * 1.1 * pl.edgeBandPerM;
  }
  for (const h of r.hardware) cost += h.qty * (pl.hardware[h.name] ?? pl.hardwareDefault);
  if (f.kind === 'basecabinet' && hasCutout(f)) cost += pl.cutoutEach;
  return cost;
}

function finishLabel(f: FurnitureItem): string {
  if (f.kind === 'basecabinet') return `${finishById(f.materials.shutter).name} fronts${f.params.worktopUm > 0 ? ` · ${finishById(f.materials.worktop).name} top` : ''}`;
  if (isParametric(f)) return `${finishById(f.materials.shutter).name} fronts · ${finishById(f.materials.carcass).name} carcass`;
  if (f.kind === 'library') return finishById(f.materials.main).name;
  return '—';
}

/** Client quote: one line per piece, grouped by room, margin folded in, GST on top. */
export function buildQuote(project: Project, pl: PriceList): Quote {
  const rooms = detectRooms(project.plan);
  const lines: QuoteLine[] = [];
  const internal = { materials: 0, labour: 0, install: 0, products: 0, cost: 0, margin: 0 };
  const unpriced: string[] = [];
  const k = 1 + pl.marginPct / 100;
  for (const f of project.furniture) {
    const e = envelope(f);
    const room = roomAt(rooms, centroid(footprint(f)))?.info.name ?? 'Unassigned';
    const size = `${fmtMm(e.widthUm)} × ${fmtMm(e.depthUm)} × ${fmtMm(e.heightUm - e.zMinUm)}`;
    if (isParametric(f)) {
      const materials = unitMaterialCost(f, project, pl);
      const labour = (materials * pl.labourPct) / 100;
      const install = pl.installPerUnit;
      const cost = materials + labour + install;
      internal.materials += materials;
      internal.labour += labour;
      internal.install += install;
      lines.push({ itemId: f.id, room, name: f.name, size, finish: finishLabel(f), kind: 'manufactured', qty: 1, amount: round(cost * k), cost: round(cost) });
    } else {
      const { rate } = productRate(f, pl);
      if (!rate) unpriced.push(f.name);
      internal.products += rate;
      lines.push({ itemId: f.id, room, name: f.name, size, finish: finishLabel(f), kind: 'product', qty: 1, amount: round(rate * k), cost: round(rate) });
    }
  }
  lines.sort((a, b) => a.room.localeCompare(b.room) || Number(a.kind === 'product') - Number(b.kind === 'product'));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  internal.cost = round(internal.materials + internal.labour + internal.install + internal.products);
  internal.margin = subtotal - lines.reduce((s, l) => s + l.cost, 0);
  internal.materials = round(internal.materials);
  internal.labour = round(internal.labour);
  internal.install = round(internal.install);
  const gst = round((subtotal * pl.gstPct) / 100);
  return { lines, subtotal, gst, total: subtotal + gst, internal, unpriced };
}

/** Indian digit grouping: ₹1,23,456. */
export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
