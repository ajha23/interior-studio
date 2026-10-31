import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { runPlan } from './transaction';

const project = createProject({ name: 'Finishes', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
const ctx = { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 0 };

describe('new finishes from the assistant', () => {
  it('creates a textured finish and uses it in the same plan', () => {
    const p = runPlan(project, { explanation: 'Sage fronts on a terrazzo floor.', operations: [
      { op: 'create_finish', name: 'Sage lacquer', category: 'shutter', color: '#8ea38b', texture: 'plain' },
      { op: 'set_finish', target: { query: { kind: 'cabinet', all: true } }, finish: 'Sage lacquer' },
      { op: 'create_finish', name: 'Speckled terrazzo', category: 'floor', color: '#d9d4ca', texture: 'terrazzo' },
      { op: 'set_surface_finish', surface: 'floor', finish: 'Speckled terrazzo' },
    ] }, ctx);
    expect(p.status).toBe('valid');
    const after = p.after!;
    expect(after.materials['shutter-sage-lacquer']).toMatchObject({ name: 'Sage lacquer', color: '#8ea38b', roughness: 0.55 });
    expect(after.materials['floor-speckled-terrazzo']).toMatchObject({ texture: 'terrazzo', textureScale: 800 });
    expect(after.surfaces.floor).toBe('floor-speckled-terrazzo');
    expect(after.cabinets.every((c) => c.materialId === 'shutter-sage-lacquer')).toBe(true);
  });

  it('recolours a finish of the same name in place, and shows it in the preview when it is in use', () => {
    const first = runPlan(project, { explanation: 'x', operations: [{ op: 'create_finish', name: 'Moss', category: 'wall', color: '#7a8c6a' }, { op: 'set_surface_finish', surface: 'wall', finish: 'Moss' }] }, ctx).after!;
    const again = runPlan(first, { explanation: 'Darker moss.', operations: [{ op: 'create_finish', name: 'moss', category: 'wall', color: '#556644' }] }, ctx);
    expect(again.status).toBe('valid');
    expect(Object.values(again.after!.materials).filter((m) => m.name.toLowerCase() === 'moss' && m.category === 'wall')).toHaveLength(1);
    expect(again.after!.materials['wall-moss']!.color).toBe('#556644');
    expect(again.changes!.finishes).toEqual([{ name: 'moss', before: '#7a8c6a matt', after: '#556644 matt' }]);
    // A finish nothing uses changes nothing you can see.
    expect(runPlan(project, { explanation: 'x', operations: [{ op: 'create_finish', name: 'Unused', category: 'wall', color: '#123456' }] }, ctx).status).toBe('invalid');
  });

});
