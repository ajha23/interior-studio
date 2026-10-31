/**
 * One flat, read-only view of everything a request can refer to: units, appliances, furniture,
 * openings and the four walls, each with its stable id, a readable label and where it sits.
 */
import {
  allElements,
  categoryOf,
  elementLabel,
  OPENING_SPECS,
  specOf,
  spanAlongWall,
  WALL_LABEL,
  WALLS,
  wallLength,
  type KitchenElement,
  type KitchenProject,
  type Opening,
  type WallId,
} from '@/domain';
import { elementBox, type Box } from '@/engine/geometry/box';

export type EntityCategory = 'cabinet' | 'appliance' | 'furniture' | 'opening' | 'wall';

export interface Entity {
  id: string;
  category: EntityCategory;
  /** Cabinet/appliance/furniture type, opening kind, or "wall". */
  type: string;
  label: string;
  wallId?: WallId;
  /** Start and end along the wall (mm from the wall's start); absent for free-standing items. */
  span?: { start: number; end: number };
  /** Bottom above the floor (mm): elevation of units, sill of openings. */
  bottom: number;
  top: number;
  width: number;
  /** Plan box for free-standing adjacency (mm). */
  box?: Box;
  element?: KitchenElement;
  opening?: Opening;
}

export const WALL_ENTITY_ID: Record<WallId, string> = { back: 'wall-back', left: 'wall-left', right: 'wall-right', front: 'wall-front' };

export function wallOfEntityId(id: string): WallId | null {
  const m = /^wall-(back|left|right|front)$/.exec(id);
  return m ? (m[1] as WallId) : null;
}

/**
 * +1 when an object's own right (as seen facing it from the room) points along increasing offset
 * on this wall, −1 when it points back towards the wall's start.
 */
export const RIGHT_ALONG: Record<WallId, 1 | -1> = { back: 1, right: 1, left: -1, front: -1 };

export function elementEntity(el: KitchenElement): Entity {
  const box = elementBox(el);
  return {
    id: el.id,
    category: categoryOf(el),
    type: el.type,
    label: elementLabel(el),
    wallId: el.wallId,
    span: el.wallId ? spanAlongWall(el) : undefined,
    bottom: el.position.y,
    top: el.position.y + el.dimensions.height,
    width: el.dimensions.width,
    box,
    element: el,
  };
}

export function openingEntity(o: Opening): Entity {
  return {
    id: o.id,
    category: 'opening',
    type: o.kind,
    label: `${OPENING_SPECS[o.kind].label} ${o.width} on the ${o.wallId} wall`,
    wallId: o.wallId,
    span: { start: o.offset, end: o.offset + o.width },
    bottom: o.sill,
    top: o.sill + o.height,
    width: o.width,
    opening: o,
  };
}

export function wallEntity(project: KitchenProject, wall: WallId): Entity {
  const len = wallLength(project.room, wall);
  return { id: WALL_ENTITY_ID[wall], category: 'wall', type: 'wall', label: WALL_LABEL[wall], wallId: wall, span: { start: 0, end: len }, bottom: 0, top: project.room.height, width: len };
}

export function entitiesOf(project: KitchenProject): Entity[] {
  return [...allElements(project).map(elementEntity), ...project.openings.map(openingEntity), ...WALLS.map((w) => wallEntity(project, w))];
}

export function findEntity(project: KitchenProject, id: string): Entity | null {
  const wall = wallOfEntityId(id);
  if (wall) return wallEntity(project, wall);
  const el = allElements(project).find((e) => e.id === id);
  if (el) return elementEntity(el);
  const o = project.openings.find((x) => x.id === id);
  return o ? openingEntity(o) : null;
}

/** A label that tells similar items apart: "Base cabinet 600 on the back wall at 1,300 mm". */
export function describeEntity(e: Entity, fmt: (mm: number) => string = (mm) => `${mm} mm`): string {
  if (e.category === 'wall') return e.label;
  if (!e.wallId) return `${e.label} (free-standing)`;
  return `${e.label} on the ${e.wallId} wall at ${fmt(e.span!.start)}`;
}

export const isWallHung = (e: Entity) => e.element !== undefined && specOf(e.element).mount === 'wall';
