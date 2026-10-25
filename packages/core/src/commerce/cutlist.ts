/**
 * Workshop cut-list: every manufactured part, grouped per board (finish + thickness), so the
 * panel saw operator cuts one board at a time. Worktops are listed separately (see worktopRuns).
 */
import { BOARD_SHEET, finishById } from '../domain/catalog';
import { isParametric, type ParametricItem, type Project } from '../domain/types';
import { areaM2, type Um } from '../domain/units';
import { resolveParametric } from '../furniture';
import type { Part } from '../furniture/parts';
import { partLabel } from '../furniture/schedule';

export interface CutRow {
  unit: string;
  part: string;
  qty: number;
  lengthUm: Um;
  widthUm: Um;
  /** Edge banding code, e.g. "2L1S". */
  edgeBanding: string;
  grain: 'along-length' | 'none';
}

export interface CutBoard {
  key: string;
  label: string;
  thicknessUm: Um;
  finishId: string;
  back: boolean;
  rows: CutRow[];
  pieces: number;
  areaM2: number;
  /** Whole sheets to buy, including the usual cutting waste. */
  sheets: number;
}

function finishOf(p: Part, item: ParametricItem): string {
  if (p.material === 'back') return 'back';
  return p.material === 'shutter' ? item.materials.shutter : item.materials.carcass;
}

/** Parts per board across the whole design. Identical parts of one unit collapse into a quantity. */
export function buildCutList(project: Project): CutBoard[] {
  const boards = new Map<string, CutBoard>();
  const sheetM2 = areaM2(BOARD_SHEET.lengthUm, BOARD_SHEET.widthUm);
  for (const f of project.furniture) {
    if (!isParametric(f)) continue;
    for (const p of resolveParametric(f, project.rulePack).parts) {
      if (p.material === 'worktop') continue;
      const finishId = finishOf(p, f);
      const back = p.material === 'back';
      const key = `${finishId}|${p.thicknessUm}`;
      let b = boards.get(key);
      if (!b) {
        const mmT = Math.round(p.thicknessUm / 1000);
        b = { key, label: back ? `Back / drawer-bottom ply ${mmT} mm` : `${finishById(finishId).name} · ${mmT} mm`, thicknessUm: p.thicknessUm, finishId, back, rows: [], pieces: 0, areaM2: 0, sheets: 0 };
        boards.set(key, b);
      }
      const part = partLabel(p);
      const row = b.rows.find((r) => r.unit === f.name && r.part === part && r.lengthUm === p.lengthUm && r.widthUm === p.widthUm && r.edgeBanding === p.edgeBanding && r.grain === p.grain);
      if (row) row.qty += 1;
      else b.rows.push({ unit: f.name, part, qty: 1, lengthUm: p.lengthUm, widthUm: p.widthUm, edgeBanding: p.edgeBanding, grain: p.grain });
      b.pieces += 1;
      b.areaM2 += areaM2(p.lengthUm, p.widthUm);
    }
  }
  for (const b of boards.values()) {
    b.rows.sort((a, c) => a.unit.localeCompare(c.unit, undefined, { numeric: true }) || c.lengthUm * c.widthUm - a.lengthUm * a.widthUm);
    b.sheets = Math.ceil((b.areaM2 * BOARD_SHEET.wasteFactor) / sheetM2);
  }
  return [...boards.values()].sort((a, c) => Number(a.back) - Number(c.back) || a.label.localeCompare(c.label));
}
