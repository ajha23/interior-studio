/**
 * 2D Sheet Nesting & Cutting Optimization Engine
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (100% Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I, Principle III
 */

import { expandPanelsForNesting } from './cutlistAdapter';
import { GuillotineBinPacker } from './guillotineBinPacker';
import {
  DEFAULT_RAW_BOARD,
  REUSABLE_OFFCUT_MIN_DIMENSION,
  type InputNestingPanel,
  type NestedPanelPlacement,
  type NestedSheet,
  type NestingResult,
  type OffcutRectangle,
  type RawBoardStock,
} from './types';

export interface NestingOptimizationOptions {
  board?: Partial<RawBoardStock>;
  reusableOffcutMinDimension?: number;
}

export interface NestingOptimizationRequest {
  panels: InputNestingPanel[];
  options?: NestingOptimizationOptions;
}

export class NestingEngine {
  /**
   * Optimizes panels across raw boards, segregating by material and thickness.
   */
  public optimize(request: NestingOptimizationRequest): NestingResult {
    const { panels, options } = request;
    const minOffcut = options?.reusableOffcutMinDimension ?? REUSABLE_OFFCUT_MIN_DIMENSION;

    if (panels.length === 0) {
      return {
        sheets: [],
        sheetsByMaterial: {},
        totalSheets: 0,
        totalPartAreaMm2: 0,
        totalBoardAreaMm2: 0,
        netYieldPercentage: 0,
        reusableOffcuts: [],
        unplacedPanels: [],
        calculatedAt: new Date().toISOString(),
      };
    }

    // Segregate panels by material and thickness
    const groups = new Map<string, InputNestingPanel[]>();
    for (const panel of panels) {
      const key = `${panel.material} (${panel.thickness}mm)`;
      const list = groups.get(key) ?? [];
      list.push(panel);
      groups.set(key, list);
    }

    const allSheets: NestedSheet[] = [];
    const sheetsByMaterial: Record<string, NestedSheet[]> = {};
    const unplacedPanels: InputNestingPanel[] = [];
    let globalSheetIndex = 1;

    for (const [groupKey, groupPanels] of groups.entries()) {
      const firstPanel = groupPanels[0];
      if (!firstPanel) continue;

      const boardStock: RawBoardStock = {
        id: `board_${groupKey.replace(/\s+/g, '_')}`,
        material: firstPanel.material,
        thickness: firstPanel.thickness,
        length: options?.board?.length ?? DEFAULT_RAW_BOARD.length,
        width: options?.board?.width ?? DEFAULT_RAW_BOARD.width,
        trimMargin: options?.board?.trimMargin ?? DEFAULT_RAW_BOARD.trimMargin,
        kerf: options?.board?.kerf ?? DEFAULT_RAW_BOARD.kerf,
      };

      const materialSheets = this.packMaterialGroup(
        groupPanels,
        boardStock,
        globalSheetIndex,
        minOffcut,
        unplacedPanels
      );

      globalSheetIndex += materialSheets.length;
      allSheets.push(...materialSheets);
      sheetsByMaterial[groupKey] = materialSheets;
    }

    const totalPartAreaMm2 = allSheets.reduce((sum, s) => sum + s.usedAreaMm2, 0);
    const totalBoardAreaMm2 = allSheets.reduce((sum, s) => sum + s.boardLength * s.boardWidth, 0);
    const netYieldPercentage =
      totalBoardAreaMm2 > 0 ? Math.round((totalPartAreaMm2 / totalBoardAreaMm2) * 10000) / 100 : 0;

    const reusableOffcuts = allSheets.flatMap((s) => s.offcuts.filter((o) => o.isReusable));

    return {
      sheets: allSheets,
      sheetsByMaterial,
      totalSheets: allSheets.length,
      totalPartAreaMm2,
      totalBoardAreaMm2,
      netYieldPercentage,
      reusableOffcuts,
      unplacedPanels,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Packs all panels of a single material group into one or more sheets.
   */
  private packMaterialGroup(
    groupPanels: InputNestingPanel[],
    boardStock: RawBoardStock,
    startSheetIndex: number,
    minOffcut: number,
    unplacedPanels: InputNestingPanel[]
  ): NestedSheet[] {
    const expanded = expandPanelsForNesting(groupPanels);

    // Sort by Best-Fit Decreasing (BFD): largest dimension first, then area
    expanded.sort((a, b) => {
      const maxA = Math.max(a.length, a.width);
      const maxB = Math.max(b.length, b.width);
      if (maxB !== maxA) return maxB - maxA;
      return b.length * b.width - a.length * a.width;
    });

    const sheets: NestedSheet[] = [];
    const remainingPanels = [...expanded];
    let sheetNumber = startSheetIndex;

    while (remainingPanels.length > 0) {
      const packer = new GuillotineBinPacker(boardStock);
      const placedInThisSheet: NestedPanelPlacement[] = [];
      const stillRemaining: InputNestingPanel[] = [];

      for (const panel of remainingPanels) {
        const placement = packer.pack(panel, sheetNumber);
        if (placement) {
          placedInThisSheet.push(placement);
        } else {
          stillRemaining.push(panel);
        }
      }

      // If nothing could be placed on a fresh empty sheet, the remaining panels exceed board size
      if (placedInThisSheet.length === 0) {
        unplacedPanels.push(...stillRemaining);
        break;
      }

      // Compute offcuts from packer's free rectangles
      const offcuts: OffcutRectangle[] = packer.getFreeRectangles().map((free) => {
        const length = Math.round(free.length);
        const width = Math.round(free.width);
        const areaMm2 = Math.round(length * width);
        const isReusable =
          (length >= minOffcut && width >= minOffcut) || (width >= minOffcut && length >= minOffcut);

        return {
          x: Math.round(free.x),
          y: Math.round(free.y),
          length,
          width,
          areaMm2,
          isReusable,
        };
      });

      const usedAreaMm2 = packer.getUsedAreaMm2();
      const usableAreaMm2 = packer.getUsableAreaMm2();
      const yieldPercentage =
        usableAreaMm2 > 0 ? Math.round((usedAreaMm2 / usableAreaMm2) * 10000) / 100 : 0;

      sheets.push({
        sheetIndex: sheetNumber,
        material: boardStock.material,
        thickness: boardStock.thickness,
        boardLength: boardStock.length,
        boardWidth: boardStock.width,
        trimMargin: boardStock.trimMargin,
        kerf: boardStock.kerf,
        placements: placedInThisSheet,
        offcuts,
        usedAreaMm2,
        usableAreaMm2,
        yieldPercentage,
      });

      sheetNumber++;
      remainingPanels.length = 0;
      remainingPanels.push(...stillRemaining);
    }

    return sheets;
  }
}
