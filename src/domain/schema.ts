/**
 * The project data model. Every type here is inferred from a Zod schema, so the same definition
 * validates saved files and AI/inspector input at runtime and types the code at compile time.
 *
 * Units: all lengths are integer millimetres in a right-handed room frame — origin at the inner
 * corner of the back and left walls, x along the back wall, z away from it (towards the front),
 * y up. Conversion to Three.js world units happens only in `src/rendering`.
 */
import { z } from 'zod';
import { LENGTH_UNITS } from '@/engine/measurement/units';

export const SCHEMA_VERSION = 2;

/** Integer millimetres. Non-integers are rejected, never rounded silently. */
export const Mm = z.number().int('must be a whole number of millimetres').finite();
export type Millimeters = z.infer<typeof Mm>;
export type EntityId = string;

export const EntityIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

export const WallIdSchema = z.enum(['back', 'left', 'right', 'front']);
export type WallId = z.infer<typeof WallIdSchema>;

/** Elements stand square to a wall; free rotation is out of scope for Phase 1. */
export const RotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
export type Rotation = z.infer<typeof RotationSchema>;

export const CabinetTypeSchema = z.enum(['base', 'wall', 'tall', 'drawer', 'sink', 'corner']);
export type CabinetType = z.infer<typeof CabinetTypeSchema>;

export const ApplianceTypeSchema = z.enum(['fridge', 'range', 'dishwasher', 'hood']);
export type ApplianceType = z.infer<typeof ApplianceTypeSchema>;

export const DimensionsSchema = z.object({ width: Mm.positive(), height: Mm.positive(), depth: Mm.positive() });
export type Dimensions = z.infer<typeof DimensionsSchema>;

/**
 * A footprint-centre coordinate. A unit with an odd width whose edges sit on whole millimetres has
 * its centre on a half millimetre, so centres are multiples of 0.5 mm (edges stay whole).
 */
export const CentreMm = z.number().finite().refine((v) => Number.isInteger(v * 2), 'must be a multiple of 0.5 mm');

/** Centre of the element's footprint at its bottom face (y = elevation above the floor). */
export const PositionSchema = z.object({ x: CentreMm, y: Mm.nonnegative(), z: CentreMm });
export type Position = z.infer<typeof PositionSchema>;

/**
 * Interior fittings, positioned by `y` = height of their underside above the inside floor of the
 * carcass (top of the bottom panel). Heights are the fitting's own vertical extent.
 */
export const FittingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shelf'), y: Mm.nonnegative(), glass: z.boolean().default(false) }),
  z.object({ kind: z.literal('drawer'), y: Mm.nonnegative(), height: Mm.positive() }),
  z.object({ kind: z.literal('rail'), y: Mm.nonnegative() }),
  z.object({ kind: z.literal('plate-rack'), y: Mm.nonnegative(), height: Mm.positive() }),
  z.object({ kind: z.literal('bottle-rack'), y: Mm.nonnegative(), height: Mm.positive() }),
  z.object({ kind: z.literal('basket'), y: Mm.nonnegative(), height: Mm.positive() }),
]);
export type Fitting = z.infer<typeof FittingSchema>;
export type FittingKind = Fitting['kind'];

/** A vertical compartment. `width: null` shares the space left by fixed-width sections equally. */
export const SectionSchema = z.object({ width: Mm.positive().nullable(), fittings: z.array(FittingSchema).max(40) });
export type Section = z.infer<typeof SectionSchema>;

export const InteriorSchema = z.object({ sections: z.array(SectionSchema).min(1).max(6) });
export type Interior = z.infer<typeof InteriorSchema>;

export const FrontStyleSchema = z.enum(['solid', 'glass', 'open']);
export type FrontStyle = z.infer<typeof FrontStyleSchema>;

