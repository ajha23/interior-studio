/**
 * Deliverables through the app: chat/voice requests answered from the engine, generated files that
 * record their revision, stale detection after an edit, regeneration, approved revisions and
 * presentation mode. Uses the deterministic provider and fixtures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation, type ChatMessage } from '@/ai/conversation';
import { interpret } from '@/ai/providers/rules';
import type { AssistantRequest } from '@/ai/schema';
import { designRevision } from '@/engine/deliverables/revision';
import { lKitchen12x10 } from '@/test/kitchens';
import { editorPort } from './assistantStore';
import { isStale, runDeliverableAction, useDeliverablesStore } from './deliverablesStore';
import { useEditorStore } from './editorStore';
import { RuleBasedProvider } from '@/ai/providers/rules';

const editor = () => useEditorStore.getState();
const store = () => useDeliverablesStore.getState();
let chat: Conversation;
type Deliverable = Extract<ChatMessage, { kind: 'deliverable' }>;
const last = () => chat.state.messages.at(-1) as Deliverable;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }));
  editor().openProject({ ...lKitchen12x10(), id: `prj_${Math.random().toString(36).slice(2, 8)}` });
  chat = new Conversation(editorPort(), new RuleBasedProvider(), { autoApply: false });
});
afterEach(() => {
  editor().setPresenting(false);
  vi.unstubAllGlobals();
});

describe('chat and voice requests for deliverables', () => {
  const ask = (message: string) => interpret({ message, history: [], context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 0 }, project: lKitchen12x10() } satisfies AssistantRequest);

  it('reads the brief’s requests as typed deliverable tools', () => {
    expect(ask('Generate a dimensioned floor plan.')).toEqual({ kind: 'deliverable', request: { action: 'plan', revision: 'current' } });
    expect(ask('Create elevations for the kitchen walls.')).toMatchObject({ request: { action: 'elevations', kitchenWalls: true } });
    expect(ask('Show me a schedule of all base cabinets.')).toMatchObject({ request: { action: 'schedule', filter: { type: 'base' } } });
    expect(ask('Generate a BOM for the current kitchen.')).toMatchObject({ request: { action: 'bom' } });
    expect(ask('Tell me what information is missing before I can send this to the carpenter.')).toMatchObject({ request: { action: 'readiness' } });
    expect(ask('Export the current drawings to PDF.')).toMatchObject({ request: { action: 'export-pdf', revision: 'current' } });
    expect(ask('Regenerate the drawings for the latest approved revision.')).toMatchObject({ request: { action: 'regenerate', revision: 'approved' } });
    // Unchanged: ordinary questions and edits.
    expect(ask('Show me all cabinet dimensions').kind).toBe('answer');
    expect(ask('Make it 750 mm high').kind).toBe('plan');
  });

  it('answers from the model: plan, schedule filter, BOM and what is missing', async () => {
    await chat.send('Generate a dimensioned floor plan');
    expect(last()).toMatchObject({ kind: 'deliverable', reply: { title: 'Dimensioned floor plan', revision: designRevision(editor().project!) } });
    expect(last().reply.lines[0]).toMatch(/3658 × 3048 mm room \(walls 114 mm\), 1:25 on A3, \d+ dimensions measured from the model/);

    await chat.send('Show me a schedule of all base cabinets');
    expect(last().reply.table!.rows.map((r) => r[0])).toEqual(['C4', 'C8']);
    expect(last().reply.table!.rows.every((r) => r[1] === 'Base cabinet')).toBe(true);

    await chat.send('Generate a BOM for the current kitchen');
    expect(last().reply.title).toBe('Bill of materials (partial)');
    expect(last().reply.lines[0]).toMatch(/No construction method is chosen/);

    await chat.send('Tell me what information is missing before I can send this to the carpenter');
    expect(last().reply.title).toBe('Not ready for manufacturing');
    expect(last().reply.lines.join(' ')).toMatch(/Blocking: No construction method is chosen/);
  });
});

describe('generated files and revisions', () => {
  it('records the revision, detects stale outputs after an edit, and regenerates for the new revision', () => {
    const before = designRevision(editor().project!);
    const pdf = store().generate('pdf-set')!;
    expect(pdf.mime).toBe('application/pdf');
    expect(pdf.fileName).toMatch(new RegExp(`${before.slice(0, 8)}-drawings\\.pdf$`));
    expect(pdf.record).toMatchObject({ revision: before, source: 'current', kind: 'pdf-set', unit: 'mm', readiness: { manufacturing: { status: 'blocked' } } });
    expect(isStale(pdf.record, store().approvals)).toBe(false);
    const csv = store().generate('schedule-csv')!;
    expect(String(csv.data)).toContain('C2');

    editor().dispatch({ type: 'resize_cabinet', cabinetId: 'base1', dimensions: { width: 600, height: 750, depth: 560 } });
    const after = designRevision(editor().project!);
    expect(after).not.toBe(before);
    expect(store().history.map((r) => isStale(r, store().approvals))).toEqual([true, true]);
    const again = store().regenerate(pdf.record.id)!;
    expect(again.record.revision).toBe(after);
    expect(isStale(again.record, store().approvals)).toBe(false);
    // The schedule now shows the new height.
    expect(String(store().generate('schedule-csv')!.data)).toMatch(/C4,base1,Base cabinet,Back wall run 1,600,750,560/);
  });

  it('keeps approved revisions and regenerates drawings for the latest approved one', async () => {
    const approval = store().approveCurrent()!;
    editor().dispatch({ type: 'resize_cabinet', cabinetId: 'base1', dimensions: { width: 600, height: 750, depth: 560 } });
    await chat.send('Regenerate the drawings for the latest approved revision');
    expect(last()).toMatchObject({ kind: 'deliverable', reply: { revision: approval.revision } });
    const file = runDeliverableAction('download:pdf-set:approved')!;
    expect(file.record).toMatchObject({ source: 'approved', revision: approval.revision });
    expect(store().source).toEqual({ kind: 'current' });
    // A newer approval makes outputs of the older one stale.
    expect(isStale(file.record, store().approvals)).toBe(false);
    store().approveCurrent();
    expect(isStale(file.record, store().approvals)).toBe(true);
  });

  it('cut lists are only offered with construction rules', () => {
    expect(store().generate('cutlist-csv')).toBeNull();
    editor().dispatch({ type: 'set_production_settings', settings: { constructionId: 'frameless-18' } });
    const cut = store().generate('cutlist-csv')!;
    expect(String(cut.data)).toContain('Side,White carcass,18,720,542');
    expect(String(cut.data)).not.toMatch(/ C1( |$)/m);
    editor().undo();
    expect(editor().project!.production.constructionId).toBeUndefined();
  });
});

describe('presentation mode', () => {
  it('hides editing (interact mode) without changing the design, and restores on exit', () => {
    const before = editor().project;
    runDeliverableAction('present');
    expect(editor()).toMatchObject({ presenting: true, interactMode: true, view: '3d' });
    expect(editor().project).toBe(before);
    editor().setPresenting(false);
    expect(editor()).toMatchObject({ presenting: false, interactMode: false });
  });
});
