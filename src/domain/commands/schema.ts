/**
 * Design commands: the only way a project changes. The inspector, catalogue, keyboard shortcuts
 * and (later) the AI copilot all produce these, so the same edit always has the same result.
 * The schema is the contract an AI adapter must satisfy; anything it emits is parsed here first.
 */
import { z } from 'zod';
import { INTERIOR_PRESETS } from '../furniture/interior';
import {
  ApplianceTypeSchema,
  CabinetTypeSchema,
  DimensionsSchema,
  EntityIdSchema,
  FrontStyleSchema,
  InteriorSchema,
  CentreMm,
  Mm,
  RoomSchema,
  RotationSchema,
  SurfaceSchema,
  ViewpointSchema,
  WallIdSchema,
} from '../schema';

export const LayoutSchema = z.enum(['straight', 'l-shaped', 'empty']);
export type Layout = z.infer<typeof LayoutSchema>;

/** Where on a wall an element goes. Omit it to place the element in the first free spot. */
export const PlacementSchema = z.object({
  wallId: WallIdSchema,
  offset: Mm.nonnegative(),
  /** Height of the bottom face above the floor; defaults to the element type's standard. */
  elevation: Mm.nonnegative().optional(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const DesignCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_room'), room: RoomSchema }),
  z.object({ type: z.literal('apply_layout'), layout: LayoutSchema }),
  z.object({ type: z.literal('rename_project'), name: z.string().trim().min(1, 'Project name cannot be empty').max(120) }),
  z.object({
    type: z.literal('add_cabinet'),
    cabinetType: CabinetTypeSchema,
    id: EntityIdSchema.optional(),
    dimensions: DimensionsSchema.optional(),
    materialId: z.string().optional(),
    placement: PlacementSchema.optional(),
  }),
  z.object({
    type: z.literal('add_appliance'),
    applianceType: ApplianceTypeSchema,
    id: EntityIdSchema.optional(),
    width: Mm.positive().optional(),
    placement: PlacementSchema.optional(),
  }),
  z.object({ type: z.literal('resize_cabinet'), cabinetId: EntityIdSchema, dimensions: DimensionsSchema }),
  z.object({ type: z.literal('resize_appliance'), applianceId: EntityIdSchema, width: Mm.positive() }),
  z.object({ type: z.literal('move_entity'), entityId: EntityIdSchema, placement: PlacementSchema }),
  /** Free-standing placement: footprint centre in room millimetres and a rotation (floor units only). */
  z.object({ type: z.literal('place_entity'), entityId: EntityIdSchema, x: CentreMm, z: CentreMm, rotationY: RotationSchema }),
  z.object({ type: z.literal('rotate_entity'), entityId: EntityIdSchema, rotationY: RotationSchema }),
  z.object({ type: z.literal('set_interior'), cabinetId: EntityIdSchema, interior: InteriorSchema }),
  z.object({ type: z.literal('set_front_style'), cabinetId: EntityIdSchema, style: FrontStyleSchema }),
  z.object({ type: z.literal('apply_interior_preset'), cabinetId: EntityIdSchema, preset: z.enum(INTERIOR_PRESETS), count: z.number().int().min(1).max(12).optional() }),
  z.object({ type: z.literal('set_material'), targetIds: z.array(EntityIdSchema).min(1), materialId: z.string().min(1) }),
  z.object({ type: z.literal('set_surface_material'), surface: SurfaceSchema, materialId: z.string().min(1) }),
  z.object({ type: z.literal('remove_entity'), entityId: EntityIdSchema }),
  z.object({ type: z.literal('save_viewpoint'), viewpoint: ViewpointSchema.omit({ id: true }).extend({ id: EntityIdSchema.optional() }) }),
  z.object({ type: z.literal('delete_viewpoint'), id: EntityIdSchema }),
]);
export type DesignCommand = z.infer<typeof DesignCommandSchema>;

export interface CommandResult {
  success: boolean;
  errors: string[];
  affectedEntityIds: string[];
  /** Short past-tense description for history and status messages. */
  summary: string;
}
