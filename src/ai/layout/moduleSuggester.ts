import { STANDARD_MODULES, type ModuleDefinition } from '@/domain/manufacturing/moduleDefinition';

export interface ModuleSuggestionRequest {
  wallLengthMm: number;
  categoryPreference?: 'kitchen' | 'wardrobe';
  includeSink?: boolean;
  includeDrawers?: boolean;
}

export interface SuggestedModulePlacement {
  moduleCode: string;
  name: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  offsetMm: number;
  definition: ModuleDefinition;
}

export interface ModuleSuggestionResult {
  totalOccupiedWidthMm: number;
  remainingFillerMm: number;
  modules: SuggestedModulePlacement[];
}

/**
 * Generates an optimal sequential module layout from the standard module catalog
 * to populate a given wall length with zero collisions and exact integer millimetre tolerances.
 */
export function suggestModuleSequence(request: ModuleSuggestionRequest): ModuleSuggestionResult {
  const { wallLengthMm, categoryPreference = 'kitchen', includeSink = true, includeDrawers = true } = request;

  const placements: SuggestedModulePlacement[] = [];
  let currentOffset = 0;
  let remaining = wallLengthMm;

  if (categoryPreference === 'wardrobe') {
    // Fill wardrobe wall using standard 900mm 2-door wardrobes and 1500mm sliding wardrobes
    const slideMod = STANDARD_MODULES['WARDROBE-SLIDE']!;
    const hingedMod = STANDARD_MODULES['WARDROBE-2D']!;

    while (remaining >= slideMod.defaultDimensions.width) {
      placements.push({
        moduleCode: slideMod.code,
        name: slideMod.name,
        widthMm: slideMod.defaultDimensions.width,
        heightMm: slideMod.defaultDimensions.height,
        depthMm: slideMod.defaultDimensions.depth,
        offsetMm: currentOffset,
        definition: slideMod,
      });
      currentOffset += slideMod.defaultDimensions.width;
      remaining -= slideMod.defaultDimensions.width;
    }

    while (remaining >= hingedMod.defaultDimensions.width) {
      placements.push({
        moduleCode: hingedMod.code,
        name: hingedMod.name,
        widthMm: hingedMod.defaultDimensions.width,
        heightMm: hingedMod.defaultDimensions.height,
        depthMm: hingedMod.defaultDimensions.depth,
        offsetMm: currentOffset,
        definition: hingedMod,
      });
      currentOffset += hingedMod.defaultDimensions.width;
      remaining -= hingedMod.defaultDimensions.width;
    }

    return {
      totalOccupiedWidthMm: currentOffset,
      remainingFillerMm: remaining,
      modules: placements,
    };
  }

  // Kitchen layout sequence: Sink Base (900mm) -> Drawers (600mm) -> Standard Bases (600mm / 450mm)
  if (includeSink && remaining >= 900) {
    const sinkDef = STANDARD_MODULES['SINK-BASE']!;
    placements.push({
      moduleCode: sinkDef.code,
      name: sinkDef.name,
      widthMm: 900,
      heightMm: sinkDef.defaultDimensions.height,
      depthMm: sinkDef.defaultDimensions.depth,
      offsetMm: currentOffset,
      definition: sinkDef,
    });
    currentOffset += 900;
    remaining -= 900;
  }

  if (includeDrawers && remaining >= 600) {
    const drawerDef = STANDARD_MODULES['DRAWER-3B']!;
    placements.push({
      moduleCode: drawerDef.code,
      name: drawerDef.name,
      widthMm: 600,
      heightMm: drawerDef.defaultDimensions.height,
      depthMm: drawerDef.defaultDimensions.depth,
      offsetMm: currentOffset,
      definition: drawerDef,
    });
    currentOffset += 600;
    remaining -= 600;
  }

  // Fill remainder with Standard Base units (600mm primary, then 450mm, then 300mm)
  const baseDef = STANDARD_MODULES['BASE-STD']!;
  while (remaining >= 600) {
    placements.push({
      moduleCode: baseDef.code,
      name: baseDef.name,
      widthMm: 600,
      heightMm: baseDef.defaultDimensions.height,
      depthMm: baseDef.defaultDimensions.depth,
      offsetMm: currentOffset,
      definition: baseDef,
    });
    currentOffset += 600;
    remaining -= 600;
  }

  if (remaining >= 450) {
    placements.push({
      moduleCode: baseDef.code,
      name: `${baseDef.name} (450mm)`,
      widthMm: 450,
      heightMm: baseDef.defaultDimensions.height,
      depthMm: baseDef.defaultDimensions.depth,
      offsetMm: currentOffset,
      definition: baseDef,
    });
    currentOffset += 450;
    remaining -= 450;
  } else if (remaining >= 300) {
    placements.push({
      moduleCode: baseDef.code,
      name: `${baseDef.name} (300mm)`,
      widthMm: 300,
      heightMm: baseDef.defaultDimensions.height,
      depthMm: baseDef.defaultDimensions.depth,
      offsetMm: currentOffset,
      definition: baseDef,
    });
    currentOffset += 300;
    remaining -= 300;
  }

  return {
    totalOccupiedWidthMm: currentOffset,
    remainingFillerMm: remaining,
    modules: placements,
  };
}

