import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, spanAlongWall } from '@/domain';
import { snapAlongWall, snapCandidates, snapWidth } from './alongWall';

const project = () => createProject({ name: 'snap', room: DEFAULT_ROOM, layout: 'straight' });

describe('snapping along a wall', () => {
  it('snaps flush after a neighbour within tolerance and names it', () => {
    const p = project();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    const range = p.appliances.find((a) => a.type === 'range')!;
    const rangeEnd = spanAlongWall(range).end;
    expect(snapAlongWall(p, drawer, 'back', rangeEnd + 35, 60)).toEqual({ offset: rangeEnd, snappedTo: 'after Range cooker 600' });
  });

  it('falls back to the 10 mm grid outside the tolerance and clamps to the wall', () => {
    const p = project();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    expect(snapAlongWall(p, drawer, 'back', 3477, 20)).toEqual({ offset: 3480, snappedTo: null });
    expect(snapAlongWall(p, drawer, 'back', 99999, 20).offset).toBe(4200 - 600);
  });

  it('snaps to the wall end', () => {
    const p = project();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    expect(snapAlongWall(p, drawer, 'back', 3590, 30)).toEqual({ offset: 3600, snappedTo: 'wall end' });
  });

  it('offers alignment with units above or below, not flush placement', () => {
    const p = project();
    const wallCab = p.cabinets.find((c) => c.type === 'wall')!;
    const labels = snapCandidates(p, wallCab, 'back').map((c) => c.label);
    expect(labels.some((l) => l.startsWith('aligned with Base cabinet'))).toBe(true);
    expect(labels.some((l) => l.startsWith('after Base cabinet'))).toBe(false);
  });

  it('snaps a dragged width to the nearest supported module', () => {
    expect(snapWidth([300, 400, 450, 600, 900], 520)).toBe(450);
    expect(snapWidth([300, 400, 450, 600, 900], 780)).toBe(900);
  });
});
