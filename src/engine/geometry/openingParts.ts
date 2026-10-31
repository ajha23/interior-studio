/**
 * Procedural doors, windows and openings in their own frame (see `openingPlacement`): origin at the
 * bottom centre on the inside face of the wall, x along the opening (−x = left from inside the room),
 * z into the room (the wall occupies −T…0). A swinging door's leaf is a hinged mover.
 */
import type { Opening, Room } from '@/domain/schema';
import type { ElementModel, Mover, Part, PartFinish } from './parts';

const CASING = 60;
const CASING_DEPTH = 20;
const LEAF = 40;
const DOOR_ANGLE = (95 * Math.PI) / 180;

function box(key: string, finish: PartFinish, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mover?: string): Part {
  return {
    key,
    finish,
    body: false,
    ...(mover ? { mover } : {}),
    size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 },
    center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  };
}

export function buildOpeningModel(o: Opening, room: Room): ElementModel {
  const T = room.wallThickness;
  const w = o.width;
  const h = o.height;
  const xl = -w / 2;
  const xr = w / 2;
  const y0 = o.sill;
  const y1 = o.sill + h;
  const parts: Part[] = [];
  const movers: Mover[] = [];

  // Linings through the wall thickness, and casings on the room side.
  parts.push(
    box('liningL', 'carcass', xl, xl + 20, y0, y1, -T, 0),
    box('liningR', 'carcass', xr - 20, xr, y0, y1, -T, 0),
    box('liningTop', 'carcass', xl, xr, y1 - 20, y1, -T, 0),
  );
  if (o.kind !== 'window') {
    parts.push(
      box('casingL', 'carcass', xl - CASING, xl, 0, y1 + CASING, 0, CASING_DEPTH),
      box('casingR', 'carcass', xr, xr + CASING, 0, y1 + CASING, 0, CASING_DEPTH),
      box('casingTop', 'carcass', xl - CASING, xr + CASING, y1, y1 + CASING, 0, CASING_DEPTH),
    );
  }

  if (o.kind === 'door') {
    const zMid = -T / 2;
    const leaf = box('leaf', 'carcass', xl + 22, xr - 22, 0, y1 - 22, zMid - LEAF / 2, zMid + LEAF / 2, 'leaf');
    const left = o.hinge === 'left';
    const handleX = left ? xr - 90 : xl + 90;
    const handles = [
      box('handleIn', 'handle', handleX - 60, handleX + 60, 1000, 1020, zMid + LEAF / 2, zMid + LEAF / 2 + 50, 'leaf'),
      box('handleOut', 'handle', handleX - 60, handleX + 60, 1000, 1020, zMid - LEAF / 2 - 50, zMid - LEAF / 2, 'leaf'),
    ];
    if (o.swing === 'none') {
      parts.push({ ...leaf, mover: undefined }, ...handles.map((p) => ({ ...p, mover: undefined })));
    } else {
      parts.push(leaf, ...handles);
      // Left-hinged leaves open into the room with a negative turn about +y (free edge towards +z).
      const into = o.swing === 'in' ? 1 : -1;
      movers.push({
        id: 'leaf',
        label: 'Room door',
        kind: 'hinge',
        pivot: { x: left ? xl + 22 : xr - 22, y: 0, z: zMid },
        amount: (left ? -1 : 1) * into * DOOR_ANGLE,
        grab: handles[0]!.center,
        span: [0, y1],
        requires: [],
      });
    }
  } else if (o.kind === 'window') {
    const zMid = -T / 2;
    const f = 60;
    parts.push(
      box('frameL', 'carcass', xl, xl + f, y0, y1, zMid - 35, zMid + 35),
      box('frameR', 'carcass', xr - f, xr, y0, y1, zMid - 35, zMid + 35),
      box('frameBottom', 'carcass', xl, xr, y0, y0 + f, zMid - 35, zMid + 35),
      box('frameTop', 'carcass', xl, xr, y1 - f, y1, zMid - 35, zMid + 35),
      box('glass', 'glassPane', xl + f, xr - f, y0 + f, y1 - f, zMid - 3, zMid + 3),
      // The window board on the room side of the sill.
      box('board', 'carcass', xl - 40, xr + 40, y0 - 25, y0, -T / 2, 150),
    );
    if (w > 1200) parts.push(box('mullion', 'carcass', -f / 2, f / 2, y0 + f, y1 - f, zMid - 35, zMid + 35));
  }
  return { parts, movers };
}
