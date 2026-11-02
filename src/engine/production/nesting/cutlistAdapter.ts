/**
 * Cut List to Nesting Panel Adapter
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I, Principle III
 */

import type { CutList } from '../cutlist';
import { inferGrainFromPart } from './grainPolicy';
import type { InputNestingPanel } from './types';

/**
 * Converts PanelRow records from standard project CutList into InputNestingPanel array.
 */
export function adaptCutListToNestingPanels(cutList: CutList): InputNestingPanel[] {
  const result: InputNestingPanel[] = [];

  for (let i = 0; i < cutList.panels.length; i++) {
    const row = cutList.panels[i];
    if (!row) continue;
    result.push({
      id: `panel_${i + 1}`,
      partName: row.part,
      material: row.material,
      thickness: row.thickness,
      length: row.length,
      width: row.width,
      qty: row.qty,
      grain: inferGrainFromPart(row.part),
      banding: row.banding,
      units: [...row.units],
    });
  }

  return result;
}

/**
 * Expands a list of InputNestingPanels (where qty >= 1) into individual single-piece panels (qty = 1).
 * Each expanded panel receives a unique deterministic ID for tracking and labeling.
 */
export function expandPanelsForNesting(panels: InputNestingPanel[]): InputNestingPanel[] {
  const expanded: InputNestingPanel[] = [];

  for (const panel of panels) {
    const count = Math.max(1, Math.round(panel.qty));
    for (let i = 0; i < count; i++) {
      expanded.push({
        ...panel,
        id: count === 1 ? panel.id : `${panel.id}#${i + 1}`,
        qty: 1,
      });
    }
  }

  return expanded;
}
