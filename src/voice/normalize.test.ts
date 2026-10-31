import { describe, expect, it } from 'vitest';
import { interpret } from '@/ai/providers/rules';
import { lengthToMm } from '@/ai/compile';
import type { AssistantRequest } from '@/ai/schema';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { normaliseSpokenRequest, spokenNumbersToDigits, voiceIntent } from './normalize';

describe('spoken numbers and units', () => {
  it.each([
    ['nine hundred millimetres', '900 mm'],
    ['one thousand two hundred and fifty millimeters', '1250 mm'],
    ['twelve hundred mm', '1200 mm'],
    ['seven hundred fifty mils', '750 mm'],
    ['two point five metres', '2.5 m'],
    ['2 point 4 meters', '2.4 m'],
    ['seventy six centimetres', '76 cm'],
    ['thirty inches', '30 in'],
    ['twelve feet', '12 ft'],
    ['twelve feet six inches', '12 ft 6 in'],
    ['twelve foot six', '12 ft 6 in'],
    ['12 feet 6 inches', '12 ft 6 in'],
    ['12.5 feet', '12.5 ft'],
    ['twelve and a half feet', '12.5 ft'],
    ['twenty-four inches', '24 in'],
    ['a thousand millimetres', '1000 mm'],
  ])('%s → %s', (spoken, expected) => {
    expect(normaliseSpokenRequest(spoken)).toBe(expected);
  });

  it('keeps meaning: decimal feet are not feet-and-inches, and values stay what was said', () => {
    expect(lengthToMm(normaliseSpokenRequest('12.5 feet'), 'w')).toBe(3810); // 12' 6"
    expect(lengthToMm(normaliseSpokenRequest('twelve feet five inches'), 'w')).toBe(3785); // 12' 5"
    expect(lengthToMm(normaliseSpokenRequest('nine hundred millimeters'), 'w')).toBe(900);
    expect(lengthToMm(normaliseSpokenRequest('eight feet'), 'w')).toBe(2438);
    expect(lengthToMm(normaliseSpokenRequest('two point four metres'), 'w')).toBe(2400);
  });

  it('never adds a unit or number that was not spoken and leaves other words alone', () => {
    expect(normaliseSpokenRequest('make it wider')).toBe('make it wider');
    expect(normaliseSpokenRequest('move the first cabinet to the left')).toBe('move the first cabinet to the left');
    expect(normaliseSpokenRequest('rotate it ninety degrees')).toBe('rotate it 90 degrees');
    expect(normaliseSpokenRequest('Make it 750 mm high.')).toBe('Make it 750 mm high');
    expect(spokenNumbersToDigits('add one base cabinet')).toBe('add 1 base cabinet');
    expect(normaliseSpokenRequest('a base cabinet')).toBe('a base cabinet');
  });

  it('recognises voice control phrases only as whole utterances', () => {
    expect(voiceIntent('Stop listening.')).toBe('stop');
    expect(voiceIntent('never mind')).toBe('cancel');
    expect(voiceIntent('Apply.')).toBe('approve');
    expect(voiceIntent('yes, apply it')).toBe('approve');
    expect(voiceIntent('reject that')).toBe('reject');
    expect(voiceIntent('apply walnut to the wall cabinets')).toBeNull();
    expect(voiceIntent('stop the cabinet at the wall')).toBeNull();
  });
});

describe('spoken interior-design instructions', () => {
  const project = createProject({ name: 'Voice', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
  const island = { ...project, cabinets: [...project.cabinets, { ...project.cabinets.find((c) => c.type === 'base')!, id: 'island', wallId: undefined, position: { x: 2100, y: 100, z: 1800 } }] };
  const ask = (spoken: string, selectedId: string | null = null, p = project) =>
    interpret({ message: normaliseSpokenRequest(spoken), history: [], context: { selectedId, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 0 }, project: p } satisfies AssistantRequest);
  const base = project.cabinets.find((c) => c.type === 'base')!;

  it('the brief’s examples', () => {
    expect(ask('Create a kitchen that is twelve feet by ten feet.')).toMatchObject({ kind: 'plan', operations: [{ op: 'set_room', width: '12 ft', length: '10 ft' }] });
    expect(ask('Make this base cabinet 900 millimeters wide.', base.id)).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', target: { ref: 'selected' }, width: '900 mm' }] });
    expect(ask('Change the island length to eight feet.', null, island)).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', target: { query: { kind: 'cabinet', freeStanding: true } }, width: '8 ft' }] });
    expect(ask('Move the selected cabinet 300 millimeters to the left.', base.id)).toMatchObject({ kind: 'plan', operations: [{ op: 'move_by', target: { ref: 'selected' }, distance: '300 mm', direction: 'left' }] });
    expect(ask('Make all upper cabinets 750 millimeters tall.')).toMatchObject({ kind: 'plan', operations: [{ op: 'resize', target: { query: { type: 'wall', all: true } }, height: '750 mm' }] });
    expect(ask('Change the selected cabinet finish to matte white.', base.id)).toMatchObject({ kind: 'plan', operations: [{ op: 'set_finish', target: { ref: 'selected' }, finish: 'White matte' }] });
    expect(ask('Show me the dimensions of this room.')).toMatchObject({ kind: 'answer', show: 'room' });
    expect(ask('Undo that last change.')).toMatchObject({ kind: 'history', action: 'undo' });
  });

  it('asks instead of inventing a missing dimension or guessing “this”', () => {
    expect(ask('make the sink wider')).toMatchObject({ kind: 'clarify', question: expect.stringMatching(/How much wider/) });
    expect(ask('make this cabinet taller', base.id)).toMatchObject({ kind: 'clarify' });
    expect(ask('resize this base cabinet', base.id)).toMatchObject({ kind: 'clarify', question: expect.stringMatching(/What size/) });
    // "This base cabinet" with nothing selected becomes a query, so several matches lead to a question.
    expect(ask('make this base cabinet 900 millimetres wide')).toMatchObject({ kind: 'plan', operations: [{ target: { query: { type: 'base' } } }] });
  });
});

describe('conversation control phrases', () => {
  it('recognises ways to end a conversation without catching ordinary requests', async () => {
    const { voiceIntent } = await import('./normalize');
    for (const t of ['goodbye', 'Bye bye.', 'okay goodbye', 'end conversation', 'end the conversation', 'stop the chat', "that's all", "thanks that's all", "we're done"]) expect(voiceIntent(t), t).toBe('end');
    for (const t of ['end panel on the left', 'make the end cabinet 600', 'stop', 'all done with the sink?']) expect(voiceIntent(t), t).not.toBe('end');
    expect(voiceIntent('wait')).toBe('stop');
  });
});
