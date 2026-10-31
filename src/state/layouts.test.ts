/**
 * Layout planning through the conversation and the real editor store: options are previews only,
 * one is applied atomically after re-validation, stale options are regenerated, and undo/redo works.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation, type ChatMessage } from '@/ai/conversation';
import { topologyOf } from '@/ai/layout/runs';
import { RuleBasedProvider } from '@/ai/providers/rules';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { lKitchen12x10 } from '@/test/kitchens';
import { editorPort } from './assistantStore';
import { useEditorStore } from './editorStore';

const editor = () => useEditorStore.getState();
const project = () => editor().project!;
let chat: Conversation;
type Layouts = Extract<ChatMessage, { kind: 'layouts' }>;

const ACCEPTANCE = 'Convert this L-shaped kitchen into a U-shaped kitchen. Preserve the sink on its existing wall, keep the refrigerator in place, maximize storage, and maintain all configured clearances.';

function layouts(): Layouts {
  const m = [...chat.state.messages].reverse().find((x) => x.role === 'assistant' && x.kind === 'layouts');
  if (!m) throw new Error(`No layout options: ${JSON.stringify(chat.state.messages.at(-1)).slice(0, 300)}`);
  return m as Layouts;
}

beforeEach(() => {
  editor().openProject(lKitchen12x10());
  chat = new Conversation(editorPort(), new RuleBasedProvider(), { autoApply: true });
});

describe('layout options in the conversation', () => {
  it('acceptance: options are previews only; the chosen one is applied atomically and undoable', async () => {
    const before = project();
    await chat.send(ACCEPTANCE);
    const m = layouts();
    expect(m.status).toBe('proposed');
    expect(m.result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(project()).toBe(before); // auto-apply never applies layout changes
    expect(editor().past).toHaveLength(0);
    expect(m.result.rules.map((r) => r.id)).toEqual(expect.arrayContaining(['sink-wall', 'preserve', 'clearance', 'walkway']));

    const chosen = m.result.candidates[1]!;
    expect(await chat.applyLayout(m.id, chosen.id)).toBe(true);
    expect(layouts()).toMatchObject({ status: 'applied', appliedId: chosen.id });
    expect(project()).toEqual(chosen.after);
    expect(topologyOf(project())).toBe('u-shaped');
    expect(editor().past).toHaveLength(1);
    expect(editor().past[0]!.label).toBe(`Layout: ${chosen.name}`);

    editor().undo();
    expect(project()).toBe(before);
    editor().redo();
    expect(project()).toEqual(chosen.after);
  });

  it('rejects stale options after the design changes, and generates them again', async () => {
    await chat.send(ACCEPTANCE);
    const m = layouts();
    editor().dispatch({ type: 'set_material', targetIds: ['base1'], materialId: 'shutter-oak' });
    const changed = project();
    expect(await chat.applyLayout(m.id, m.result.candidates[0]!.id)).toBe(false);
    expect(project()).toBe(changed);
    expect(chat.state.messages.find((x) => x.id === m.id)).toMatchObject({ status: 'superseded', note: expect.stringMatching(/design changed/) });
    const fresh = layouts();
    expect(fresh.id).not.toBe(m.id);
    expect(fresh.result.baseRevision).toBe(editor().revision);
    expect(fresh.result.candidates.every((c) => c.after.cabinets.find((x) => x.id === 'base1')!.materialId === 'shutter-oak')).toBe(true);
  });

  it('“apply option two” works by text (and so by voice); rejecting leaves the design alone', async () => {
    await chat.send(ACCEPTANCE);
    const second = layouts().result.candidates[1]!;
    await chat.send('apply option two');
    expect(project()).toEqual(second.after);
    await chat.send('Give me three alternative layouts, prioritizing storage, workflow, and budget');
    const now = project();
    chat.rejectLayouts(layouts().id);
    expect(layouts().status).toBe('rejected');
    expect(project()).toBe(now);
  });

  it('refines: another option excludes those shown; “option two but keep the fridge” stays in that family', async () => {
    await chat.send('Convert this L-shaped kitchen into a U-shaped kitchen, maximize storage');
    const first = layouts();
    await chat.send('Show me another option with more storage');
    const another = layouts();
    expect(chat.state.messages.find((x) => x.id === first.id)).toMatchObject({ status: 'superseded' });
    for (const c of another.result.candidates) expect(first.result.candidates.map((x) => x.id)).not.toContain(c.id);
    expect(another.result.objective.topology).toBe('u-shaped');

    await chat.send('Convert this L-shaped kitchen into a U-shaped kitchen');
    const base = layouts();
    const option2 = base.result.candidates[1]!;
    await chat.send('I prefer option two, but keep the refrigerator where it is');
    const refined = layouts();
    expect(refined.result.objective.preserve).toEqual([{ query: { type: 'refrigerator' } }]);
    for (const c of refined.result.candidates.filter((x) => !x.fallback)) expect(c.recipe.walls).toEqual(option2.recipe.walls);
  });

  it('a project switch while planning discards the options; cancelling plans nothing', async () => {
    const pending = chat.send(ACCEPTANCE);
    editor().openProject(createProject({ name: 'Other', room: DEFAULT_ROOM, layout: 'straight' }));
    chat.reset();
    await pending;
    expect(chat.state.messages).toHaveLength(0);

    editor().openProject(lKitchen12x10());
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const p = chat.send(ACCEPTANCE);
      chat.cancel();
      await vi.runAllTimersAsync();
      await p;
    } finally {
      vi.useRealTimers();
    }
    expect(chat.state.messages.at(-1)).toMatchObject({ kind: 'error', text: expect.stringMatching(/Cancelled/) });
    expect(chat.state.busy).toBe(false);
  });

  it('text and voice editing still work alongside layout options', async () => {
    await chat.send(ACCEPTANCE);
    await chat.send('make the sink 750 mm high');
    const p = chat.state.messages.at(-1)!;
    expect(p).toMatchObject({ kind: 'proposal' });
  });
});
