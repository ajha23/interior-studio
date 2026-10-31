import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, executeCommand } from '@/domain';
import { snapPlacement } from './placement';

const project = () => createProject({ name: 'place', room: DEFAULT_ROOM, layout: 'straight' });

describe('placement snapping', () => {
  it('a floor unit dragged to the middle of the room becomes free-standing on the grid', () => {
    const p = project();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    const snap = snapPlacement(p, drawer, 2104, 1603, 5);
    expect(snap.kind).toBe('free');
    expect(snap.command).toEqual({ type: 'place_entity', entityId: drawer.id, x: 2100, z: 1600, rotationY: 0 });
    expect(executeCommand(p, snap.command).result.success).toBe(true);
  });

  it('near a wall it snaps onto that wall, facing the room', () => {
    const p = project();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    const snap = snapPlacement(p, drawer, 400, 1600, 30);
    expect(snap).toMatchObject({ kind: 'wall', wallId: 'left' });
    const moved = executeCommand(p, snap.command);
    expect(moved.result.success).toBe(true);
    expect(moved.project.cabinets.find((c) => c.id === drawer.id)).toMatchObject({ wallId: 'left', rotationY: 90 });
  });

  it('wall units always go onto the nearest wall', () => {
    const p = project();
    const wall = p.cabinets.find((c) => c.type === 'wall')!;
    expect(snapPlacement(p, wall, 2100, 1600, 30).kind).toBe('wall');
  });

  it('free units align their edges with nearby units', () => {
    const p = project();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    // The fridge spans x 0..700; a drawer centred near x = 1000 aligns its left edge to 700.
    const snap = snapPlacement(p, drawer, 1010, 1600, 20);
    expect(snap).toMatchObject({ kind: 'free', x: 1000 });
    expect(snap.snappedTo).toMatch(/aligned with/);
  });
});
