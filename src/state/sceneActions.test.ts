import { beforeEach, describe, expect, it } from 'vitest';
import { allElements, createProject, DEFAULT_ROOM } from '@/domain';
import { buildModel } from '@/engine/geometry/parts';
import { sequentialIds } from '@/test/ids';
import { assistantConversation, useAssistantStore } from './assistantStore';
import { useEditorStore } from './editorStore';
import { openingOf } from './openings';
import { pickMovers } from './sceneActions';

const editor = () => useEditorStore.getState();
const say = (t: string) => assistantConversation().send(t);
const el = (type: string) => allElements(editor().project!).find((e) => e.type === type)!;
const openOf = (id: string) => buildModel(allElements(editor().project!).find((e) => e.id === id)!).movers.map((m) => openingOf(editor().openness, id, m.id));

beforeEach(() => {
  localStorage.clear();
  useAssistantStore.getState().setPrefs({ provider: 'rules', autoApply: false });
  assistantConversation().reset();
  editor().openProject(createProject({ name: 'Scene', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds()));
  editor().setView('plan');
});

describe('acting in the room through the assistant', () => {
  it('opens and closes a unit like a person, in 3D, without touching the design or its history', async () => {
    const fridge = el('fridge');
    const before = editor().revision;
    const reply = await say('open the fridge');
    expect(reply).toMatchObject({ kind: 'answer', text: expect.stringMatching(/^Opened: /) });
    expect(openOf(fridge.id).every((t) => t === 1)).toBe(true);
    expect(editor().view).toBe('3d');
    expect(editor().revision).toBe(before);
    expect(editor().past).toHaveLength(0);
    await say('close everything');
    expect(openOf(fridge.id).every((t) => t === 0)).toBe(true);
  });

  it('opens one named part, opening the door in front of it first', async () => {
    const sink = el('sink');
    const movers = buildModel(sink).movers;
    await say('open the left door of the sink unit');
    const opened = movers.filter((m) => openingOf(editor().openness, sink.id, m.id) === 1).map((m) => m.label.toLowerCase());
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((l) => l.includes('door'))).toBe(true);
    expect(pickMovers(movers, 'top drawer').length).toBeLessThanOrEqual(1);
  });

  it('walks to a unit, looks from views, switches views and stops walking', async () => {
    const sink = el('sink');
    await say('walk to the sink');
    expect(editor()).toMatchObject({ navMode: 'walk', view: '3d', walk: { request: { kind: 'stand', id: sink.id } } });
    await say('stop walking');
    expect(editor().navMode).toBe('orbit');
    await say('show me the top view');
    expect(editor().camera.request).toEqual({ kind: 'preset', preset: 'top' });
    await say('go to plan view');
    expect(editor().view).toBe('plan');
    await say('look at the fridge');
    expect(editor()).toMatchObject({ selectedId: el('fridge').id, camera: { request: { kind: 'focus', id: el('fridge').id } } });
    expect((await say('go to viewpoint at the hob'))).toMatchObject({ text: expect.stringMatching(/No viewpoints are saved/) });
  });

  it('accepts the same actions from an AI model as an interact tool call', async () => {
    const r = await assistantConversation().send('take me to the hob', { response: { value: { kind: 'act', explanation: '', actions: [{ action: 'walk_to', target: { query: { type: 'range' } } }] }, servedBy: { provider: 'test' } } });
    expect(r).toMatchObject({ text: 'Walking to the range cooker 600.' });
    expect(editor().walk.request).toEqual({ kind: 'stand', id: el('range').id });
  });
});