export const KitchenCabinetSchema = z.object({
  id: EntityIdSchema,
  type: CabinetTypeSchema,
  dimensions: DimensionsSchema,
  position: PositionSchema,
  rotationY: RotationSchema,
  /** Shutter (door/drawer front) finish. The carcass uses the project's carcass surface. */
  materialId: z.string().min(1),
  /** The wall the unit stands against; absent for free-standing (island) units. */
  wallId: WallIdSchema.optional(),
  catalogItemId: z.string().optional(),
  frontStyle: FrontStyleSchema,
  interior: InteriorSchema,
});
export type KitchenCabinet = z.infer<typeof KitchenCabinetSchema>;

export const ApplianceSchema = z.object({
  id: EntityIdSchema,
  type: ApplianceTypeSchema,
  dimensions: DimensionsSchema,
  position: PositionSchema,
  rotationY: RotationSchema,
  wallId: WallIdSchema.optional(),
});
export type Appliance = z.infer<typeof ApplianceSchema>;

export const FurnitureTypeSchema = z.enum([
  'table', 'chair', 'sofa',
  // Rooms beyond the kitchen (whole-home design).
  'bed', 'wardrobe', 'nightstand', 'desk', 'tv-unit', 'coffee-table', 'bookshelf', 'armchair', 'dresser',
  'toilet', 'basin', 'shower', 'bathtub', 'stairs',
]);
export type FurnitureType = z.infer<typeof FurnitureTypeSchema>;

/** Loose furniture and fixtures (tables, beds, wardrobes, bathroom fittings…): floor-standing, resizable, with a finish. */
export const FurnitureSchema = z.object({
  kind: z.literal('furniture'),
  id: EntityIdSchema,
  type: FurnitureTypeSchema,
  dimensions: DimensionsSchema,
  position: PositionSchema,
  rotationY: RotationSchema,
  wallId: WallIdSchema.optional(),
  materialId: z.string().min(1),
});
export type Furniture = z.infer<typeof FurnitureSchema>;

export type KitchenElement = KitchenCabinet | Appliance | Furniture;

export const MaterialCategorySchema = z.enum(['shutter', 'carcass', 'countertop', 'floor', 'wall']);
export type MaterialCategory = z.infer<typeof MaterialCategorySchema>;

/** The surface pattern drawn over a finish's colour (generated in the browser, at real scale). */
export const MaterialTextureSchema = z.enum(['plain', 'wood', 'planks', 'marble', 'tile', 'terrazzo', 'concrete', 'plaster', 'stone', 'fabric', 'brick']);
export type MaterialTexture = z.infer<typeof MaterialTextureSchema>;

export const KitchenMaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: MaterialCategorySchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be #rrggbb'),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1).default(0),
  /** Optional (older files have none): the pattern and its repeat size in mm (plank width, tile size…). */
  texture: MaterialTextureSchema.optional(),
  textureScale: z.number().min(20).max(5000).optional(),
});
export type KitchenMaterial = z.infer<typeof KitchenMaterialSchema>;

export const ROOM_LIMITS = {
  width: { min: 1500, max: 12000 },
  length: { min: 1500, max: 12000 },
  height: { min: 2100, max: 4000 },
  wallThickness: { min: 50, max: 400 },
} as const;

const between = (label: string, { min, max }: { min: number; max: number }) =>
  Mm.min(min, `${label} must be at least ${min} mm`).max(max, `${label} must be at most ${max} mm`);

export const RoomSchema = z.object({
  width: between('Room width', ROOM_LIMITS.width),
  length: between('Room length', ROOM_LIMITS.length),
  height: between('Ceiling height', ROOM_LIMITS.height),
  wallThickness: between('Wall thickness', ROOM_LIMITS.wallThickness),
});
export type Room = z.infer<typeof RoomSchema>;

export const SurfaceSchema = z.enum(['floor', 'wall', 'countertop', 'carcass']);
export type Surface = z.infer<typeof SurfaceSchema>;

export const SurfacesSchema = z.object({
  floor: z.string().min(1),
  wall: z.string().min(1),
  countertop: z.string().min(1),
  carcass: z.string().min(1),
});
export type Surfaces = z.infer<typeof SurfacesSchema>;

export const OpeningKindSchema = z.enum(['door', 'window', 'opening']);
export type OpeningKind = z.infer<typeof OpeningKindSchema>;

