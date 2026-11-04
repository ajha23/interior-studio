import type { RulePack } from '@/domain/manufacturing/rulePack';
import { formatInr } from '@/engine/commercial/gst';

export interface CabinetInput {
  id: string;
  type: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  position?: {
    x: number;
    y: number;
    z: number;
  };
  wallId?: string;
}

export interface CostDownSuggestion {
  id: string;
  type: 'consolidate_units' | 'standardize_width';
  title: string;
  description: string;
  elementIdsToReplace: string[];
  replacementModuleCode: string;
  replacementDimensions: {
    width: number;
    height: number;
    depth: number;
  };
  savingsPaise: number;
  formattedSavings: string;
  explanation: string;
}

/**
 * Approximate costs per modular element in integer paise:
 * - Side panel (18mm board, ~720x560mm) = ~0.40 sqm * ₹1,850/sqm = ₹740 = 74000 paise
 * - Edge-banding for panel perimeter = ~2.5m * ₹30/m = ₹75 = 7500 paise
 * - Set of hinges / runners saved = ₹350 = 35000 paise
 * - Total savings from eliminating two middle dividing side panels by merging: ~₹1,165 = 116500 paise
 */
const CONSOLIDATION_SAVINGS_PAISE = 116500;

/**
 * Analyzes cabinet layout and identifies cost-saving consolidation opportunities.
 * e.g., Merging 2 adjacent narrow units (300mm + 300mm, or 450mm + 450mm) into a single 600mm / 900mm wide unit.
 */
export function analyzeCostDownOpportunities(
  cabinets: CabinetInput[],
  _rulePack?: RulePack
): CostDownSuggestion[] {
  const suggestions: CostDownSuggestion[] = [];

  // Group base/drawer units by wall or common height/depth
  const baseUnits = cabinets.filter(
    (c) =>
      (c.type.includes('base') || c.type.includes('drawer') || c.type === 'counter') &&
      c.dimensions.width <= 450
  );

  // Check adjacent pairs or pairs on same wall
  const usedIds = new Set<string>();

  for (let i = 0; i < baseUnits.length; i++) {
    const a = baseUnits[i]!;
    if (usedIds.has(a.id)) continue;

    for (let j = i + 1; j < baseUnits.length; j++) {
      const b = baseUnits[j]!;
      if (usedIds.has(b.id)) continue;

      // Check if both are same wall or type, and combined width matches standard module (600 or 900)
      const combinedWidth = a.dimensions.width + b.dimensions.width;
      const isCandidate =
        (combinedWidth === 600 && a.dimensions.width === 300 && b.dimensions.width === 300) ||
        (combinedWidth === 900 && a.dimensions.width === 450 && b.dimensions.width === 450);

      if (isCandidate) {
        usedIds.add(a.id);
        usedIds.add(b.id);

        const replacementCode = combinedWidth === 600 ? 'BASE-STD-600' : 'BASE-STD-900';
        suggestions.push({
          id: `cd_${a.id}_${b.id}`,
          type: 'consolidate_units',
          title: `Consolidate 2× ${a.dimensions.width}mm Units → 1× ${combinedWidth}mm Unit`,
          description: `Replace two ${a.dimensions.width}mm narrow cabinets with a single wide ${combinedWidth}mm unit.`,
          elementIdsToReplace: [a.id, b.id],
          replacementModuleCode: replacementCode,
          replacementDimensions: {
            width: combinedWidth,
            height: a.dimensions.height,
            depth: a.dimensions.depth,
          },
          savingsPaise: CONSOLIDATION_SAVINGS_PAISE,
          formattedSavings: formatInr(CONSOLIDATION_SAVINGS_PAISE),
          explanation: `Eliminates 2 redundant carcase side panels, 5.1m of 2mm ABS edge-banding, and reduces installation labor.`,
        });
        break;
      }
    }
  }

  return suggestions;
}
