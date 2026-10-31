/**
 * Doors, windows and openings: supported sizes, where they sit in the room, and the zones units
 * must keep clear. All in room millimetres.
 */
import type { Box } from '@/engine/geometry/box';
import type { Opening, OpeningKind, Position, Room, Rotation } from '../schema';
import { WALL_ROTATION, wallLength } from './walls';

export interface OpeningSpec {
  label: string;
  width: { min: number; max: number; default: number };
  height: { min: number; max: number; default: number };
  sill: { min: number; max: number; default: number };
}

export const OPENING_SPECS: Record<OpeningKind, OpeningSpec> = {
  door: { label: 'Door', width: { min: 600, max: 1800, default: 900 }, height: { min: 1900, max: 2400, default: 2100 }, sill: { min: 0, max: 0, default: 0 } },
  window: { label: 'Window', width: { min: 300, max: 3000, default: 1200 }, height: { min: 300, max: 2200, default: 1100 }, sill: { min: 0, max: 1800, default: 1000 } },
  opening: { label: 'Opening', width: { min: 600, max: 3000, default: 1200 }, height: { min: 1900, max: 2600, default: 2100 }, sill: { min: 0, max: 0, default: 0 } },
};

/** How deep (from the wall into the room) an opening's frame reaches for clearance checks. */
const REVEAL = 700;

export function openingLabel(o: Opening): string {
  return `${OPENING_SPECS[o.kind].label.toLowerCase()} on the ${o.wallId} wall`;
}

export function openingSizeErrors(o: Opening): string[] {
  const spec = OPENING_SPECS[o.kind];
  const errors: string[] = [];
  const check = (label: string, v: number, r: { min: number; max: number }) => {
    if (v < r.min || v > r.max) errors.push(r.min === r.max ? `${label} of a ${spec.label.toLowerCase()} is fixed at ${r.min} mm.` : `${label} ${v} mm is outside the ${spec.label.toLowerCase()} range ${r.min}–${r.max} mm.`);
  };
  check('Width', o.width, spec.width);
  check('Height', o.height, spec.height);
  check('Sill', o.sill, spec.sill);
  return errors;
}

/** The slab of room in front of the opening (up to REVEAL deep) where nothing may stand. */
export function openingZone(room: Room, o: Opening): Box {
  const along = { start: o.offset, end: o.offset + o.width };
  const y = { minY: o.sill, maxY: o.sill + o.height };
  switch (o.wallId) {
    case 'back':
      return { minX: along.start, maxX: along.end, minZ: 0, maxZ: REVEAL, ...y };
    case 'front':
      return { minX: along.start, maxX: along.end, minZ: room.length - REVEAL, maxZ: room.length, ...y };
    case 'left':
      return { minX: 0, maxX: REVEAL, minZ: along.start, maxZ: along.end, ...y };
    case 'right':
      return { minX: room.width - REVEAL, maxX: room.width, minZ: along.start, maxZ: along.end, ...y };
  }
}

/** Floor area an inward-swinging door sweeps: a square as deep as the door is wide. */
export function swingZone(room: Room, o: Opening): Box | null {
  if (o.kind !== 'door' || o.swing !== 'in') return null;
  const z = openingZone(room, o);
  const d = o.width;
  const floor = { minY: 0, maxY: o.height };
  switch (o.wallId) {
    case 'back':
      return { ...z, ...floor, maxZ: d };
    case 'front':
      return { ...z, ...floor, minZ: room.length - d };
    case 'left':
      return { ...z, ...floor, maxX: d };
    case 'right':
      return { ...z, ...floor, minX: room.width - d };
  }
}

/** Where along its wall an opening runs, and whether that is inside the wall. */
export function openingFits(room: Room, o: Opening): boolean {
  return o.offset >= 0 && o.offset + o.width <= wallLength(room, o.wallId) && o.sill + o.height <= room.height;
}

export function openingSpan(o: Opening): { start: number; end: number } {
  return { start: o.offset, end: o.offset + o.width };
}


/**
 * The opening's own frame, like a unit's: origin at the bottom centre of the opening on the inside
 * face of the wall, local +z into the room, local −x on the left as seen from inside the room.
 */
export function openingPlacement(room: Room, o: Opening): { position: Position; rotationY: Rotation } {
  const along = o.offset + o.width / 2;
  const position: Position =
    o.wallId === 'back' ? { x: along, y: 0, z: 0 }
    : o.wallId === 'front' ? { x: along, y: 0, z: room.length }
    : o.wallId === 'left' ? { x: 0, y: 0, z: along }
    : { x: room.width, y: 0, z: along };
  return { position, rotationY: WALL_ROTATION[o.wallId] };
}
