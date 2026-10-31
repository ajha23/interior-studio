/** Deterministic kitchen fixtures for layout-planning tests. */
import { createProject, executeBatch, type DesignCommand, type KitchenProject } from '@/domain';

/**
 * 12 ft × 10 ft room (3658 × 3048 mm, 8 ft ceiling) with an L-shaped kitchen on the back and left
 * walls, a window over the sink, wall units and a hood, and the entrance door on the front wall.
 */
export function lKitchen12x10(): KitchenProject {
  const empty = createProject({ id: 'prj_fixture', name: '12 × 10 ft L kitchen', room: { width: 3658, length: 3048, height: 2438, wallThickness: 114 }, layout: 'empty' });
  const cab = (id: string, cabinetType: 'base' | 'drawer' | 'sink' | 'corner' | 'wall', wallId: 'back' | 'left', offset: number, width: number): DesignCommand => ({
    type: 'add_cabinet',
    cabinetType,
    id,
    dimensions: { width, height: 720, depth: cabinetType === 'wall' ? 350 : 560 },
    placement: { wallId, offset },
  });
  const commands: DesignCommand[] = [
    { type: 'add_opening', kind: 'window', id: 'window', wallId: 'back', offset: 1000, width: 800, height: 1000, sill: 1050 },
    { type: 'add_opening', kind: 'door', id: 'door', wallId: 'front', offset: 1500, width: 900 },
    cab('corner', 'corner', 'back', 0, 1000),
    cab('sink', 'sink', 'back', 1000, 800),
    { type: 'add_appliance', applianceType: 'dishwasher', id: 'dw', width: 600, placement: { wallId: 'back', offset: 1800 } },
    cab('base1', 'base', 'back', 2400, 600),
    cab('drawer1', 'drawer', 'back', 3000, 600),
    { type: 'add_appliance', applianceType: 'range', id: 'range', width: 600, placement: { wallId: 'left', offset: 580 } },
    cab('base2', 'base', 'left', 1180, 600),
    { type: 'add_appliance', applianceType: 'fridge', id: 'fridge', width: 700, placement: { wallId: 'left', offset: 1780 } },
    cab('wall1', 'wall', 'back', 1800, 600),
    cab('wall2', 'wall', 'back', 2400, 600),
    cab('wall3', 'wall', 'back', 3000, 600),
    { type: 'add_appliance', applianceType: 'hood', id: 'hood', width: 600, placement: { wallId: 'left', offset: 580 } },
    cab('wall4', 'wall', 'left', 1180, 600),
  ];
  const run = executeBatch(empty, commands);
  if (!run.success) throw new Error(`Fixture rejected: ${run.results.at(-1)?.errors.join(' ')}`);
  return run.project;
}

/**
 * A narrow 1700 × 3000 mm room with an L on the back and left walls and a door in the front wall:
 * too narrow for a third run opposite the left one, and the front wall is mostly door.
 */
export function narrowLKitchen(): KitchenProject {
  const empty = createProject({ id: 'prj_narrow', name: 'Narrow L', room: { width: 1700, length: 3000, height: 2600, wallThickness: 150 }, layout: 'empty' });
  const run = executeBatch(empty, [
    { type: 'add_opening', kind: 'door', id: 'door', wallId: 'front', offset: 700, width: 900 },
    { type: 'add_cabinet', cabinetType: 'corner', id: 'corner', placement: { wallId: 'back', offset: 0 } },
    { type: 'add_cabinet', cabinetType: 'sink', id: 'sink', dimensions: { width: 600, height: 720, depth: 560 }, placement: { wallId: 'back', offset: 900 } },
    { type: 'add_appliance', applianceType: 'range', id: 'range', width: 600, placement: { wallId: 'left', offset: 580 } },
    { type: 'add_cabinet', cabinetType: 'base', id: 'base', placement: { wallId: 'left', offset: 1180 } },
    { type: 'add_appliance', applianceType: 'fridge', id: 'fridge', width: 600, placement: { wallId: 'left', offset: 1780 } },
  ]);
  if (!run.success) throw new Error(`Fixture rejected: ${run.results.at(-1)?.errors.join(' ')}`);
  return run.project;
}
