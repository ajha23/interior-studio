import { describe, expect, it } from 'vitest';
import { createExampleProject, DEFAULT_ROOM, type Opening } from '@/domain';
import { buildOpeningModel } from './openingParts';
import { moverPoint } from './parts';
import { wallPieces } from './walls';

const door: Opening = { id: 'd', kind: 'door', wallId: 'left', offset: 1000, width: 900, height: 2100, sill: 0, swing: 'in', hinge: 'left' };
const window_: Opening = { id: 'w', kind: 'window', wallId: 'back', offset: 1000, width: 1200, height: 1000, sill: 1000, swing: 'none', hinge: 'left' };

describe('walls with openings', () => {
  it('a wall without openings is one solid piece running past the corners', () => {
    expect(wallPieces(DEFAULT_ROOM, 'back', [])).toEqual([{ minX: -150, maxX: 4350, minY: 0, maxY: 2700, minZ: -150, maxZ: 0 }]);
  });

  it('a window leaves piers either side, a wall below the sill and a lintel above', () => {
    const pieces = wallPieces(DEFAULT_ROOM, 'back', [window_]);
    expect(pieces.map((p) => [p.minX, p.maxX, p.minY, p.maxY])).toEqual([
      [-150, 1000, 0, 2700],
      [1000, 2200, 0, 1000],
      [1000, 2200, 2000, 2700],
      [2200, 4350, 0, 2700],
    ]);
  });

  it('the hole matches the opening exactly (no wall where the door is)', () => {
    const pieces = wallPieces(DEFAULT_ROOM, 'left', [door]);
    const inDoorway = pieces.filter((p) => p.minZ < 1900 && p.maxZ > 1000 && p.minY < 2100);
    expect(inDoorway).toEqual([]);
  });

  it('an inward, left-hinged door leaf swings its free edge into the room', () => {
    const { movers, parts } = buildOpeningModel(door, DEFAULT_ROOM);
    expect(movers).toHaveLength(1);
    const leaf = movers[0]!;
    expect(parts.filter((p) => p.mover === 'leaf').map((p) => p.key)).toEqual(['leaf', 'handleIn', 'handleOut']);
    const freeEdge = { x: 400, y: 1000, z: leaf.pivot.z };
    expect(moverPoint(leaf, 1, freeEdge).z).toBeGreaterThan(600);
    const outward = buildOpeningModel({ ...door, swing: 'out' }, DEFAULT_ROOM).movers[0]!;
    expect(moverPoint(outward, 1, freeEdge).z).toBeLessThan(-600);
    expect(buildOpeningModel({ ...door, swing: 'none' }, DEFAULT_ROOM).movers).toEqual([]);
  });

  it('every opening in the example kitchen builds', () => {
    const p = createExampleProject();
    for (const o of p.openings) expect(buildOpeningModel(o, p.room).parts.length).toBeGreaterThan(3);
  });
});
