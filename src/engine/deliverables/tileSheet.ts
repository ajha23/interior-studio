/**
 * Tile Layout & Quantity Calculator Engine.
 * Pure and deterministic calculation of wall backsplash (dado) and floor tiling requirements.
 *
 * Rules:
 * - Framework-free TypeScript.
 * - Integer millimeter math, square-meter areas rounded to 2 decimal places.
 */

import { type KitchenProject, WALL_LABEL, wallLength, type WallId } from '@/domain';
import type { Sheet, TableColumn } from './drawing';

export interface TileConfig {
  tileWidthMm?: number;   // default 300
  tileHeightMm?: number;  // default 600
  wastagePct?: number;    // default 10%
  tilesPerBox?: number;   // default 8
  dadoHeightMm?: number;  // default 600mm
  jointWidthMm?: number;  // default 2mm
}

export interface WallTileBreakdown {
  wallId: WallId;
  wallName: string;
  runLengthMm: number;
  dadoHeightMm: number;
  grossAreaSqM: number;
  windowDeductionSqM: number;
  netAreaSqM: number;
}

export interface TileCalculationResult {
  tileWidthMm: number;
  tileHeightMm: number;
  wastagePct: number;
  tilesPerBox: number;
  tileAreaSqM: number;
  breakdown: WallTileBreakdown[];
  totalGrossAreaSqM: number;
  totalDeductionsSqM: number;
  totalNetAreaSqM: number;
  rawTileCount: number;
  totalTileCountWithWastage: number;
  totalBoxesNeeded: number;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Calculates net tileable area, required tile pieces, and total boxes.
 */
export function calculateTileLayout(
  project: KitchenProject,
  config: TileConfig = {}
): TileCalculationResult {
  const tileW = config.tileWidthMm || 300;
  const tileH = config.tileHeightMm || 600;
  const wastage = config.wastagePct ?? 10;
  const tilesPerBox = config.tilesPerBox || 8;
  const dadoH = config.dadoHeightMm || 600;

  const tileAreaSqM = round2((tileW * tileH) / 1_000_000);

  // Identify walls that have base units or countertops
  const activeWalls = new Set<WallId>();
  for (const c of project.cabinets) {
    if ((c.type === 'base' || c.type === 'sink' || c.type === 'drawer' || c.type === 'corner') && c.wallId) {
      activeWalls.add(c.wallId);
    }
  }

  // If no cabinets placed, fall back to back wall
  if (activeWalls.size === 0) {
    activeWalls.add('back');
  }

  const breakdown: WallTileBreakdown[] = [];
  let totalGross = 0;
  let totalDeductions = 0;

  const dadoBottom = 860; // Standard finished counter height AFF
  const dadoTop = dadoBottom + dadoH;

  for (const wallId of activeWalls) {
    const runLength = wallLength(project.room, wallId);
    const grossArea = round2((runLength * dadoH) / 1_000_000);

    // Check window deductions in this wall
    let deduction = 0;
    const openings = project.openings || [];
    for (const op of openings) {
      if (op.wallId === wallId) {
        const opBottom = op.sill;
        const opTop = op.sill + op.height;
        // Overlap with dado vertical band
        const overlapBottom = Math.max(dadoBottom, opBottom);
        const overlapTop = Math.min(dadoTop, opTop);
        if (overlapTop > overlapBottom) {
          const overlapH = overlapTop - overlapBottom;
          deduction += (op.width * overlapH) / 1_000_000;
        }
      }
    }
    deduction = round2(deduction);
    const netArea = round2(Math.max(0, grossArea - deduction));

    breakdown.push({
      wallId,
      wallName: WALL_LABEL[wallId],
      runLengthMm: runLength,
      dadoHeightMm: dadoH,
      grossAreaSqM: grossArea,
      windowDeductionSqM: deduction,
      netAreaSqM: netArea,
    });

    totalGross += grossArea;
    totalDeductions += deduction;
  }

  totalGross = round2(totalGross);
  totalDeductions = round2(totalDeductions);
  const totalNet = round2(Math.max(0, totalGross - totalDeductions));

  const rawCount = tileAreaSqM > 0 ? Math.ceil(totalNet / tileAreaSqM) : 0;
  const countWithWastage = Math.ceil(rawCount * (1 + wastage / 100));
  const boxes = Math.ceil(countWithWastage / tilesPerBox);

  return {
    tileWidthMm: tileW,
    tileHeightMm: tileH,
    wastagePct: wastage,
    tilesPerBox,
    tileAreaSqM,
    breakdown,
    totalGrossAreaSqM: totalGross,
    totalDeductionsSqM: totalDeductions,
    totalNetAreaSqM: totalNet,
    rawTileCount: rawCount,
    totalTileCountWithWastage: countWithWastage,
    totalBoxesNeeded: boxes,
  };
}

/**
 * Builds the Tile Schedule Sheet for site civil/tiling contractors.
 */
export function buildTileScheduleSheet(
  project: KitchenProject,
  revision: string,
  config: TileConfig = {}
): Omit<Sheet, 'title'> {
  const result = calculateTileLayout(project, config);

  const columns: TableColumn[] = [
    { label: 'Wall Run', width: 0.22 },
    { label: 'Length (mm)', width: 0.16, align: 'right' },
    { label: 'Dado Height', width: 0.14, align: 'right' },
    { label: 'Gross Area', width: 0.16, align: 'right' },
    { label: 'Window Ded.', width: 0.16, align: 'right' },
    { label: 'Net Area (m²)', width: 0.16, align: 'right' },
  ];

  const rows: string[][] = result.breakdown.map((b) => [
    b.wallName,
    b.runLengthMm.toString(),
    `${b.dadoHeightMm}mm`,
    `${b.grossAreaSqM.toFixed(2)} m²`,
    b.windowDeductionSqM > 0 ? `-${b.windowDeductionSqM.toFixed(2)} m²` : '-',
    `${b.netAreaSqM.toFixed(2)} m²`,
  ]);

  rows.push([
    'TOTAL NET AREA',
    '-',
    '-',
    `${result.totalGrossAreaSqM.toFixed(2)} m²`,
    `-${result.totalDeductionsSqM.toFixed(2)} m²`,
    `${result.totalNetAreaSqM.toFixed(2)} m²`,
  ]);

  return {
    id: 'tile-schedule',
    paper: 'A4',
    body: {
      kind: 'table',
      heading: `Kitchen Backsplash Tile Quantity & Civil Schedule · Rev ${revision.slice(0, 8)}`,
      columns,
      rows,
      notes: [
        `Tile Specification: ${result.tileWidthMm} × ${result.tileHeightMm} mm (${result.tileAreaSqM} m²/tile).`,
        `Wastage Factor: ${result.wastagePct}% included for diagonal/edge cut allowances.`,
        `Net Tiles: ${result.rawTileCount} pcs | Total with Wastage: ${result.totalTileCountWithWastage} pcs (${result.totalBoxesNeeded} boxes @ ${result.tilesPerBox} pcs/box).`,
        'Use polymer-modified tile adhesive (IS 15477 Type 2) and 2mm levelling spacers with epoxy grout.',
      ],
    },
  };
}
