/** Builds elements on walls and finds free spots for new ones. */
import { boxesIntersect, elementBox } from '@/engine/geometry/box';
import { allElements } from '../constraints/validate';
import { WALLS, placeOnWall, spanAlongWall, wallAxis, wallLength } from '../room/walls';
import type { Appliance, ApplianceType, CabinetType, Dimensions, KitchenCabinet, KitchenElement, KitchenProject, Room, WallId } from '../schema';
import { defaultInterior } from './interior';
import { APPLIANCE_SPECS, CABINET_SPECS } from './specs';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function makeCabinet(
  room: Room,
  input: { id: string; type: CabinetType; wallId: WallId; offset: number; dimensions?: Dimensions; elevation?: number; materialId: string },
): KitchenCabinet {
  const spec = CABINET_SPECS[input.type];
  const dimensions = input.dimensions ?? { ...spec.defaults };
  const placed = placeOnWall(room, input.wallId, dimensions, input.offset, input.elevation ?? spec.elevation);
  return {
    id: input.id,
    type: input.type,
    dimensions,
    ...placed,
    materialId: input.materialId,
    wallId: input.wallId,
    catalogItemId: `${input.type}-${dimensions.width}`,
    frontStyle: 'solid',
    interior: defaultInterior(input.type, dimensions),
  };
}

export function makeAppliance(
  room: Room,
  input: { id: string; type: ApplianceType; wallId: WallId; offset: number; width?: number; elevation?: number },
): Appliance {
  const spec = APPLIANCE_SPECS[input.type];
  const dimensions = { ...spec.defaults, width: input.width ?? spec.defaults.width };
  const placed = placeOnWall(room, input.wallId, dimensions, input.offset, input.elevation ?? spec.elevation);
  return { id: input.id, type: input.type, dimensions, ...placed, wallId: input.wallId };
}

/**
 * First wall position (back, left, right, front; nearest the wall start first) where an element
 * fits inside the room without overlapping anything. Candidates are the wall start, the end of
 * every element on that wall, and the far edge of every element along that wall's axis (which
 * clears units standing in the corner on the neighbouring wall).
 */
export function findFreePlacement(
  project: KitchenProject,
  build: (wallId: WallId, offset: number) => KitchenElement,
): { wallId: WallId; offset: number } | null {
  const elements = allElements(project);
  const others = elements.map(elementBox);
  for (const wallId of WALLS) {
    const onWall = elements.filter((el) => el.wallId === wallId);
    const axisEnds = others.map((b) => (wallAxis(wallId) === 'x' ? b.maxX : b.maxZ));
    const offsets = [...new Set([0, ...onWall.map((el) => spanAlongWall(el).end), ...axisEnds])].sort((a, b) => a - b);
    for (const offset of offsets) {
      const candidate = build(wallId, offset);
      if (spanAlongWall(candidate).end > wallLength(project.room, wallId)) continue;
      const box = elementBox(candidate);
      if (box.maxY > project.room.height) continue;
      if (!others.some((o) => boxesIntersect(o, box))) return { wallId, offset };
    }
  }
  return null;
}
