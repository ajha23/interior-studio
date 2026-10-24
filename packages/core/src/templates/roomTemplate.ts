import { blankProject, newOpening, singleRoomPlan, uid } from '../domain/factory';
import { detectRooms } from '../plan/rooms';
import type { FurnitureItem, Project, RoomInfo } from '../domain/types';
import { mm, type Um } from '../domain/units';
import { bbox, footprint, normDeg } from '../geometry/furniture';
import { centroid, pointInPolygon } from '../plan/polygon';
import type { DetectedRoom } from '../plan/rooms';

/**
 * A room's look, saved for reuse: finishes plus furniture placed relative to the room.
 *
 * Each piece remembers, per axis, whether it hugs the near wall, the far wall, or floats. Applying
 * the template to a room of another size keeps wall-hugging pieces against their walls (a bed stays
 * against its wall, a wardrobe stays in its corner) and scales floating pieces proportionally.
 */
export const ROOM_TEMPLATE_VERSION = 1;

export type Anchor = { to: 'min'; offsetUm: Um } | { to: 'max'; offsetUm: Um } | { to: 'ratio'; ratio: number };

export interface TemplatePiece {
  /** The furniture item without id/position; `rotDeg` is kept. */
  item: Omit<FurnitureItem, 'id' | 'xUm' | 'yUm'>;
  x: Anchor;
  y: Anchor;
}

export interface RoomTemplate {
  version: number;
  floorFinish: string;
  wallColor: string;
  /** Clear size of the room it was made from. */
  widthUm: Um;
  depthUm: Um;
  pieces: TemplatePiece[];
}

/** Pieces within this distance of a wall are treated as standing against it. */
const HUG = mm(600);

export function furnitureInRoom(furniture: FurnitureItem[], room: DetectedRoom): FurnitureItem[] {
  return furniture.filter((f) => pointInPolygon(centroid(footprint(f)), room.interior, mm(1)));
}

export function captureRoomTemplate(room: DetectedRoom, furniture: FurnitureItem[]): RoomTemplate {
  const b = bbox(room.interior);
  const W = b.maxX - b.minX;
  const D = b.maxY - b.minY;
  const pieces = furnitureInRoom(furniture, room).map((f): TemplatePiece => {
    const fb = bbox(footprint(f));
    const axis = (lo: number, hi: number, min: number, max: number, centre: number, size: number): Anchor => {
      const dMin = lo - min;
      const dMax = max - hi;
      if (dMin <= HUG && dMin <= dMax) return { to: 'min', offsetUm: Math.round(centre - min) };
      if (dMax <= HUG) return { to: 'max', offsetUm: Math.round(max - centre) };
      return { to: 'ratio', ratio: size > 0 ? (centre - min) / size : 0.5 };
    };
    const { id: _id, xUm, yUm, ...rest } = f;
    return {
      item: rest,
      x: axis(fb.minX, fb.maxX, b.minX, b.maxX, xUm, W),
      y: axis(fb.minY, fb.maxY, b.minY, b.maxY, yUm, D),
    };
  });
  return { version: ROOM_TEMPLATE_VERSION, floorFinish: room.info.floorFinish, wallColor: room.info.wallColor, widthUm: Math.round(W), depthUm: Math.round(D), pieces };
}

function place(a: Anchor, min: number, max: number): number {
  if (a.to === 'min') return min + a.offsetUm;
  if (a.to === 'max') return max - a.offsetUm;
  return min + a.ratio * (max - min);
}

/** New furniture for `room` from a template, with fresh ids. */
export function instantiateRoomTemplate(t: RoomTemplate, room: DetectedRoom): FurnitureItem[] {
  const b = bbox(room.interior);
  return t.pieces.map((p) => ({
    ...(p.item as FurnitureItem),
    id: uid('item'),
    xUm: Math.round(place(p.x, b.minX, b.maxX)),
    yUm: Math.round(place(p.y, b.minY, b.maxY)),
    rotDeg: normDeg(p.item.rotDeg),
  })) as FurnitureItem[];
}

/** Room properties to store when applying a template (auto rooms get a stored id). */
export function templatedRoomInfo(t: RoomTemplate, room: DetectedRoom): RoomInfo {
  return { ...room.info, id: room.auto ? uid('room') : room.info.id, floorFinish: t.floorFinish, wallColor: t.wallColor };
}

/** Basic shape check for templates read from the database. */
export function isRoomTemplate(v: unknown): v is RoomTemplate {
  const t = v as RoomTemplate;
  return Boolean(t && typeof t === 'object' && t.version === ROOM_TEMPLATE_VERSION && Array.isArray(t.pieces) && typeof t.floorFinish === 'string');
}

/** A new project whose single room matches the template's room size, with the template applied. */
export function projectFromTemplate(name: string, client: string, t: RoomTemplate, roomName: string): Project {
  const base = blankProject(name, client);
  const { plan, walls } = singleRoomPlan(roomName, t.widthUm, t.depthUm);
  const [room] = detectRooms(plan);
  const info = { ...room.info, floorFinish: t.floorFinish, wallColor: t.wallColor };
  const furniture = instantiateRoomTemplate(t, { ...room, info });
  const h = plan.defaultWallThicknessUm / 2;
  return { ...base, plan: { ...plan, rooms: [info] }, furniture, openings: [newOpening('door', walls[2].id, h + mm(200), 1)] };
}

/** A new project with no walls yet, for tracing a floor plan. */
export function emptyProject(name: string, client: string): Project {
  const base = blankProject(name, client);
  return { ...base, plan: { ...base.plan, walls: [], rooms: [] }, openings: [], furniture: [] };
}
