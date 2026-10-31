import { describe, expect, it } from 'vitest';
import { sequentialIds } from '@/test/ids';
import { createExampleProject, createProject, DEFAULT_ROOM, executeCommand, parseProjectFile, serializeProject, validateProject, type DesignCommand, type KitchenProject } from '@/domain';
import { snapAlongWall } from '@/engine/snapping/alongWall';

const straight = () => createProject({ name: 'o', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
function run(p: KitchenProject, ...commands: DesignCommand[]): KitchenProject {
  return commands.reduce((acc, cmd) => {
    const { project, result } = executeCommand(acc, cmd, { newId: sequentialIds() });
    expect(result.errors).toEqual([]);
    return project;
  }, p);
}

describe('wall openings', () => {
  it('the example kitchen has a window over the sink and a door, and is valid', () => {
    const p = createExampleProject();
    expect(p.openings.map((o) => o.kind).sort()).toEqual(['door', 'window']);
    expect(validateProject(p)).toEqual([]);
  });

  it('auto-places a door in the middle of the first free wall', () => {
    const p = run(straight(), { type: 'add_opening', kind: 'door', id: 'd1' });
    const door = p.openings[0]!;
    // The back wall is full of units, so the door goes onto the left wall.
    expect(door).toMatchObject({ id: 'd1', wallId: 'left', width: 900, swing: 'in' });
    expect(validateProject(p)).toEqual([]);
  });

  it('a window above base units is fine; wall cabinets over it are not', () => {
    const p = straight();
    // Over the base cabinet (700–1300) and its wall cabinet: the wall cabinet blocks it.
    const blocked = executeCommand(p, { type: 'add_opening', kind: 'window', wallId: 'back', offset: 700, width: 600 });
    expect(blocked.result.errors[0]).toMatch(/Wall cabinet 600 blocks the window on the back wall/);
    const wallCab = p.cabinets.find((c) => c.type === 'wall' && c.position.x === 1000)!;
    const cleared = run(p, { type: 'remove_entity', entityId: wallCab.id }, { type: 'add_opening', kind: 'window', wallId: 'back', offset: 700, width: 600 });
    expect(validateProject(cleared)).toEqual([]);
  });

  it('units cannot stand in a doorway or in an inward door swing', () => {
    const p = run(straight(), { type: 'add_opening', kind: 'door', id: 'd1', wallId: 'left', offset: 1500 });
    const inDoorway = executeCommand(p, { type: 'add_cabinet', cabinetType: 'base', placement: { wallId: 'left', offset: 1500 } });
    expect(inDoorway.result.errors[0]).toMatch(/blocks the door on the left wall/);
    const inSwing = executeCommand(p, { type: 'add_cabinet', cabinetType: 'base', id: 'isl', placement: { wallId: 'front', offset: 1500 } });
    expect(inSwing.result.success).toBe(true);
    const island = executeCommand(inSwing.project, { type: 'place_entity', entityId: 'isl', x: 1050, z: 1950, rotationY: 0 });
    expect(island.result.errors[0]).toMatch(/is in the swing of the door on the left wall/);
    // A door that swings out does not sweep the room.
    const out = run(p, { type: 'update_opening', id: 'd1', swing: 'out' });
    expect(executeCommand({ ...out, cabinets: inSwing.project.cabinets }, { type: 'place_entity', entityId: 'isl', x: 1050, z: 1950, rotationY: 0 }).result.success).toBe(true);
  });

  it('validates opening sizes, wall fit and overlaps', () => {
    const p = run(straight(), { type: 'add_opening', kind: 'door', id: 'd1', wallId: 'left', offset: 1500 });
    expect(executeCommand(p, { type: 'update_opening', id: 'd1', width: 400 }).result.errors[0]).toMatch(/Width 400 mm is outside the door range/);
    expect(executeCommand(p, { type: 'update_opening', id: 'd1', offset: 2900 }).result.errors[0]).toMatch(/runs past the end of the wall/);
    expect(executeCommand(p, { type: 'add_opening', kind: 'window', wallId: 'left', offset: 1800, width: 600 }).result.errors[0]).toMatch(/Door on the left wall overlaps the window on the left wall/);
  });

  it('units snap to just before an opening they would block', () => {
    const p = run(straight(), { type: 'add_opening', kind: 'door', id: 'd1', wallId: 'left', offset: 1500 });
    const base = run(p, { type: 'add_cabinet', cabinetType: 'base', id: 'b', placement: { wallId: 'left', offset: 700 } }).cabinets.find((c) => c.id === 'b')!;
    expect(snapAlongWall(p, base, 'left', 880, 40)).toEqual({ offset: 900, snappedTo: 'before the door' });
  });

  it('loads files saved before openings existed', () => {
    const file = JSON.parse(serializeProject(straight()));
    delete file.project.openings;
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.ok && parsed.project.openings).toEqual([]);
  });
});
