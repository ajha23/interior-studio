import { describe, expect, it } from 'vitest';
import { createExampleProject, createProject, DEFAULT_ROOM, type KitchenProject } from '@/domain';
import { sequentialIds } from '@/test/ids';
import type { AssistantRequest } from '../schema';
import { interpret } from './rules';

const straight = createProject({ name: 'Rules', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
const req = (message: string, over: Partial<AssistantRequest['context']> = {}, project: KitchenProject = straight): AssistantRequest => ({
  message,
  history: [],
  context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 0, ...over },
  project,
});

describe('rule-based provider', () => {
  it.each([
    ['Create a 900 mm wide base cabinet.', { op: 'create_cabinet', cabinetType: 'base', width: '900 mm' }],
    ['Create a 900 mm base cabinet', { op: 'create_cabinet', cabinetType: 'base', width: '900 mm' }],
    ['Make it 750 mm high.', { op: 'resize', target: { ref: 'it' }, height: '750 mm' }],
    ['Move the selected cabinet 300 mm to the right.', { op: 'move_by', target: { ref: 'selected' }, distance: '300 mm', direction: 'right' }],
    ['Move the refrigerator 600 mm to the right', { op: 'move_by', target: { query: { type: 'refrigerator' } }, distance: '600 mm', direction: 'right' }],
    ['Change all base cabinets to 750 mm height.', { op: 'resize', target: { query: { type: 'base', all: true } }, height: '750 mm' }],
    ['Add a 600 mm dishwasher next to the sink cabinet.', { op: 'create_appliance', applianceType: 'dishwasher', width: '600 mm', placement: { nextTo: { query: { type: 'sink' } }, side: 'auto' } }],
    ['Change the room width to 12 feet.', { op: 'set_room', width: '12 feet' }],
    ['Change all measurements to feet and inches', { op: 'set_units', unit: 'ft-in' }],
    ['delete the dishwasher', { op: 'delete', target: { query: { type: 'dishwasher' } } }],
    ['rotate it 90 degrees clockwise', { op: 'rotate', target: { ref: 'it' }, degrees: 270 }],
    ['make the wall cabinets walnut', { op: 'set_finish', target: { query: { type: 'wall', all: true } }, finish: 'Walnut' }],
    ['change the worktop to black granite', { op: 'set_surface_finish', surface: 'countertop', finish: 'Black granite' }],
    ['make the sink 100 mm wider', { op: 'resize_by', target: { query: { type: 'sink' } }, width: '100 mm' }],
    ['move the hood up 50 mm', { op: 'move_by', target: { query: { type: 'hood' } }, distance: '50 mm', direction: 'up' }],
    ['move the fridge to the left wall', { op: 'move_to', target: { query: { type: 'fridge' } }, placement: { wall: 'left' } }],
    ['add a window on the left wall 1200 mm wide', { op: 'create_opening', kind: 'window', width: '1200 mm', wall: 'left' }],
    ['delete the cabinet next to the refrigerator', { op: 'delete', target: { query: { kind: 'cabinet', nextTo: { query: { type: 'refrigerator' } } } } }],
  ])('%s', (message, expected) => {
    const r = interpret(req(message, { focus: ['x'] }));
    expect(r.kind).toBe('plan');
    if (r.kind === 'plan') expect(r.operations[0]).toMatchObject(expected);
  });

  it('answers questions with tables from the project, and handles undo, redo and locks', () => {
    expect(interpret(req('Show me all cabinet dimensions'))).toMatchObject({ kind: 'answer', show: 'cabinets' });
    expect(interpret(req('how big is the room?'))).toMatchObject({ kind: 'answer', show: 'room' });
    expect(interpret(req('Undo the last change'))).toEqual({ kind: 'history', action: 'undo', steps: 1 });
    expect(interpret(req('undo the last two changes'))).toEqual({ kind: 'history', action: 'undo', steps: 2 });
    expect(interpret(req('redo'))).toMatchObject({ kind: 'history', action: 'redo' });
    const example = createExampleProject(sequentialIds());
    expect(interpret(req('Keep the window wall unchanged while modifying the kitchen layout', {}, example))).toMatchObject({ kind: 'answer', protect: { walls: ['back'] } });
  });

  it('chains steps and refers back to what an earlier step created', () => {
    const r = interpret(req('add a 600 mm base cabinet on the left wall then make it 800 mm high'));
    expect(r).toMatchObject({ kind: 'plan', operations: [{ op: 'create_cabinet', placement: { wall: 'left' } }, { op: 'resize', target: { created: 0 }, height: '800 mm' }] });
  });

  it('places a new unit beside the selected one, and over a door when asked to overlap it', () => {
    const sink = straight.cabinets.find((c) => c.type === 'sink')!;
    expect(interpret(req('Create a 900 mm base cabinet', { selectedId: sink.id }))).toMatchObject({ kind: 'plan', explanation: expect.stringMatching(/beside the selected Sink unit 800/), operations: [{ placement: { near: { ref: 'selected' } } }] });
    const withDoor = { ...straight, openings: [{ id: 'door1', kind: 'door' as const, wallId: 'right' as const, offset: 1000, width: 900, height: 2100, sill: 0, swing: 'in' as const, hinge: 'left' as const }] };
    expect(interpret(req('Add a cabinet that overlaps the door', {}, withDoor))).toMatchObject({ kind: 'plan', operations: [{ op: 'create_cabinet', placement: { wall: 'right', offset: 1000 } }] });
  });

  it('bare numbers use the display unit', () => {
    const r = interpret(req('make it 30 high', { focus: ['x'] }, { ...straight, preferences: { unit: 'in' } }));
    expect(r).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', height: { value: 30, unit: 'in' } }] });
  });

  it('says so instead of guessing when it does not understand', () => {
    expect(interpret(req('sing me a song'))).toMatchObject({ kind: 'answer', text: expect.stringMatching(/didn't understand/) });
    expect(interpret(req('move it'))).toMatchObject({ kind: 'answer' });
  });
});
