/**
 * Designer conversations end to end: rule-based provider → reference resolution → isolated dry run
 * → preview → approval → atomic commit into the real editor store → undo/redo.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Conversation, type ChatMessage } from '@/ai/conversation';
import { showRows } from '@/ai/inspect';
import { RuleBasedProvider } from '@/ai/providers/rules';
import { ProviderError, type AssistantProvider } from '@/ai/providers/types';
import { allElements, createExampleProject, createProject, DEFAULT_ROOM, offsetAlongWall, type KitchenElement, type KitchenProject } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { buildParts } from '@/engine/geometry/parts';
import { localToRoom } from '@/engine/geometry/transform';
import { sequentialIds } from '@/test/ids';
import { editorPort } from './assistantStore';
import { useEditorStore } from './editorStore';

const editor = () => useEditorStore.getState();
const project = () => editor().project!;
let chat: Conversation;

function open(p: KitchenProject, autoApply = false, provider: AssistantProvider = new RuleBasedProvider()) {
  editor().openProject(p);
  chat = new Conversation(editorPort(), provider, { autoApply });
}

const last = (): ChatMessage => chat.state.messages.at(-1)!;
function lastProposal() {
  const m = last();
  if (m.role !== 'assistant' || m.kind !== 'proposal') throw new Error(`Expected a proposal, got ${JSON.stringify(m).slice(0, 300)}`);
  return m;
}
async function say(text: string) {
  await chat.send(text);
  return last();
}
async function sayAndApply(text: string) {
  await chat.send(text);
  const m = lastProposal();
  expect(m.status, m.proposal.errors.join(' ')).toBe('proposed');
  chat.approve(m.id);
  expect(lastProposal().status).toBe('applied');
  return m;
}

/** The plan draws `elementBox`; the 3D view draws procedural parts placed with `localToRoom`. */
function expect2dAnd3dInSync(p: KitchenProject) {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  for (const el of allElements(p)) {
    const pts = buildParts(el)
      .filter((x) => x.body)
      .flatMap((x) => [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => localToRoom(el, { x: x.center.x + (sx * x.size.x) / 2, y: x.center.y + (sy * x.size.y) / 2, z: x.center.z + (sz * x.size.z) / 2 })))));
    const box3d = { minX: r(Math.min(...pts.map((q) => q.x))), maxX: r(Math.max(...pts.map((q) => q.x))), minY: r(Math.min(...pts.map((q) => q.y))), maxY: r(Math.max(...pts.map((q) => q.y))), minZ: r(Math.min(...pts.map((q) => q.z))), maxZ: r(Math.max(...pts.map((q) => q.z))) };
    expect(box3d, `${el.type} ${el.id}`).toEqual(elementBox(el));
  }
}

const empty = () => createProject({ name: 'Chat', room: DEFAULT_ROOM, layout: 'empty' }, sequentialIds());
const find = (pred: (e: KitchenElement) => boolean) => allElements(project()).find(pred);

beforeEach(() => open(empty()));

