import { describe, expect, it, vi } from 'vitest';
import { mm, newWardrobe, sampleProject } from '@studio/core';
import { useStudio, type RemoteSaver } from './store';

function setup(readOnly = false) {
  const calls: { kind: string; message?: string; furniture: number }[] = [];
  let version = 3;
  const saver: RemoteSaver = vi.fn(async (p, kind, message) => {
    calls.push({ kind, message, furniture: p.furniture.length });
    version += 1;
    return { versionNo: version };
  });
  const project = sampleProject();
  useStudio.getState().hydrate(project, { versionNo: 3, readOnly, saver });
  return { calls, saver, project };
}

describe('editor store (cloud persistence)', () => {
  it('hydrates without saving and starts clean', () => {
    const { saver } = setup();
    const s = useStudio.getState();
    expect(s.saveState).toBe('saved');
    expect(s.savedVersionNo).toBe(3);
    expect(saver).not.toHaveBeenCalled();
  });

  it('marks edits dirty and a manual save records a named version', async () => {
    const { calls } = setup();
    const n = useStudio.getState().project.furniture.length;
    useStudio.getState().dispatch({ type: 'furniture.add', item: newWardrobe(mm(1800)) });
    expect(useStudio.getState().saveState).toBe('dirty');
    await useStudio.getState().saveNow('manual', 'Client review');
    expect(calls.at(-1)).toEqual({ kind: 'manual', message: 'Client review', furniture: n + 1 });
    expect(useStudio.getState().saveState).toBe('saved');
    expect(useStudio.getState().savedVersionNo).toBe(4);
  });

  it('keeps the editor dirty and reports when the cloud save fails', async () => {
    setup();
    useStudio.setState({ saver: async () => { throw new Error('network down'); } });
    useStudio.getState().dispatch({ type: 'project.meta', patch: { client: 'Mehta' } });
    await useStudio.getState().saveNow('manual');
    const s = useStudio.getState();
    expect(s.saveState).toBe('error');
    expect(s.lastError).toMatch(/network down/);
  });

  it('restoring a version is one undoable step that keeps identity and revisions', () => {
    const { project } = setup();
    const other = { ...sampleProject(), name: 'Other', furniture: [] };
    useStudio.getState().replaceScene(other, 'Restore v1');
    let s = useStudio.getState();
    expect(s.project.id).toBe(project.id);
    expect(s.project.furniture).toHaveLength(0);
    expect(s.past.at(-1)?.label).toBe('Restore v1');
    s.undo();
    s = useStudio.getState();
    expect(s.project.furniture.map((f) => f.id)).toEqual(project.furniture.map((f) => f.id));
    expect(s.project.name).toBe(project.name);
  });

  it('view-only members cannot change the design or save', async () => {
    const { saver } = setup(true);
    const before = useStudio.getState().project;
    useStudio.getState().dispatch({ type: 'project.meta', patch: { name: 'Hacked' } });
    await useStudio.getState().saveNow('manual');
    expect(useStudio.getState().project).toBe(before);
    expect(useStudio.getState().lastError).toMatch(/View-only/);
    expect(saver).not.toHaveBeenCalled();
  });
});
