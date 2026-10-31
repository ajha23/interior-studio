import { describe, expect, it } from 'vitest';
import { allElements, createProject, executeBatch, offsetAlongWall, type DesignCommand, type KitchenProject } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { buildParts } from '@/engine/geometry/parts';
import { localToRoom } from '@/engine/geometry/transform';
import { lKitchen12x10, narrowLKitchen } from '@/test/kitchens';
import { interpret } from '../providers/rules';
import { DesignObjectiveSchema, type AssistantRequest, type DesignObjectiveInput } from '../schema';
import { evaluate, rulesFor, walkwayOf, type ResolvedObjective } from './constraints';
import { storageLitres } from './metrics';
import { PlanCancelled, planLayouts, resolveObjective, signature, type PlanOptions, type PlanResult } from './planner';
import { fillWidths, topologyOf } from './runs';
import { SCORE_METHOD } from './score';

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_t${++n}`;
};
const opts = (over: Partial<PlanOptions> = {}): PlanOptions => ({ revision: 1, selectedId: null, focus: [], previousFocus: [], newId: ids(), ...over });
const objective = (o: Partial<DesignObjectiveInput>) => DesignObjectiveSchema.parse({ goal: 'test', ...o });
async function plan(p: KitchenProject, o: Partial<DesignObjectiveInput>, over: Partial<PlanOptions> = {}): Promise<PlanResult> {
  const r = await planLayouts(p, objective(o), opts(over));
  if (r.kind !== 'plan') throw new Error(`Expected a plan, got: ${r.question}`);
  return r.result;
}
const resolved = (p: KitchenProject, o: Partial<DesignObjectiveInput>): ResolvedObjective => {
  const r = resolveObjective(p, objective(o), opts());
  if (!r.ok) throw new Error(r.question);
  return r.resolved;
};
const ACCEPTANCE = 'Convert this L-shaped kitchen into a U-shaped kitchen. Preserve the sink on its existing wall, keep the refrigerator in place, maximize storage, and maintain all configured clearances.';
const ask = (message: string, project: KitchenProject) =>
  interpret({ message, history: [], context: { selectedId: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, revision: 0 }, project } satisfies AssistantRequest);

describe('design intent', () => {
  it('turns the acceptance request into a structured objective', () => {
    const r = ask(ACCEPTANCE, lKitchen12x10());
    expect(r).toMatchObject({ kind: 'design', objective: { topology: 'u-shaped', keepSinkWall: true, preserve: [{ query: { type: 'refrigerator' } }], priorities: ['storage'], clearances: 'hard' } });
    expect(r.kind === 'design' && r.explanation).toMatch(/U-shaped.*keeping the sink on its wall, the refrigerator in place.*ranked by storage/);
  });

  it('reads the other goals and refinements', () => {
    const p = lKitchen12x10();
    expect(ask('Redesign this kitchen to maximize usable countertop space', p)).toMatchObject({ objective: { topology: 'keep', priorities: ['counter'] } });
    expect(ask('Keep the sink on the existing plumbing wall, move the refrigerator closer to the entrance, and add more storage', p)).toMatchObject({ objective: { keepSinkWall: true, moveNear: { to: 'entrance' }, priorities: ['storage'] } });
    expect(ask('Create a kitchen layout suitable for a 12 ft by 10 ft room', p)).toMatchObject({ objective: { roomSize: { width: '12 ft', length: '10 ft' } } });
    expect(ask('Optimize this layout while preserving the existing appliances', p)).toMatchObject({ objective: { preserveAppliances: true } });
    expect(ask('Give me three alternative layouts, prioritizing storage, workflow, and budget', p)).toMatchObject({ objective: { alternatives: 3, priorities: ['storage', 'workflow', 'budget'] } });
    expect(ask('Find and fix all cabinet collisions and clearance violations', p)).toMatchObject({ objective: { fixIssues: true } });
    expect(ask('Maximize storage, but keep at least 1000 mm walking clearance', p)).toMatchObject({ objective: { minWalkway: '1000 mm' } });
    expect(ask('Only modify the upper cabinets and prefer the lowest-cost option', p)).toMatchObject({ objective: { scope: 'upper-only', priorities: ['budget'] } });
    expect(ask('Show me another option with more storage', p)).toMatchObject({ kind: 'design', refine: { another: true }, objective: { priorities: ['storage'] } });
    expect(ask('I prefer option two, but keep the refrigerator where it is', p)).toMatchObject({ kind: 'design', refine: { option: 2 }, objective: { preserve: [{ query: { type: 'refrigerator' } }] } });
    // Ordinary edits are not layout goals.
    expect(ask('Make it 750 mm high', p).kind).not.toBe('design');
    expect(ask('Keep the window wall unchanged while modifying the kitchen layout', p).kind).toBe('answer');
  });

  it('rejects malformed objectives', () => {
    expect(DesignObjectiveSchema.safeParse({ goal: 'x', topology: 'h-shaped' }).success).toBe(false);
    expect(DesignObjectiveSchema.safeParse({ goal: 'x', alternatives: 50 }).success).toBe(false);
    expect(DesignObjectiveSchema.safeParse({ goal: 'x', roomWidth: 4000 }).success).toBe(false);
    expect(DesignObjectiveSchema.safeParse({ goal: 'x', preserve: [{ id: 'bad id!' }] }).success).toBe(false);
  });

  it('asks when information is missing or contradictory instead of guessing', async () => {
    const noSink = createProject({ name: 'Empty', room: { width: 3000, length: 3000, height: 2600, wallThickness: 150 }, layout: 'empty' });
    expect(await planLayouts(noSink, objective({ keepSinkWall: true }), opts())).toMatchObject({ kind: 'question', question: expect.stringMatching(/no sink/) });
    const p = lKitchen12x10();
    expect(await planLayouts({ ...p, openings: [] }, objective({ moveNear: { target: { query: { type: 'fridge' } }, to: 'entrance' } }), opts())).toMatchObject({ kind: 'question', question: expect.stringMatching(/no door/) });
    expect(await planLayouts(p, objective({ preserve: [{ query: { type: 'fridge' } }], moveNear: { target: { query: { type: 'fridge' } }, to: 'entrance' } }), opts())).toMatchObject({ kind: 'question', question: expect.stringMatching(/both to move/) });
  });
});

describe('constraint engine', () => {
  it('separates hard rules from soft preferences, with sources', () => {
    const p = lKitchen12x10();
    const rules = rulesFor(resolved(p, { keepSinkWall: true, preserve: [{ id: 'fridge' }] }), p);
    expect(rules.filter((r) => r.kind === 'hard').map((r) => r.id)).toEqual(expect.arrayContaining(['room', 'overlap', 'sizes', 'openings', 'clearance', 'walkway', 'preserve', 'sink-wall']));
    expect(rules.filter((r) => r.kind === 'soft').map((r) => r.id)).toEqual(['heights', 'landing', 'triangle']);
    expect(rules.find((r) => r.id === 'walkway')).toMatchObject({ source: 'design guidance', note: expect.stringMatching(/not a building code/) });
    const soft = rulesFor(resolved(p, { clearances: 'soft' }), p);
    expect(soft.find((r) => r.id === 'clearance')!.kind).toBe('soft');
    expect(walkwayOf(objective({ minWalkway: '1000 mm' }))).toEqual({ mm: 1000, fromDesigner: true });
  });

  it('detects overlaps, units outside the room, blocked openings and clearance clashes', () => {
    const p = lKitchen12x10();
    const r = resolved(p, {});
    const bad = (cmds: DesignCommand[]) => {
      // Build an invalid project directly (bypassing the command engine) to test the evaluator.
      const run = executeBatch(p, cmds);
      return run.project;
    };
    const overlapping: KitchenProject = { ...p, cabinets: [...p.cabinets, { ...p.cabinets.find((c) => c.id === 'base1')!, id: 'dup' }] };
    expect(evaluate(p, overlapping, null, r).hard.map((h) => h.rule)).toContain('overlap');
    const outside: KitchenProject = { ...p, cabinets: p.cabinets.map((c) => (c.id === 'drawer1' ? { ...c, position: { ...c.position, x: c.position.x + 400 } } : c)) };
    expect(evaluate(p, outside, null, r).hard.map((h) => h.rule)).toContain('room');
    const blocking: KitchenProject = { ...p, cabinets: [...p.cabinets, { ...p.cabinets.find((c) => c.id === 'base2')!, id: 'atdoor', wallId: 'front', rotationY: 180, position: { x: 1950, y: 100, z: 3048 - 280 } }] };
    expect(evaluate(p, blocking, null, r).hard.map((h) => h.rule)).toContain('openings');
    // A unit opposite the drawers, too close for them to open.
    const clash = bad([{ type: 'add_cabinet', cabinetType: 'base', id: 'island', placement: { wallId: 'back', offset: 2400 } }]);
    const island: KitchenProject = { ...p, cabinets: [...p.cabinets, { ...clash.cabinets.find((c) => c.id === 'island') ?? p.cabinets[0]!, id: 'island', wallId: undefined, rotationY: 180, position: { x: 3300, y: 100, z: 1100 } }] };
    const res = evaluate(p, island, null, r);
    expect(res.hard.map((h) => h.rule)).toEqual(expect.arrayContaining(['clearance', 'walkway']));
    expect(evaluate(p, island, null, resolved(p, { clearances: 'soft' })).hard.map((h) => h.rule)).not.toContain('clearance');
  });
});

describe('L-shaped → U-shaped (acceptance, 12 × 10 ft)', () => {
  it('generates several valid U-shapes that keep the sink wall and the refrigerator', async () => {
    const p = lKitchen12x10();
    expect(topologyOf(p)).toBe('l-shaped');
    const before = JSON.stringify(p);
    const r = await plan(p, { topology: 'u-shaped', keepSinkWall: true, preserve: [{ query: { type: 'refrigerator' } }], priorities: ['storage'] });
    expect(JSON.stringify(p)).toBe(before); // planning never touches the project
    expect(r.infeasible).toEqual([]);
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
    const fridge = p.appliances.find((a) => a.id === 'fridge')!;
    for (const c of r.candidates) {
      expect(c.hardViolations).toEqual([]);
      expect(topologyOf(c.after)).toBe('u-shaped');
      expect(c.after.cabinets.find((x) => x.id === 'sink')!.wallId).toBe('back');
      expect(c.after.appliances.find((a) => a.id === 'fridge')).toEqual(fridge);
      expect(c.preserved).toContain('Refrigerator 700');
      // Re-running the exact commands reproduces the candidate, and it passes the hard rules again.
      const again = executeBatch(p, c.commands);
      expect(again.success).toBe(true);
      expect(signature(again.project)).toBe(signature(c.after));
      expect(evaluate(p, again.project, null, resolved(p, { keepSinkWall: true, preserve: [{ id: 'fridge' }] })).hard).toEqual([]);
      expect(c.metrics.storageLitres).toBe(storageLitres(c.after));
      expect(c.metrics.storageLitres).toBeGreaterThan(r.current.metrics.storageLitres);
    }
    // Ranked best first, with transparent scores.
    const totals = r.candidates.map((c) => c.scores.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(r.candidates[0]!.scores).toMatchObject({ constraintCompliance: expect.any(Number), storage: expect.any(Number), workflow: expect.any(Number), accessibility: expect.any(Number), userPreferenceMatch: expect.any(Number) });
    expect(r.scoreMethod).toEqual(SCORE_METHOD);
    expect(new Set(r.candidates.map((c) => c.id)).size).toBe(r.candidates.length);
  });

  it('is deterministic for the same project and objective', async () => {
    const a = await plan(lKitchen12x10(), { topology: 'u-shaped', priorities: ['storage'] });
    const b = await plan(lKitchen12x10(), { topology: 'u-shaped', priorities: ['storage'] });
    expect(a.candidates.map((c) => c.id)).toEqual(b.candidates.map((c) => c.id));
  });

  it('explains why a U-shape does not fit a narrow room and offers what does', async () => {
    const r = await plan(narrowLKitchen(), { topology: 'u-shaped', keepSinkWall: true });
    expect(r.infeasible[0]).toMatch(/U-shaped layout does not fit this 1700 × 3000 mm room/);
    expect(r.infeasible.join(' ')).toMatch(/right wall would face the left-wall run across only 700 mm/);
    expect(r.infeasible.join(' ')).toMatch(/front wall has no free stretch/);
    expect(r.relaxations.join(' ')).toMatch(/narrower walkway/);
    expect(r.candidates.every((c) => c.fallback && topologyOf(c.after) === 'l-shaped')).toBe(true);
  });

  it('never silently relaxes a hard constraint: preserving the right wall rules out that U', async () => {
    const r = await plan(lKitchen12x10(), { topology: 'u-shaped', preserveWalls: ['right'] });
    expect(r.candidates.filter((c) => !c.fallback).every((c) => c.recipe.walls.every((w) => w !== 'right'))).toBe(true);
    for (const c of r.candidates) expect(c.after.cabinets.filter((x) => x.wallId === 'right')).toHaveLength(0);
  });
});

describe('other transformations', () => {
  it('U → L removes a run but never the one holding the sink', async () => {
    const p = lKitchen12x10();
    const u = (await plan(p, { topology: 'u-shaped' })).candidates[0]!.after;
    const r = await plan(u, { topology: 'l-shaped', keepSinkWall: true });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(topologyOf(c.after)).toBe('l-shaped');
      expect(c.after.cabinets.find((x) => x.id === 'sink')?.wallId).toBe('back');
    }
  });

  it('keeps every appliance exactly in place when asked', async () => {
    const p = lKitchen12x10();
    const r = await plan(p, { priorities: ['storage'], preserveAppliances: true });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) for (const a of p.appliances) expect(c.after.appliances.find((x) => x.id === a.id)).toEqual(a);
  });

  it('only changes upper units when asked', async () => {
    const p = lKitchen12x10();
    const r = await plan(p, { scope: 'upper-only', priorities: ['storage'] });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) for (const ch of [...c.changes.added, ...c.changes.modified, ...c.changes.removed]) expect((ch.after ?? ch.before)!.elevation).toBeGreaterThanOrEqual(1300);
  });

  it('moves the refrigerator closer to the entrance', async () => {
    const p = lKitchen12x10();
    const r = await plan(p, { keepSinkWall: true, moveNear: { target: { query: { type: 'fridge' } }, to: 'entrance' } });
    expect(r.candidates.length).toBeGreaterThan(0);
    const door = { x: 1500 + 450, z: 3048 };
    const d = (q: KitchenProject) => {
      const f = q.appliances.find((a) => a.id === 'fridge')!;
      return Math.hypot(f.position.x - door.x, f.position.z - door.z);
    };
    expect(d(r.candidates[0]!.after)).toBeLessThan(d(p));
  });

  it('finds and fixes collisions and clearance problems', async () => {
    const p = lKitchen12x10();
    const broken: KitchenProject = { ...p, cabinets: p.cabinets.map((c) => (c.id === 'base2' ? { ...c, position: { ...c.position, z: c.position.z + 200 } } : c)) };
    const r = await plan(broken, { fixIssues: true });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) expect(evaluate(broken, c.after, c.changes, resolved(broken, {})).hard).toEqual([]);
    expect(r.candidates.map((c) => c.name)).toEqual(expect.arrayContaining(['Fix by moving units']));
  });

  it('creates new layouts for a room size the designer gives', async () => {
    const p = createProject({ id: 'prj_e', name: 'New', room: { width: 4200, length: 3200, height: 2700, wallThickness: 150 }, layout: 'empty' });
    const r = await plan(p, { roomSize: { width: '12 ft', length: '10 ft' } });
    expect(r.candidates.length).toBeGreaterThan(1);
    for (const c of r.candidates) {
      expect(c.after.room).toMatchObject({ width: 3658, length: 3048 });
      expect(c.after.cabinets.some((x) => x.type === 'sink')).toBe(true);
      expect(c.after.appliances.map((a) => a.type)).toEqual(expect.arrayContaining(['fridge', 'range', 'dishwasher', 'hood']));
    }
    expect(new Set(r.candidates.map((c) => c.topology)).size).toBeGreaterThan(1);
  });
});

describe('search hygiene', () => {
  it('drops duplicates and options already shown', async () => {
    const p = lKitchen12x10();
    const first = await plan(p, { topology: 'u-shaped' });
    const again = await plan(p, { topology: 'u-shaped' }, { exclude: first.candidates.map((c) => signature(c.after)) });
    for (const c of again.candidates) expect(first.candidates.map((x) => x.id)).not.toContain(c.id);
    expect(again.stats.duplicates).toBeGreaterThan(0);
  });

  it('can be cancelled, and respects its limits', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(planLayouts(lKitchen12x10(), objective({ topology: 'u-shaped' }), opts({ signal: abort.signal }))).rejects.toBeInstanceOf(PlanCancelled);
    const tiny = await plan(lKitchen12x10(), { topology: 'u-shaped' }, { maxEvaluations: 3 });
    expect(tiny.stats.truncated).toBe(true);
    expect(tiny.candidates.every((c) => c.hardViolations.length === 0)).toBe(true);
  });

  it('module filling uses the wall without inventing sizes', () => {
    expect(fillWidths(2400, [300, 400, 450, 500, 600, 800, 900, 1000], true).reduce((a, b) => a + b, 0)).toBe(2400);
    expect(fillWidths(2468, [300, 400, 450, 500, 600, 800, 900, 1000], false).reduce((a, b) => a + b, 0)).toBe(2450);
  });

  it('candidate geometry agrees between plan boxes and 3D parts', async () => {
    const r = await plan(lKitchen12x10(), { topology: 'u-shaped', priorities: ['storage'] });
    const round = (v: number) => Math.round(v * 1000) / 1000;
    for (const el of allElements(r.candidates[0]!.after)) {
      const pts = buildParts(el).filter((x) => x.body).flatMap((x) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => localToRoom(el, { x: x.center.x + (sx * x.size.x) / 2, y: 0, z: x.center.z + (sz * x.size.z) / 2 }))));
      expect(round(Math.min(...pts.map((q) => q.x)))).toBe(elementBox(el).minX);
      expect(round(Math.max(...pts.map((q) => q.z)))).toBe(elementBox(el).maxZ);
    }
    expect(r.candidates[0]!.after.cabinets.filter((c) => c.wallId === 'right').every((c) => offsetAlongWall(c) >= 580)).toBe(true);
  });
});

describe('fixtures', () => {
  it('the browser-test project file matches the fixture generator', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseProjectFile } = await import('@/domain');
    const parsed = parseProjectFile(readFileSync('e2e/fixtures/l-kitchen-12x10.kitchen.json', 'utf8'));
    expect(parsed.ok && parsed.project).toEqual(lKitchen12x10());
  });
});
