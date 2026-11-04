/**
 * Nesting Engine Interface Contract
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (Framework-free TypeScript)
 */

import type {
  InputNestingPanel,
  RawBoardStock,
  NestingMode,
  NestingResult,
  NestedSheet,
} from '../../src/engine/production/nesting/types';

export interface NestingOptimizationOptions {
  mode?: NestingMode; // 'guillotine' (default) | 'cnc_router'
  defaultBoard?: Partial<RawBoardStock>;
  reusableOffcutMinSize?: number; // default 600 mm
  allowRotationDefault?: boolean; // default true for non-grain locked parts
}

export interface NestingOptimizationRequest {
  panels: InputNestingPanel[];
  options?: NestingOptimizationOptions;
}

export interface INestingEngine {
  /**
   * Optimizes panel cutting layout across raw boards.
   * Segregates panels by (material, thickness) and packs each material into sheets.
   */
  optimize(request: NestingOptimizationRequest): NestingResult;

  /**
   * Packs a single material group into one or more sheets using selected nesting algorithm.
   */
  packMaterialGroup(
    material: string,
    thickness: number,
    panels: InputNestingPanel[],
    options?: NestingOptimizationOptions
  ): NestedSheet[];
}
