import { z } from 'zod';

/**
 * Tenant-level factory joinery rules and machine parameters.
 * All dimensions are in integer millimetres unless specified.
 */
export const RulePackSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  carcassThickness: z.number().int().min(12).max(25), // Standard: 18mm
  shutterThickness: z.number().int().min(12).max(25), // Standard: 18mm
  backPanelThickness: z.number().int().min(3).max(18), // Standard: 8mm
  backPanelGrooveDepth: z.number().int().min(3).max(12), // Standard: 6mm
  backPanelGrooveOffset: z.number().int().min(10).max(30), // Standard: 16mm from back
  doorReveal: z.number().int().min(1).max(10), // Standard: 3mm gap around doors
  shelfSetback: z.number().int().min(0).max(50), // Standard: 20mm from front
  plinthHeight: z.number().int().min(50).max(180), // Standard: 100mm
  system32Pitch: z.number().int().default(32), // 32mm system pitch
  edgeBandThicknessCarcass: z.number().min(0.4).max(3.0), // Standard: 0.8mm PVC
  edgeBandThicknessShutter: z.number().min(0.4).max(3.0), // Standard: 2.0mm ABS
  edgeBandCodes: z.object({
    carcassExposed: z.string().default('EB-0.8-PVC'),
    carcassHidden: z.string().default('EB-0.4-PVC'),
    shutter: z.string().default('EB-2.0-ABS'),
  }),
});

export type RulePack = z.infer<typeof RulePackSchema>;

/**
 * Authoritative Indian Modular Factory Joinery Rule Pack (seed-v1).
 * Standardized on 18mm carcase, 8mm back panel, 3mm reveals, 32mm drilling grid.
 */
export const SEED_RULE_PACK_V1: RulePack = {
  id: 'rulepack-in-standard-v1',
  name: 'Indian Standard 18mm Factory Joinery (seed-v1)',
  version: 1,
  carcassThickness: 18,
  shutterThickness: 18,
  backPanelThickness: 8,
  backPanelGrooveDepth: 6,
  backPanelGrooveOffset: 16,
  doorReveal: 3,
  shelfSetback: 20,
  plinthHeight: 100,
  system32Pitch: 32,
  edgeBandThicknessCarcass: 0.8,
  edgeBandThicknessShutter: 2.0,
  edgeBandCodes: {
    carcassExposed: 'EB-0.8-PVC',
    carcassHidden: 'EB-0.4-PVC',
    shutter: 'EB-2.0-ABS',
  },
};

