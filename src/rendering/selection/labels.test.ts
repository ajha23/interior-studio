import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, executeCommand } from '@/domain';
import { sceneLabels } from './labels';

describe('3D dimension labels', () => {
  it('room labels follow the room dimensions', () => {
    const p = createProject({ name: 'x', room: DEFAULT_ROOM, layout: 'empty' });
    const { project } = executeCommand(p, { type: 'set_room', room: { ...p.room, width: 5000 } });
    expect(sceneLabels(project, null).map((l) => l.text)).toEqual(['5,000 mm', '3,200 mm']);
    const imperial = executeCommand(project, { type: 'set_measurement_unit', unit: 'ft-in' }).project;
    expect(sceneLabels(imperial, null).map((l) => l.text)).toEqual([`16' 4 7/8"`, `10' 6"`]);
  });

  it('selection labels show the domain dimensions in front of a unit on any wall', () => {
    const p = createProject({ name: 'x', room: DEFAULT_ROOM, layout: 'empty' });
    const { project } = executeCommand(p, { type: 'add_cabinet', cabinetType: 'base', id: 'L1', placement: { wallId: 'left', offset: 1000 } });
    const labels = sceneLabels(project, 'L1');
    const width = labels.find((l) => l.id === 'dim-width')!;
    expect(width.text).toBe('W 600 mm');
    // A left-wall unit faces +x: its front face is at x = depth.
    expect(width.anchor.x).toBe(560);
    expect(width.anchor.z).toBe(1300);
  });
});
