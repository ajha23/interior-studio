/**
 * 2D Guillotine Bin Packer
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (100% Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I, Principle III
 */

import { canRotate } from './grainPolicy';
import type { InputNestingPanel, NestedPanelPlacement, RawBoardStock } from './types';

export interface FreeRectangle {
  x: number;
  y: number;
  length: number;
  width: number;
}

export class GuillotineBinPacker {
  private readonly board: RawBoardStock;
  private readonly freeRectangles: FreeRectangle[] = [];
  private readonly placements: NestedPanelPlacement[] = [];

  constructor(board: RawBoardStock) {
    this.board = board;
    const originX = board.trimMargin;
    const originY = board.trimMargin;
    const usableLength = Math.max(0, board.length - 2 * board.trimMargin);
    const usableWidth = Math.max(0, board.width - 2 * board.trimMargin);

    if (usableLength > 0 && usableWidth > 0) {
      this.freeRectangles.push({
        x: originX,
        y: originY,
        length: usableLength,
        width: usableWidth,
      });
    }
  }

  /**
   * Attempts to pack a panel into the sheet using Best-Area-Fit (BAF) with Best-Short-Side-Fit (BSSF).
   * Returns placement if successful, or null if panel cannot fit in remaining free areas.
   */
  public pack(panel: InputNestingPanel, sheetIndex = 1): NestedPanelPlacement | null {
    const allowRotation = canRotate(panel);

    type Candidate = {
      freeIndex: number;
      freeRect: FreeRectangle;
      pLength: number;
      pWidth: number;
      rotated: boolean;
      areaFit: number;
      shortSideFit: number;
    };

    let bestCandidate: Candidate | null = null;

    for (let i = 0; i < this.freeRectangles.length; i++) {
      const free = this.freeRectangles[i];
      if (!free) continue;

      // Evaluation 1: Standard orientation (0°)
      if (panel.length <= free.length && panel.width <= free.width) {
        const areaFit = free.length * free.width - panel.length * panel.width;
        const shortSideFit = Math.min(free.length - panel.length, free.width - panel.width);

        if (
          !bestCandidate ||
          areaFit < bestCandidate.areaFit ||
          (areaFit === bestCandidate.areaFit && shortSideFit < bestCandidate.shortSideFit)
        ) {
          bestCandidate = {
            freeIndex: i,
            freeRect: free,
            pLength: panel.length,
            pWidth: panel.width,
            rotated: false,
            areaFit,
            shortSideFit,
          };
        }
      }

      // Evaluation 2: Rotated 90° (only if allowed by grain policy)
      if (allowRotation && panel.width <= free.length && panel.length <= free.width) {
        const areaFit = free.length * free.width - panel.width * panel.length;
        const shortSideFit = Math.min(free.length - panel.width, free.width - panel.length);

        if (
          !bestCandidate ||
          areaFit < bestCandidate.areaFit ||
          (areaFit === bestCandidate.areaFit && shortSideFit < bestCandidate.shortSideFit)
        ) {
          bestCandidate = {
            freeIndex: i,
            freeRect: free,
            pLength: panel.width,
            pWidth: panel.length,
            rotated: true,
            areaFit,
            shortSideFit,
          };
        }
      }
    }

    if (!bestCandidate) {
      return null;
    }

    // Remove chosen free rectangle
    const chosen = this.freeRectangles.splice(bestCandidate.freeIndex, 1)[0];
    if (!chosen) {
      return null;
    }

    const { pLength, pWidth, rotated } = bestCandidate;
    const kerf = this.board.kerf;

    // Create placement
    const placement: NestedPanelPlacement = {
      panelId: panel.id,
      partName: panel.partName,
      sheetIndex,
      x: chosen.x,
      y: chosen.y,
      length: pLength,
      width: pWidth,
      rotated,
      banding: panel.banding,
      units: [...panel.units],
    };

    this.placements.push(placement);

    // Perform Guillotine cutting split (Shorter Leftover Axis Split - SLAS)
    const leftoverLength = chosen.length - pLength - kerf;
    const leftoverWidth = chosen.width - pWidth - kerf;

    if (chosen.length - pLength <= chosen.width - pWidth) {
      // Split horizontally (cut along length first)
      const right = {
        x: chosen.x + pLength + kerf,
        y: chosen.y,
        length: leftoverLength,
        width: pWidth,
      };
      const top = {
        x: chosen.x,
        y: chosen.y + pWidth + kerf,
        length: chosen.length,
        width: leftoverWidth,
      };

      if (right.length > 0 && right.width > 0) this.freeRectangles.push(right);
      if (top.length > 0 && top.width > 0) this.freeRectangles.push(top);
    } else {
      // Split vertically (cut along width first)
      const right = {
        x: chosen.x + pLength + kerf,
        y: chosen.y,
        length: leftoverLength,
        width: chosen.width,
      };
      const top = {
        x: chosen.x,
        y: chosen.y + pWidth + kerf,
        length: pLength,
        width: leftoverWidth,
      };

      if (right.length > 0 && right.width > 0) this.freeRectangles.push(right);
      if (top.length > 0 && top.width > 0) this.freeRectangles.push(top);
    }

    return placement;
  }

  public getPlacements(): NestedPanelPlacement[] {
    return [...this.placements];
  }

  public getFreeRectangles(): FreeRectangle[] {
    return [...this.freeRectangles];
  }

  public getUsedAreaMm2(): number {
    return this.placements.reduce((sum, p) => sum + p.length * p.width, 0);
  }

  public getUsableAreaMm2(): number {
    const usableLength = Math.max(0, this.board.length - 2 * this.board.trimMargin);
    const usableWidth = Math.max(0, this.board.width - 2 * this.board.trimMargin);
    return usableLength * usableWidth;
  }
}
