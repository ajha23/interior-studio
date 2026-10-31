import { describe, expect, it } from 'vitest';
import { sequentialIds } from '@/test/ids';
import { createExampleProject, createProject, DEFAULT_ROOM, executeCommand, type DesignCommand, type KitchenProject } from '@/domain';
import { designChecks } from './designChecks';

const straight = () => createProject({ name: 'c', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
function run(p: KitchenProject, ...commands: DesignCommand[]): KitchenProject {
  return commands.reduce((acc, cmd) => {
    const { project, result } = executeCommand(acc, cmd, { newId: sequentialIds() });
    expect(result.errors).toEqual([]);
    return project;
  }, p);
}
const warnings = (p: KitchenProject) => designChecks(p).filter((c) => c.severity === 'warning');

describe('design checks', () => {
  it('the default layouts and the example kitchen raise no warnings', () => {
    expect(warnings(straight())).toEqual([]);
    expect(warnings(createProject({ name: 'l', room: { ...DEFAULT_ROOM, width: 3600 }, layout: 'l-shaped' }))).toEqual([]);
    expect(warnings(createExampleProject())).toEqual([]);
  });

  it('flags an island too close to the run, and a drawer that hits it', () => {
    const p = run(straight(), { type: 'add_cabinet', cabinetType: 'drawer', id: 'isl', placement: { wallId: 'front', offset: 3000 } }, { type: 'place_entity', entityId: 'isl', x: 3600, z: 1200, rotationY: 180 });
    const checks = warnings(p);
    // The island (facing the back run) is 560 + … mm away: too tight to walk.
    expect(checks.some((c) => c.code === 'walkway' && c.entityIds.includes('isl') && /allow at least 900 mm/.test(c.message))).toBe(true);
    // The back-run drawer unit pulls out into the island.
    expect(checks.some((c) => c.code === 'clearance' && c.entityIds[1] === 'isl' && /The top drawer of Drawer unit 600 hits Drawer unit 600 when pulled out/.test(c.message))).toBe(true);
  });

  it('flags the dishwasher door folding down into a unit in front of it', () => {
    const dw = straight().appliances.find((a) => a.type === 'dishwasher')!;
    const p = run(straight(), { type: 'add_cabinet', cabinetType: 'base', id: 'isl', placement: { wallId: 'front', offset: 200 } }, { type: 'place_entity', entityId: 'isl', x: dw.position.x, z: 1350, rotationY: 0 });
    expect(warnings(p).some((c) => c.code === 'clearance' && c.entityIds[0] === dw.id && /The dishwasher door of Dishwasher 600 hits Base cabinet 600 when opened/.test(c.message))).toBe(true);
  });

  it('flags wall cabinets hung too low over the worktop and a hood at the wrong height', () => {
    const p = straight();
    const wallCab = p.cabinets.find((c) => c.type === 'wall')!;
    const hood = p.appliances.find((a) => a.type === 'hood')!;
    const low = run(p, { type: 'move_entity', entityId: wallCab.id, placement: { wallId: 'back', offset: 700, elevation: 1200 } });
    expect(warnings(low).find((c) => c.code === 'wall-cabinet-height')?.message).toMatch(/Only 340 mm between the worktop and Wall cabinet 600/);
    const hoodHigh = run(p, { type: 'move_entity', entityId: hood.id, placement: { wallId: 'back', offset: 2700, elevation: 1700 } });
    expect(warnings(hoodHigh).find((c) => c.code === 'hood-height')?.message).toMatch(/840 mm above the hob/);
  });

  it('flags a tall unit right beside the hob', () => {
    const p = straight();
    const drawer = p.cabinets.find((c) => c.type === 'drawer')!;
    const above = p.cabinets.find((c) => c.type === 'wall' && c.position.x === drawer.position.x)!;
    const tallBeside = run(p, { type: 'remove_entity', entityId: drawer.id }, { type: 'remove_entity', entityId: above.id }, { type: 'add_cabinet', cabinetType: 'tall', id: 't', placement: { wallId: 'back', offset: 3300 } });
    expect(warnings(tallBeside).some((c) => c.code === 'landing' && c.entityIds.includes('t'))).toBe(true);
  });

  it('measures the work triangle', () => {
    const t = designChecks(createExampleProject()).find((c) => c.code === 'work-triangle')!;
    expect(t.message).toMatch(/^Work triangle sink → hob → fridge: \d\.\d \+ \d\.\d \+ \d\.\d = \d\.\d m/);
  });
});
