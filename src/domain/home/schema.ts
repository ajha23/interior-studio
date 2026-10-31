/**
 * A whole home (apartment or villa) as rooms on a floor plan. Each room is a complete design in the
 * same model as a single-room project (its own walls, doors, windows, units, furniture and
 * finishes), so every room-level feature works unchanged inside each room; the home adds where the
 * rooms are (inner origin on the plan, level) and what they are for.
 *
 * Plan coordinates are millimetres: x along the plot from its left edge, z from its back edge.
 * A room's `x`/`z` is the back-left inner corner of its floor; its walls are drawn outside that.
 */
import { z } from 'zod';
import { EntityIdSchema, KitchenProjectSchema, Mm, type KitchenProject } from '../schema';

export const HOME_SCHEMA_VERSION = 1;
export const HOME_FORMAT = 'interior-studio/home';

export const RoomTypeSchema = z.enum(['living', 'dining', 'kitchen', 'master-bedroom', 'bedroom', 'bathroom', 'study', 'pooja', 'utility', 'balcony', 'foyer', 'family', 'staircase', 'store']);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living: 'Living room',
  dining: 'Dining',
  kitchen: 'Kitchen',
  'master-bedroom': 'Master bedroom',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  study: 'Study',
  pooja: 'Pooja room',
  utility: 'Utility',
  balcony: 'Balcony',
  foyer: 'Foyer',
  family: 'Family lounge',
  staircase: 'Staircase',
  store: 'Store',
};

export const HomeRoomSchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(60),
  type: RoomTypeSchema,
  /** 0 = ground floor. */
  level: z.number().int().min(0).max(3).default(0),
  x: Mm,
  z: Mm,
  design: KitchenProjectSchema,
});
export type HomeRoom = z.infer<typeof HomeRoomSchema>;

export const HomeSchema = z.object({
  schemaVersion: z.literal(HOME_SCHEMA_VERSION),
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['apartment', 'villa']),
  bhk: z.number().int().min(1).max(6),
  /** Outer footprint of one level, in mm. */
  plot: z.object({ width: Mm.positive(), length: Mm.positive() }),
  levels: z.number().int().min(1).max(3),
  /** Floor-to-floor height (villa levels are stacked by this). */
  floorHeight: Mm.min(2700).max(4500).default(3150),
  rooms: z.array(HomeRoomSchema).min(1).max(40),
  /** Design style the home was generated or restyled with (e.g. "Japandi"). */
  style: z.string().trim().max(60).optional(),
});
export type Home = z.infer<typeof HomeSchema>;

const HomeFileSchema = z.object({ format: z.literal(HOME_FORMAT), schemaVersion: z.literal(HOME_SCHEMA_VERSION), savedAt: z.string(), home: HomeSchema });

export function serializeHome(home: Home, savedAt = new Date()): string {
  return JSON.stringify({ format: HOME_FORMAT, schemaVersion: HOME_SCHEMA_VERSION, savedAt: savedAt.toISOString(), home }, null, 2);
}

export function parseHomeFile(text: string): { ok: true; home: Home } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This is not a valid home file (not JSON).'] };
  }
  const parsed = HomeFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`) };
  return { ok: true, home: parsed.data.home };
}

/** The project id a room is edited under (unique across homes). */
export const roomProjectId = (home: Pick<Home, 'id'>, room: Pick<HomeRoom, 'id'>) => `${home.id}--${room.id}`.slice(0, 64);

/** Inner floor area of a room in m². */
export const roomArea = (r: Pick<HomeRoom, 'design'>) => (r.design.room.width * r.design.room.length) / 1e6;

/** Carpet area of the whole home (sum of room floors) in m² and sq ft. */
export function carpetArea(home: Home): { m2: number; sqft: number } {
  const m2 = home.rooms.reduce((s, r) => s + roomArea(r), 0);
  return { m2, sqft: m2 * 10.7639 };
}

/** A room's design with the home's room name, for the room editor. */
export function roomDesign(home: Home, room: HomeRoom): KitchenProject {
  return { ...room.design, id: roomProjectId(home, room), name: `${home.name} · ${room.name}` };
}