/**
 * A door, window or plain opening in a wall. `offset` is measured like units: from the start of
 * the wall to the opening's nearest edge. `sill` is the bottom of the opening above the floor.
 * Doors swing into the room (`in`), out of it (`out`) or slide (`none`), hinged on the `hinge` side
 * as seen from inside the room.
 */
export const OpeningSchema = z.object({
  id: EntityIdSchema,
  kind: OpeningKindSchema,
  wallId: WallIdSchema,
  offset: Mm.nonnegative(),
  width: Mm.positive(),
  height: Mm.positive(),
  sill: Mm.nonnegative(),
  swing: z.enum(['in', 'out', 'none']),
  hinge: z.enum(['left', 'right']),
});
export type Opening = z.infer<typeof OpeningSchema>;

/** A saved place to stand and look from (walk mode), e.g. "At the hob". Angles in radians. */
export const ViewpointSchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(60),
  x: Mm,
  z: Mm,
  yaw: z.number().finite(),
  pitch: z.number().min(-Math.PI / 2).max(Math.PI / 2),
  eye: Mm.min(600).max(2200),
});
export type Viewpoint = z.infer<typeof ViewpointSchema>;

/**
 * Production settings for workshop outputs. Everything is optional: an unset field is reported as
 * missing by the readiness check instead of being assumed. `constructionId` names a rule set in
 * `engine/deliverables/construction.ts`.
 */
export const ProductionSettingsSchema = z
  .object({
    constructionId: z.string().trim().min(1).max(40).optional(),
    hinge: z.string().trim().min(1).max(80).optional(),
    drawerRunner: z.string().trim().min(1).max(80).optional(),
    handle: z.string().trim().min(1).max(80).optional(),
    /** Saw and offcut allowance applied to board estimates, in percent. */
    wastePercent: z.number().min(0).max(50).optional(),
    /** Prices for estimates only; currency is a label. */
    prices: z
      .object({
        currency: z.string().trim().length(3),
        boardPerM2: z.number().nonnegative().optional(),
        bandingPerM: z.number().nonnegative().optional(),
        worktopPerM: z.number().nonnegative().optional(),
      })
      .optional(),
  })
  .strict();
export type ProductionSettings = z.infer<typeof ProductionSettingsSchema>;

export const KitchenProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(120),
  room: RoomSchema,
  surfaces: SurfacesSchema,
  cabinets: z.array(KitchenCabinetSchema),
  appliances: z.array(ApplianceSchema),
  materials: z.record(z.string(), KitchenMaterialSchema),
  /** Optional and defaulted, so files saved before viewpoints existed still load unchanged. */
  viewpoints: z.array(ViewpointSchema).max(50).default([]),
  /** Loose furniture; optional and defaulted (no schema bump). */
  furniture: z.array(FurnitureSchema).max(100).default([]),
  /** How lengths are shown and typed. Display only: geometry is always stored in millimetres. */
  preferences: z.object({ unit: z.enum(LENGTH_UNITS) }).default({ unit: 'mm' }),
  /** Doors, windows and openings; optional and defaulted like `viewpoints`. */
  openings: z.array(OpeningSchema).max(40).default([]),
  /** Workshop settings; optional and defaulted (no schema bump). */
  production: ProductionSettingsSchema.default({}),
});
export type KitchenProject = z.infer<typeof KitchenProjectSchema>;

export function isCabinet(el: KitchenElement): el is KitchenCabinet {
  return 'interior' in el;
}

export function isFurniture(el: KitchenElement): el is Furniture {
  return 'kind' in el && el.kind === 'furniture';
}

/** Which spec table an element's type belongs to. */
export function categoryOf(el: KitchenElement): 'cabinet' | 'appliance' | 'furniture' {
  return isCabinet(el) ? 'cabinet' : isFurniture(el) ? 'furniture' : 'appliance';
}

/** Readable one-line messages from a Zod error, e.g. "room.width: Room width must be at least 1500 mm". */
export function zodMessages(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}
