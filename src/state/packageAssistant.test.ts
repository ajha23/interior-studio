/**
 * Client-package edits from chat and voice: typed requests (deterministic provider), planned against
 * the real package, applied at once when small or held for approval when broad, never touching the
 * design.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Conversation, type ChatMessage } from '@/ai/conversation';
import { finalResponse } from '@/ai/providers/toolLoop';
import { interpret, RuleBasedProvider } from '@/ai/providers/rules';
import type { AssistantRequest } from '@/ai/schema';
import { designRevision } from '@/engine/deliverables/revision';
import { composePage } from '@/engine/package/compose';
import { lKitchen12x10 } from '@/test/kitchens';
import { editorPort } from './assistantStore';
import { useDeliverablesStore } from './deliverablesStore';
import { useEditorStore } from './editorStore';
import { runPackageAction } from './packageAssistant';
import { packageContext, usePackageStore } from './packageStore';

const editor = () => useEditorStore.getState();
const pkgStore = () => usePackageStore.getState();
const pkg = () => pkgStore().pkg!;
let chat: Conversation;
type PackageMessage = Extract<ChatMessage, { kind: 'package' }>;
const last = () => chat.state.messages.at(-1) as PackageMessage;
const say = async (text: string) => {
  await chat.send(text);
  return last();
};
const page = (name: RegExp) => pkg().pages.find((p) => name.test(p.name))!;
const openPage = (name: RegExp) => {
  useDeliverablesStore.getState().setSection('package');
  editor().setView('drawings');
  pkgStore().selectPage(page(name).id);
};
const request = (message: string): AssistantRequest => ({ message, history: [], context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 0 }, project: lKitchen12x10() });

beforeEach(async () => {
  const id = `prj_${Math.random().toString(36).slice(2, 8)}`;
  editor().openProject({ ...lKitchen12x10(), id });
  await pkgStore().load(id);
  chat = new Conversation(editorPort(), new RuleBasedProvider(), { autoApply: false });
});

describe('client package from chat and voice', () => {
  it('reads the brief’s requests as typed package edits', () => {
    const ops = (m: string) => {
      const r = interpret(request(m));
      return r.kind === 'package' ? { page: r.request.page, ops: r.request.ops } : r.kind;
    };
    expect(ops('Change this page to landscape')).toEqual({ page: undefined, ops: [{ op: 'set_orientation', orientation: 'landscape' }] });
    expect(ops('Add a note that the LED strip will be installed after the kitchen is completed')).toEqual({ page: undefined, ops: [{ op: 'add_note', text: 'NOTE: The LED strip will be installed after the kitchen is completed' }] });
    expect(ops('Move the 900 mm dimension label away from the cabinet')).toEqual({ page: undefined, ops: [{ op: 'move_dimension', value: 900, direction: 'away' }] });
    expect(ops('Make the hardware reference images larger')).toEqual({ page: 'hardware', ops: [{ op: 'resize_images', change: 'larger' }] });
    expect(ops('Create an elevation for the left wall')).toEqual({ page: undefined, ops: [{ op: 'add_page', template: 'elevation', wall: 'left' }] });
    expect(ops('Add a project title block to every page')).toEqual({ page: undefined, ops: [{ op: 'title_block' }] });
    expect(ops('Regenerate elevation B using the latest approved model')).toEqual({ page: 'b', ops: [{ op: 'regenerate', revision: 'approved' }] });
    expect(ops('Which pages are outdated?')).toEqual({ page: undefined, ops: [{ op: 'status' }] });
    // Existing deliverable requests keep their meaning.
    expect(ops('Create elevations for the kitchen walls')).toBe('deliverable');
    expect(ops('Regenerate the drawings for the latest approved revision')).toBe('deliverable');
    // The model's tool goes through the same schema; nothing outside it is accepted.
    expect(finalResponse('client_package', { page: 'B', ops: [{ op: 'set_paper', paper: 'A4' }] }).ok).toBe(true);
    expect(finalResponse('client_package', { ops: [{ op: 'set_dimension_value', value: 950 }] }).ok).toBe(false);
  });

  it('offers to create a package when there is none', async () => {
    const m = await say('Which pages are outdated?');
    expect(m.reply.title).toBe('No client package yet');
    runPackageAction(m.reply.actions[0]!.action);
    expect(pkg().pages).toHaveLength(7);
    expect(useDeliverablesStore.getState().section).toBe('package');
  });

  it('applies small edits to the open page at once, undoably, without touching the design', async () => {
    pkgStore().createStarter();
    const revision = designRevision(editor().project!);
    openPage(/Elevation A/);
    let m = await say('Add a note that the LED strip will be installed after the kitchen is completed');
    expect(m.reply.title).toBe('Package updated');
    expect(page(/Elevation A/).notes.map((n) => n.text)).toEqual(['NOTE: The LED strip will be installed after the kitchen is completed']);
    await say('Move the note to the top right');
    const note = page(/Elevation A/).notes[0]!;
    expect(note.x).toBeGreaterThan(200);
    await say('Change this page to portrait');
    expect(page(/Elevation A/).orientation).toBe('portrait');
    m = await say('Move the 800 mm dimension away from the cabinet');
    expect(m.reply.lines[0]).toContain('still reads 800');
    expect(Object.values(page(/Elevation A/).overrides)).toEqual([{ dx: 0, dy: 6 }]);
    await say('Make the hardware reference images larger');
    expect(page(/Hardware/).columns).toBe(4);
    expect(designRevision(editor().project!)).toBe(revision);
    runPackageAction('package:undo');
    expect(page(/Hardware/).columns).toBe(5);
  });

  it('asks instead of guessing', async () => {
    pkgStore().createStarter();
    editor().setView('3d');
    expect((await say('Change this page to landscape')).reply.lines[0]).toMatch(/^Which page\?/);
    expect((await say('Move the 600 mm dimension on elevation A up')).reply.lines[0]).toMatch(/has \d+ dimensions of 600 mm/);
    expect((await say('Move the 1234 mm dimension on elevation A up')).reply.lines[0]).toContain('There is no 1234 mm dimension');
    expect((await say('Create an elevation for wall B')).reply.lines[0]).toBe('Which wall should the new elevation show: back, left, right or front?');
  });

  it('holds broad, destructive and approved-revision edits for approval', async () => {
    pkgStore().createStarter();
    const before = pkg();
    let m = await say('Change every page to A4');
    expect(m.reply.title).toBe('Package changes to approve');
    expect(pkg()).toBe(before);
    runPackageAction(m.reply.actions.find((a) => a.label === 'Apply')!.action);
    expect(pkg().pages.every((p) => p.paper === 'A4')).toBe(true);

    m = await say('Delete the schedule page');
    runPackageAction(m.reply.actions.find((a) => a.label === 'Cancel')!.action);
    expect(pkg().pages.some((p) => p.template === 'schedule')).toBe(true);

    // An approval planned against an older package is not applied over newer edits.
    m = await say('Delete the schedule page');
    pkgStore().dispatch({ type: 'update-page', pageId: page(/Kitchen layout/).id, patch: { heading: 'Main kitchen' } });
    runPackageAction(m.reply.actions.find((a) => a.label === 'Apply')!.action);
    expect(pkg().pages.some((p) => p.template === 'schedule')).toBe(true);
    expect(pkgStore().message?.text).toContain('changed since');

    expect((await say('Regenerate elevation B using the latest approved model')).reply.lines[0]).toContain('No revision has been approved');
  });

  it('reports outdated pages and regenerates one from the current design', async () => {
    pkgStore().createStarter();
    // A fresh package: only the 3D view (nothing captured yet) needs attention.
    expect((await say('Which pages are outdated?')).reply.lines).toEqual(['1 of 7 pages need attention:', '3D view: Missing source data — No 3D view captured yet.']);
    editor().dispatch({ type: 'resize_cabinet', cabinetId: 'base1', dimensions: { width: 600, height: 750, depth: 560 } });
    const m = await say('Which pages are outdated?');
    expect(m.reply.lines[0]).toBe('3 of 7 pages need attention:');
    expect(m.reply.lines.slice(1).join(' ')).toMatch(/Elevation A — Back wall: Technical content stale.*Cabinet schedule: Technical content stale/);
    await say('Regenerate elevation A');
    expect(composePage(pkg(), page(/Elevation A/), packageContext()!).status).toBe('current');
    expect(composePage(pkg(), page(/Cabinet schedule/), packageContext()!).status).toBe('stale');
  });

  it('fills the studio title block on every page', async () => {
    pkgStore().createStarter();
    const m = await say('Set the client to Dr. Example');
    expect(m.reply.lines[0]).toBe('Title block client: “Dr. Example” (all pages).');
    expect(pkg().info.client).toBe('Dr. Example');
    expect((await say('Add a project title block to every page')).reply.lines.join(' ')).toContain('Still empty: address');
  });
});
