import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, deriveCountertops } from '@/domain';
import { selectIsDirty, useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

beforeEach(() => {
  store().openProject(createProject({ name: 'Store test', room: DEFAULT_ROOM, layout: 'straight' }));
});

const base = () => store().project!.cabinets.find((c) => c.type === 'base')!;

describe('editor store', () => {
  it('undo and redo restore dimensions and the dependent worktop through a sequence of edits', () => {
    const id = base().id;
    const original = store().project!;
    store().dispatch({ type: 'resize_cabinet', cabinetId: id, dimensions: { width: 900, height: 720, depth: 560 } });
    store().dispatch({ type: 'set_material', targetIds: [id], materialId: 'shutter-oak' });
    expect(base()).toMatchObject({ id, materialId: 'shutter-oak', dimensions: { width: 900 } });
    expect(deriveCountertops(store().project!)[0]!.length).toBe(2300);

    store().undo();
    expect(base().materialId).toBe('shutter-white-matte');
    store().undo();
    expect(base().dimensions.width).toBe(600);
    expect(deriveCountertops(store().project!)[0]!.length).toBe(2000);
    expect(store().project).toBe(original);

    store().redo();
    store().redo();
    expect(base()).toMatchObject({ materialId: 'shutter-oak', dimensions: { width: 900 } });
  });

  it('a rejected edit changes nothing, records no history and reports the error', () => {
    const before = store().project;
    const result = store().dispatch({ type: 'resize_cabinet', cabinetId: base().id, dimensions: { width: 1500, height: 720, depth: 560 } });
    expect(result.success).toBe(false);
    expect(store().project).toBe(before);
    expect(store().past).toHaveLength(0);
    expect(store().feedback).toMatchObject({ kind: 'error' });
  });

  it('a new edit clears the redo stack; adding selects the new element', () => {
    store().dispatch({ type: 'remove_entity', entityId: base().id });
    store().undo();
    expect(store().future).toHaveLength(1);
    const result = store().dispatch({ type: 'add_cabinet', cabinetType: 'wall' });
    expect(store().future).toHaveLength(0);
    expect(store().selectedId).toBe(result.affectedEntityIds[0]);
  });

  it('tracks unsaved changes against the last saved snapshot', () => {
    expect(selectIsDirty(store())).toBe(false);
    store().dispatch({ type: 'rename_project', name: 'Renamed' });
    expect(selectIsDirty(store())).toBe(true);
    store().markSaved(store().project!);
    expect(selectIsDirty(store())).toBe(false);
    store().undo();
    expect(selectIsDirty(store())).toBe(true);
  });

  it('clears the selection when the selected element is removed', () => {
    store().select(base().id);
    store().dispatch({ type: 'remove_entity', entityId: base().id });
    expect(store().selectedId).toBeNull();
  });
});
