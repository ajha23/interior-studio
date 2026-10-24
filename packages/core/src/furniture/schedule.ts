import { BOARD_SHEET, finishById } from '../domain/catalog';
import type { ParametricItem, RulePack } from '../domain/types';
import { areaM2, plainMm, type Um } from '../domain/units';
import { resolveParametric } from './index';
import type { Part, ResolvedFurniture } from './parts';

export interface ScheduleRow {
  mark: string;
  name: string;
  qty: number;
  lengthUm: Um;
  widthUm: Um;
  thicknessUm: Um;
  material: string;
  grain: string;
  edgeBanding: string;
}

export interface MaterialTotal {
  material: string;
  thicknessUm: Um;
  areaM2: number;
  sheets: number;
}

export function materialLabel(part: Part, item: ParametricItem, rp: RulePack): string {
  const board = `${rp.carcassBoard.split(',')[0]} ${plainMm(part.thicknessUm)} mm`;
  if (part.material === 'back') return `Back ply ${plainMm(part.thicknessUm)} mm`;
  if (part.material === 'shutter') return `${board} · ${finishById(item.materials.shutter).name}`;
  if (part.material === 'worktop') return `Worktop ${plainMm(part.thicknessUm)} mm · ${finishById(item.kind === 'basecabinet' ? item.materials.worktop : item.materials.shutter).name}`;
  return `${board} · ${finishById(item.materials.carcass).name}`;
}

function partLabel(p: Part): string {
  switch (p.role) {
    case 'side': return 'Side panel';
    case 'top': return /rail/.test(p.key) ? 'Rail' : 'Top';
    case 'bottom': return 'Bottom';
    case 'partition': return 'Partition';
    case 'shelf': return 'Shelf';
    case 'back': return 'Back panel';
    case 'shutter': return p.name.includes('flap') ? 'Flap door' : 'Shutter';
    case 'drawer-front': return 'Drawer front';
    case 'drawer-bottom': return 'Drawer bottom';
    case 'panel': return 'Wall panel';
    case 'plinth': return 'Plinth';
    case 'worktop': return 'Worktop';
    case 'drawer-box': return /side/.test(p.key) ? 'Drawer side' : /front$/.test(p.key) ? 'Drawer inner front' : 'Drawer back';
  }
}

/** Collapse identical parts (same size, thickness, material, banding) into scheduled lines. */
export function buildSchedule(item: ParametricItem, rp: RulePack, resolved?: ResolvedFurniture): { rows: ScheduleRow[]; totals: MaterialTotal[]; resolved: ResolvedFurniture } {
  const r = resolved ?? resolveParametric(item, rp);
  const groups = new Map<string, ScheduleRow>();
  for (const p of r.parts) {
    const material = materialLabel(p, item, rp);
    const name = partLabel(p);
    const sig = [name, p.lengthUm, p.widthUm, p.thicknessUm, material, p.edgeBanding].join('|');
    const g = groups.get(sig);
    if (g) {
      g.qty += 1;
    } else {
      groups.set(sig, { mark: '', name, qty: 1, lengthUm: p.lengthUm, widthUm: p.widthUm, thicknessUm: p.thicknessUm, material, grain: p.grain === 'none' ? '—' : '↕ length', edgeBanding: p.edgeBanding });
    }
  }
  const rows = [...groups.values()];
  rows.forEach((row, i) => (row.mark = `P${String(i + 1).padStart(2, '0')}`));

  const totalsMap = new Map<string, MaterialTotal>();
  for (const row of rows) {
    const k = `${row.material}|${row.thicknessUm}`;
    const t = totalsMap.get(k) ?? { material: row.material, thicknessUm: row.thicknessUm, areaM2: 0, sheets: 0 };
    t.areaM2 += areaM2(row.lengthUm, row.widthUm) * row.qty;
    totalsMap.set(k, t);
  }
  const sheetArea = areaM2(BOARD_SHEET.lengthUm, BOARD_SHEET.widthUm);
  const totals = [...totalsMap.values()].map((t) => ({ ...t, sheets: Math.ceil((t.areaM2 * BOARD_SHEET.wasteFactor) / sheetArea) }));
  return { rows, totals, resolved: r };
}

export function scheduleCsv(item: ParametricItem, rp: RulePack, projectName: string, revisionLabel: string): string {
  const { rows, resolved } = buildSchedule(item, rp);
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [
    [`Project`, projectName].map(esc).join(','),
    [`Item`, item.name].map(esc).join(','),
    [`Revision`, revisionLabel].map(esc).join(','),
    [`Template`, `${resolved.templateKey} v${resolved.templateVersion}`, `Rule pack`, `${rp.id} v${rp.version}`].map(esc).join(','),
    [`Units`, `mm (finished sizes, edge banding included)`].map(esc).join(','),
    '',
    ['Mark', 'Part', 'Qty', 'Length', 'Width', 'Thickness', 'Material', 'Grain', 'Edge banding'].map(esc).join(','),
    ...rows.map((r) => [r.mark, r.name, r.qty, plainMm(r.lengthUm), plainMm(r.widthUm), plainMm(r.thicknessUm), r.material, r.grain, r.edgeBanding].map(esc).join(',')),
    '',
    ['Hardware', 'Spec', 'Qty'].map(esc).join(','),
    ...resolved.hardware.map((h) => [h.name, h.spec, h.qty].map(esc).join(',')),
  ];
  return lines.join('\n');
}