describe('acceptance scenarios', () => {
  it('A: “Create a 900 mm base cabinet” adds a real, inspectable cabinet shown in 2D and 3D', async () => {
    const m = await sayAndApply('Create a 900 mm base cabinet.');
    const id = m.proposal.created[0]!;
    expect(project().cabinets).toEqual([expect.objectContaining({ id, type: 'base', dimensions: { width: 900, height: 720, depth: 560 } })]);
    expect(editor().selectedId).toBe(id);
    expect2dAnd3dInSync(project());
    const answer = await say('Show me all cabinet dimensions');
    expect(answer).toMatchObject({ kind: 'answer', show: 'cabinets' });
    expect(showRows(project(), 'cabinets', null)).toMatchObject({ kind: 'entities', rows: [{ id, width: 900, height: 720, depth: 560 }] });
  });

  it('B: “Make it 750 mm high” resizes that cabinet and no other', async () => {
    await sayAndApply('Add a 600 mm base cabinet on the left wall');
    const other = project().cabinets[0]!;
    const m = await sayAndApply('Create a 900 mm base cabinet');
    const id = m.proposal.created[0]!;
    await sayAndApply('Make it 750 mm high.');
    expect(project().cabinets.find((c) => c.id === id)!.dimensions).toEqual({ width: 900, height: 750, depth: 560 });
    expect(project().cabinets.find((c) => c.id === other.id)).toEqual(other);
  });

  it('C: “Move the refrigerator 600 mm to the right” moves it exactly 600 mm along its wall', async () => {
    editor().dispatch({ type: 'add_appliance', applianceType: 'fridge', id: 'fridge', placement: { wallId: 'back', offset: 0 } });
    const before = find((e) => e.id === 'fridge')!;
    const m = await sayAndApply('Move the refrigerator 600 mm to the right.');
    const after = find((e) => e.id === 'fridge')!;
    expect(after.position.x - before.position.x).toBe(600);
    expect(offsetAlongWall(after)).toBe(600);
    expect(m.proposal.changes!.modified[0]).toMatchObject({ before: { offset: 0 }, after: { offset: 600 } });
    // Subject to validation: it cannot go through the right wall.
    const blocked = await say('Move the refrigerator 6000 mm to the right');
    expect(blocked).toMatchObject({ kind: 'proposal', status: 'failed' });
    expect(find((e) => e.id === 'fridge')).toEqual(after);
  });

  it('D: “Change all measurements to feet and inches” changes display only', async () => {
    open(createExampleProject(sequentialIds()));
    const geometry = JSON.stringify({ room: project().room, c: project().cabinets, a: project().appliances, o: project().openings });
    await sayAndApply('Change all measurements to feet and inches');
    expect(project().preferences.unit).toBe('ft-in');
    expect(JSON.stringify({ room: project().room, c: project().cabinets, a: project().appliances, o: project().openings })).toBe(geometry);
  });

  it('E: “Add a cabinet that overlaps the door” is rejected with the collision explained', async () => {
    editor().dispatch({ type: 'add_opening', kind: 'door', id: 'door', wallId: 'back', offset: 1500 });
    const before = project();
    const m = await say('Add a cabinet that overlaps the door');
    expect(m).toMatchObject({ kind: 'proposal', status: 'failed' });
    const p = lastProposal().proposal;
    expect(p.errors.join(' ')).toMatch(/Base cabinet 600 (blocks|is in the swing of) the door on the back wall/);
    expect(p.alternatives.length).toBeGreaterThan(0);
    expect(project()).toBe(before);
    // Accepting a suggested alternative gives a valid proposal.
    chat.useAlternative(m.id, 0);
    expect(lastProposal().status).toBe('proposed');
  });

  it('F: “Undo the last operation” reverts the whole preceding transaction', async () => {
    open(createProject({ name: 'Undo', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds()));
    const before = project();
    await sayAndApply('Change all base cabinets to 750 mm height');
    await sayAndApply('make the wall cabinets walnut');
    const afterBoth = project();
    expect(editor().past).toHaveLength(2);
    const u = await say('Undo the last operation');
    expect(u).toMatchObject({ kind: 'history', text: expect.stringMatching(/^Undid: Assistant: Applied Walnut/) });
    expect(project().cabinets.filter((c) => c.type === 'wall').every((c) => c.materialId === 'shutter-white-matte')).toBe(true);
    await say('undo');
    expect(project()).toBe(before);
    await say('redo');
    await say('redo');
    expect(project()).toBe(afterBoth);
    expect(project().cabinets.filter((c) => c.type === 'wall').every((c) => c.materialId === 'shutter-walnut')).toBe(true);
  });
});

describe('conversation context', () => {
  it('“it” follows a pending proposal: the follow-up is merged into one change', async () => {
    const first = await say('Create a base cabinet 900 mm wide');
    expect(first).toMatchObject({ kind: 'proposal', status: 'proposed' });
    const second = await say('Make it 750 mm high');
    expect(chat.state.messages.find((m) => m.id === first.id)).toMatchObject({ status: 'superseded' });
    expect(second).toMatchObject({ kind: 'proposal', status: 'proposed' });
    chat.approve(second.id);
    expect(project().cabinets).toEqual([expect.objectContaining({ dimensions: { width: 900, height: 750, depth: 560 } })]);
    expect(editor().past).toHaveLength(1);
  });

  it('offers to place a new unit beside the selected sink, and “the previous one” refers back', async () => {
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'sink', id: 'sink', placement: { wallId: 'back', offset: 1000 } });
    editor().select('sink');
    const m = await sayAndApply('Create a 900 mm wide base cabinet');
    expect(m.proposal.explanation).toMatch(/beside the selected Sink unit 800/);
    const cab = find((e) => e.id === m.proposal.created[0])!;
    expect(offsetAlongWall(cab)).toBe(1800);
    await sayAndApply('Add a 600 mm dishwasher on the left wall');
    await sayAndApply('delete the previous one');
    expect(find((e) => e.id === cab.id)).toBeUndefined();
    expect(project().appliances).toHaveLength(1);
  });

  it('asks one focused question when a reference is ambiguous, then uses the answer', async () => {
    await sayAndApply('add a 600 mm base cabinet on the back wall');
    await sayAndApply('add a 600 mm base cabinet on the left wall');
    chat.reset();
    const q = await say('move the base cabinet 100 mm to the left');
    expect(q).toMatchObject({ kind: 'clarify', question: expect.stringMatching(/Which/) });
    if (q.role !== 'assistant' || q.kind !== 'clarify') throw new Error();
    expect(q.options).toHaveLength(2);
    const target = q.options[1]!.ids![0]!;
    const before = offsetAlongWall(find((e) => e.id === target)!);
    chat.choose(q.id, 1);
    chat.approve(lastProposal().id);
    expect(offsetAlongWall(find((e) => e.id === target)!)).toBe(before + 100); // left wall: left (seen facing it) = towards the front wall
    // A typed answer works too.
    await say('move the base cabinet 50 mm to the right');
    await say('the first one');
    expect(lastProposal().proposal.named).toEqual([q.options[0]!.ids![0]]);
  });

  it('refreshes a stale preview when the project changed outside the conversation', async () => {
    await say('Create a 900 mm base cabinet');
    const stale = lastProposal();
    editor().dispatch({ type: 'add_appliance', applianceType: 'fridge', id: 'f', placement: { wallId: 'back', offset: 0 } });
    chat.approve(stale.id);
    expect(chat.state.messages.find((m) => m.id === stale.id)).toMatchObject({ status: 'superseded' });
    const fresh = lastProposal();
    expect(fresh).toMatchObject({ status: 'proposed', note: expect.stringMatching(/project changed/) });
    expect(fresh.proposal.baseRevision).toBe(editor().revision);
    expect(project().cabinets).toHaveLength(0);
    chat.approve(fresh.id);
    expect(project().cabinets).toHaveLength(1);
    expect(allElements(project()).map((e) => e.id)).toContain('f');
  });

  it('keeps the window wall unchanged when asked', async () => {
    open(createExampleProject(sequentialIds()));
    await say('Keep the window wall unchanged while modifying the kitchen layout');
    expect(chat.state.protect.walls).toEqual(['back']);
    const refused = await say('make the sink 750 mm high');
    expect(refused).toMatchObject({ kind: 'proposal', status: 'failed' });
    expect(lastProposal().proposal.errors[0]).toMatch(/back wall, which you asked me to keep unchanged/);
    await sayAndApply('make the fridge 600 mm wide');
    await say('unlock');
    expect(chat.state.protect.walls).toEqual([]);
  });
});

