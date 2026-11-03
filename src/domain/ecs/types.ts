/**
 * Entity-Component-System (ECS) data model for Unified Studio.
 * Standardizes walls, openings, cabinetry, appliances, loose furniture, and MEP fixtures
 * into lightweight normalized entities with modular components.
 */
import { z } from 'zod';
import { Mm, RotationSchema } from '../schema';

export const TransformComponentSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  width: Mm.positive(),
  height: Mm.positive(),
  depth: Mm.positive(),
  rotation: RotationSchema,
});
export type TransformComponent = z.infer<typeof TransformComponentSchema>;

export const MaterialComponentSchema = z.object({
  materialId: z.string().min(1),
  finishCategory: z.string().min(1),
  finishName: z.string().min(1),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  textureUri: z.string().optional(),
});
export type MaterialComponent = z.infer<typeof MaterialComponentSchema>;

export const PricingComponentSchema = z.object({
  hsnSacCode: z.string().min(1),
  unitRatePaise: z.number().int().nonnegative(),
  marginPercent: z.number().min(0).max(100),
  itemType: z.enum(['goods', 'services']),
});
export type PricingComponent = z.infer<typeof PricingComponentSchema>;

export const EdgeBandSpecSchema = z.object({
  l1: z.string().optional(),
  l2: z.string().optional(),
  w1: z.string().optional(),
  w2: z.string().optional(),
});
export type EdgeBandSpec = z.infer<typeof EdgeBandSpecSchema>;

export const ManufacturingComponentSchema = z.object({
  rulePackId: z.string().min(1),
  rulePackVersion: z.number().int().positive(),
  isManufacturable: z.boolean(),
  edgeBandSpec: EdgeBandSpecSchema.optional(),
});
export type ManufacturingComponent = z.infer<typeof ManufacturingComponentSchema>;

export const WorkspaceEntityTypeSchema = z.enum([
  'wall',
  'opening',
  'cabinet',
  'appliance',
  'furniture',
  'fixture',
]);
export type WorkspaceEntityType = z.infer<typeof WorkspaceEntityTypeSchema>;

export const WorkspaceEntitySchema = z.object({
  id: z.string().min(1),
  entityType: WorkspaceEntityTypeSchema,
  name: z.string().min(1),
  layer: z.string().min(1),
  transform: TransformComponentSchema,
  material: MaterialComponentSchema.optional(),
  pricing: PricingComponentSchema.optional(),
  manufacturing: ManufacturingComponentSchema.optional(),
  customComponents: z.record(z.string(), z.unknown()).optional(),
});
export type WorkspaceEntity = z.infer<typeof WorkspaceEntitySchema>;

