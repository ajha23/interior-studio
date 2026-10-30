import { describe, expect, it } from 'vitest';
import { createExampleProject, executeCommand } from '@/domain';
import { deleteProject, listProjects, loadProject, saveProject } from './projectDb';

describe('IndexedDB project storage', () => {
  it('saves, lists, reloads and deletes a project', async () => {
    const original = createExampleProject();
    const base = original.cabinets.find((c) => c.type === 'base')!;
    const { project } = executeCommand(original, { type: 'set_material', targetIds: [base.id], materialId: 'shutter-navy' });

    const summary = await saveProject(project, new Date('2026-10-30T10:00:00Z'));
    expect(summary).toMatchObject({ id: project.id, name: project.name, elementCount: project.cabinets.length + project.appliances.length });
    expect((await listProjects()).map((p) => p.id)).toContain(project.id);

    const loaded = await loadProject(project.id);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) {
      expect(loaded.project).toEqual(project);
      expect(loaded.project.cabinets.find((c) => c.id === base.id)!.materialId).toBe('shutter-navy');
    }

    await deleteProject(project.id);
    expect(await loadProject(project.id)).toBeNull();
  });

  it('lists the most recently saved project first', async () => {
    const a = createExampleProject();
    const b = createExampleProject();
    await saveProject(a, new Date('2026-01-01T00:00:00Z'));
    await saveProject(b, new Date('2026-02-01T00:00:00Z'));
    const ids = (await listProjects()).map((p) => p.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });
});