describe('preview, approval and execution', () => {
  it('nothing changes until the designer approves; rejecting leaves the project untouched', async () => {
    const before = project();
    const m = await say('Create a 900 mm base cabinet');
    expect(project()).toBe(before);
    const p = lastProposal().proposal;
    expect(p.changes!.added).toEqual([expect.objectContaining({ label: 'Base cabinet 900', after: expect.objectContaining({ width: 900, wallId: 'back', offset: 0 }) })]);
    chat.reject(m.id);
    expect(lastProposal().status).toBe('rejected');
    expect(project()).toBe(before);
    expect(editor().past).toHaveLength(0);
  });

  it('auto-applies safe single edits when enabled, but still asks before deleting', async () => {
    open(empty(), true);
    await chat.send('Create a 900 mm base cabinet');
    expect(lastProposal()).toMatchObject({ status: 'applied', autoApplied: true });
    await chat.send('delete it');
    expect(lastProposal().status).toBe('proposed');
    expect(project().cabinets).toHaveLength(1);
  });

  it('logs requests, proposals and commits with revisions', async () => {
    await sayAndApply('Create a 900 mm base cabinet');
    expect(chat.state.log.map((l) => l.event)).toEqual(['request', 'response', 'proposal', 'applied']);
    expect(chat.state.log.at(-1)).toMatchObject({ revision: editor().revision, commands: 1 });
  });

  it('keeps 2D and 3D in sync after a multi-step assistant edit', async () => {
    open(createExampleProject(sequentialIds()));
    await sayAndApply('make the fridge 600 mm wide');
    await sayAndApply('add a 1800 mm table');
    await sayAndApply('rotate it 90 degrees');
    await sayAndApply('move it 300 mm towards the front wall');
    expect2dAnd3dInSync(project());
  });
});

describe('provider failures', () => {
  const failing = (error: unknown): AssistantProvider => ({ id: 'failing', respond: () => Promise.reject(error) });

  it('shows rate limits, timeouts and malformed output as errors and changes nothing', async () => {
    for (const [error, pattern, retryable] of [
      [new ProviderError('rate_limited', 'Rate limited.', true, 20), /Rate limited\. \(about 20 s\)/, true],
      [new ProviderError('timeout', 'Too slow.', true), /Too slow/, true],
      [new ProviderError('malformed_output', 'Garbage.', true), /Garbage\. Nothing was changed/, true],
      [new Error('boom'), /boom/, true],
    ] as const) {
      open(empty(), false, failing(error));
      const before = project();
      const m = await say('Create a 900 mm base cabinet');
      expect(m).toMatchObject({ kind: 'error', text: expect.stringMatching(pattern), retryable });
      expect(project()).toBe(before);
      expect(chat.state.busy).toBe(false);
    }
  });

  it('can be cancelled while waiting', async () => {
    const slow: AssistantProvider = { id: 'slow', respond: (_r, signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new ProviderError('timeout', 'Cancelled.', true)))) };
    open(empty(), false, slow);
    const pending = chat.send('Create a 900 mm base cabinet');
    expect(chat.state.busy).toBe(true);
    chat.cancel();
    await pending;
    expect(last()).toMatchObject({ kind: 'error', text: 'Cancelled.', retryable: false });
  });
});
