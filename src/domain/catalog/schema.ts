import { z } from 'zod';

export const CatalogPlacementTypeSchema = z.enum([
  'floor',
  'wall_mounted',
  'ceiling_hung',
  'surface_top',
  'embedded',
]);
export type CatalogPlacementType = z.infer<typeof CatalogPlacementTypeSchema>;

export const CatalogDimensionsSchema = z.object({
  width: z.number().int().positive(),
  depth: z.number().int().positive(),
  height: z.number().int().positive(),
  estimated: z.boolean().default(false),
});
export type CatalogDimensions = z.infer<typeof CatalogDimensionsSchema>;

export const CatalogPlacementSchema = z.object({
  type: CatalogPlacementTypeSchema,
  pivot_point: z.string(),
  clearance_mm: z
    .object({
      front: z.number().int().nonnegative().optional(),
      sides: z.number().int().nonnegative().optional(),
      top: z.number().int().nonnegative().optional(),
      bottom: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type CatalogPlacement = z.infer<typeof CatalogPlacementSchema>;

export const CatalogMaterialsAndFinishSchema = z.object({
  primary_material: z.string(),
  frame_material: z.string().optional(),
  color_name: z.string(),
  pbr_roughness_estimate: z.number().min(0).max(1),
  pbr_metalness_estimate: z.number().min(0).max(1),
});
export type CatalogMaterialsAndFinish = z.infer<typeof CatalogMaterialsAndFinishSchema>;

export const CatalogTwoDRepresentationSchema = z.object({
  symbol_type: z.string(),
  footprint_shape: z.string(),
});
export type CatalogTwoDRepresentation = z.infer<typeof CatalogTwoDRepresentationSchema>;

export const CatalogThreeDRequirementsSchema = z.object({
  lod_level: z.enum(['low', 'medium', 'high']),
  polygon_budget_target: z.string(),
  articulations: z.array(z.string()).optional(),
});
export type CatalogThreeDRequirements = z.infer<typeof CatalogThreeDRequirementsSchema>;

export const CatalogCategorySchema = z.object({
  primary: z.string(),
  sub: z.string(),
});
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

export const CatalogItemSchema = z.object({
  asset_id: z.string(),
  item_name: z.string(),
  category: CatalogCategorySchema,
  dimensions_mm: CatalogDimensionsSchema,
  placement: CatalogPlacementSchema,
  materials_and_finish: CatalogMaterialsAndFinishSchema,
  two_d_representation: CatalogTwoDRepresentationSchema,
  three_d_requirements: CatalogThreeDRequirementsSchema,
  tags: z.array(z.string()),
  vendor: z.string().optional(),
  article_number: z.string().optional(),
  target_cabinet_width_mm: z.number().int().positive().optional(),
  target_cabinet_type: z.enum(['base', 'wall', 'tall', 'drawer', 'sink', 'corner']).optional(),
  capacity_liters: z.number().positive().optional(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

