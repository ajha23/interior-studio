/**
 * Reusable Offcut vs. Scrap Classifier
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (100% Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I, Principle III
 */

import { REUSABLE_OFFCUT_MIN_DIMENSION, type OffcutRectangle } from './types';
import type { FreeRectangle } from './guillotineBinPacker';

export interface OffcutClassificationResult {
  reusable: OffcutRectangle[];
  scrap: OffcutRectangle[];
  totalSalvageAreaMm2: number;
  totalScrapAreaMm2: number;
}

/**
 * Classifies unallocated rectangular free zones into reusable salvage vs scrap.
 * Standard Indian Workshop threshold: both dimensions >= 600 mm qualify as reusable offcuts.
 */
export function classifyOffcuts(
  freeRectangles: FreeRectangle[],
  threshold = REUSABLE_OFFCUT_MIN_DIMENSION
): OffcutClassificationResult {
  const reusable: OffcutRectangle[] = [];
  const scrap: OffcutRectangle[] = [];
  let totalSalvageAreaMm2 = 0;
  let totalScrapAreaMm2 = 0;

  for (const rect of freeRectangles) {
    const length = Math.round(rect.length);
    const width = Math.round(rect.width);
    const areaMm2 = length * width;

    if (areaMm2 <= 0) continue;

    const isReusable = length >= threshold && width >= threshold;
    const offcut: OffcutRectangle = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      length,
      width,
      areaMm2,
      isReusable,
    };

    if (isReusable) {
      reusable.push(offcut);
      totalSalvageAreaMm2 += areaMm2;
    } else {
      scrap.push(offcut);
      totalScrapAreaMm2 += areaMm2;
    }
  }

  return {
    reusable,
    scrap,
    totalSalvageAreaMm2,
    totalScrapAreaMm2,
  };
}
