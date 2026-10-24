import { describe, expect, it } from 'vitest';
import { captureRoomTemplate, instantiateRoomTemplate, isRoomTemplate } from './roomTemplate';
import { detectRooms } from '../plan/rooms';
import { rectWalls, sampleProject } from '../domain/factory';
import { bbox, footprint } from '../geometry/furniture';
import { mm } from '../domain/units';
import { validateProject } from '../validation';

describe('room templates', () => {
  it('keeps wall-hugging pieces on their walls in a bigger room', () => {
    const p = sampleProject();
    const [src] = detectRooms(p.plan);
    const t = captureRoomTemplate(src, p.furniture);
    expect(isRoomTemplate(JSON.parse(JSON.stringify(t)))).toBe(true);
    expect(t.pieces.length).toBe(p.furniture.length);

    const big = { ...p.plan, walls: rectWalls(0, 0, mm(5000), mm(4500), p.plan.defaultWallThicknessUm, p.plan.defaultCeilingUm), rooms: [] };
    const [dst] = detectRooms(big);
    const items = instantiateRoomTemplate(t, dst);
    const db = bbox(dst.interior);
    const sb = bbox(src.interior);
    // The wardrobe sat against the north wall: same gap to the north wall in the new room.
    const wIdx = p.furniture.findIndex((f) => f.kind === 'wardrobe');
    const gapSrc = bbox(footprint(p.furniture[wIdx])).minY - sb.minY;
    const gapDst = bbox(footprint(items[wIdx])).minY - db.minY;
    expect(Math.abs(gapSrc - gapDst)).toBeLessThan(mm(1));
    // Fresh ids, all pieces inside, no errors from the move.
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => !p.furniture.some((f) => f.id === i.id))).toBe(true);
    const issues = validateProject({ ...p, plan: big, openings: [], furniture: items });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('round-trips in the same room', () => {
    const p = sampleProject();
    const [room] = detectRooms(p.plan);
    const items = instantiateRoomTemplate(captureRoomTemplate(room, p.furniture), room);
    items.forEach((it, i) => {
      expect(Math.abs(it.xUm - p.furniture[i].xUm)).toBeLessThanOrEqual(1);
      expect(Math.abs(it.yUm - p.furniture[i].yUm)).toBeLessThanOrEqual(1);
    });
  });
});

describe('project from template', () => {
  it('builds a furnished room of the template size with no errors', async () => {
    const { projectFromTemplate, emptyProject } = await import('./roomTemplate');
    const p = sampleProject();
    const [room] = detectRooms(p.plan);
    const t = captureRoomTemplate(room, p.furniture);
    const np = projectFromTemplate('New', 'Client', t, 'Bedroom');
    const [r2] = detectRooms(np.plan);
    expect(Math.abs(r2.areaUm2 - room.areaUm2) / room.areaUm2).toBeLessThan(0.001);
    expect(r2.info.name).toBe('Bedroom');
    expect(np.furniture.length).toBe(p.furniture.length);
    expect(validateProject(np).filter((i) => i.severity === 'error')).toEqual([]);
    const e = emptyProject('Trace', '');
    expect(e.plan.walls).toHaveLength(0);
    expect(e.openings).toHaveLength(0);
  });
});
