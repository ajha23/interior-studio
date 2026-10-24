import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../domain/commands';
import { newBaseCabinet, newWardrobe, sampleProject } from '../domain/factory';
import type { BaseCabinetItem, Project } from '../domain/types';
import { mm } from '../domain/units';
import { parseCommand } from './nl';
import { planTool, planTools, type ToolContext } from './sceneTools';

function setup(): { ctx: ToolContext; cab: BaseCabinetItem } {
  const p = sampleProject();
  // Free floor in the sample bedroom (south-west, clear of the bed, wardrobe and door swing).
  const cab = newBaseCabinet(mm(900), mm(2300));
  p.furniture.push(cab);
  return { ctx: { project: p, selection: { kind: 'furniture', id: cab.id } }, cab };
}
const apply = (p: Project, c: Command) => applyCommand(p, c)[0];
const find = (p: Project, id: string) => p.furniture.find((f) => f.id === id) as BaseCabinetItem;

describe('scene tools', () => {
  it('sets the selected base cabinet width, adds a door past the single-door limit, and is undoable', () => {
    const { ctx, cab } = setup();
    const r = planTool(ctx, { tool: 'set_dimension', args: { target: 'selected', expectKind: 'basecabinet', dimension: 'width', valueMm: 900 } });
    expect(r.ok).toBe(true);
    if (!r.ok || !r.command) throw new Error('expected a command');
    expect(r.summary).toMatch(/width 900 mm.*2 doors/);
    const [next, inverse] = applyCommand(ctx.project, r.command);
    expect(find(next, cab.id).params.widthUm).toBe(mm(900));
    expect(find(next, cab.id).params.doorCount).toBe(2);
    const [back] = applyCommand(next, inverse);
    expect(find(back, cab.id).params).toEqual(cab.params);
  });

  it('rejects out-of-range, wrong-kind, unknown and unbuildable edits without producing a command', () => {
    const { ctx } = setup();
    const bad = [
      { tool: 'set_dimension', args: { dimension: 'width', valueMm: 1500 } },
      { tool: 'set_dimension', args: { dimension: 'width', valueMm: -5 } },
      { tool: 'set_dimension', args: { dimension: 'width', valueMm: 'wide' } },
      { tool: 'set_dimension', args: { dimension: 'mount_height', valueMm: 300 } },
      { tool: 'set_dimension', args: { dimension: 'width', valueMm: 900, expectKind: 'wardrobe' } },
      { tool: 'set_parameter', args: { parameter: 'drawerCount', value: 9 } },
      { tool: 'set_material', args: { slot: 'worktop', material: 'velvet' } },
      { tool: 'launch_rockets', args: {} },
    ] as const;
    for (const call of bad) {
      const r = planTool(ctx, call as never);
      expect(r.ok, JSON.stringify(call)).toBe(false);
    }
    // Explicitly forcing one door on a wide cabinet is a construction error, not silently fixed.
    const wide = planTools(ctx, [{ tool: 'set_dimension', args: { dimension: 'width', valueMm: 900 } }, { tool: 'set_parameter', args: { parameter: 'doorCount', value: 1 } }], 'x', apply);
    expect(wide.ok).toBe(false);
    if (!wide.ok) expect(wide.error).toMatch(/single door/i);
  });

  it('requires a selection or a resolvable name', () => {
    const { ctx, cab } = setup();
    expect(planTool({ ...ctx, selection: null }, { tool: 'rotate', args: { byDeg: 90 } }).ok).toBe(false);
    const byName = planTool({ ...ctx, selection: null }, { tool: 'rotate', args: { target: cab.name, byDeg: 90 } });
    expect(byName.ok).toBe(true);
  });

  it('changes finishes by name and batches multi-step requests into one undo step', () => {
    const { ctx, cab } = setup();
    const r = planTools(ctx, [
      { tool: 'set_material', args: { slot: 'shutter', material: 'walnut' } },
      { tool: 'set_material', args: { slot: 'worktop', material: 'white quartz' } },
      { tool: 'set_parameter', args: { parameter: 'shelfCount', value: 2 } },
    ], 'AI: kitchen', apply);
    expect(r.ok).toBe(true);
    if (!r.ok || !r.command) throw new Error('expected batch');
    expect(r.command.type).toBe('batch');
    const next = apply(ctx.project, r.command);
    expect(find(next, cab.id).materials).toEqual({ carcass: 'white-matte', shutter: 'walnut', worktop: 'quartz-white' });
    expect(find(next, cab.id).params.shelfCount).toBe(2);
  });

  it('adds a cabinet flush beside the selected one', () => {
    const { ctx, cab } = setup();
    const r = planTool(ctx, { tool: 'add_base_cabinet', args: { widthMm: 450, front: 'drawers', side: 'left' } });
    expect(r.ok).toBe(true);
    if (!r.ok || r.command?.type !== 'furniture.add') throw new Error('expected add');
    const added = r.command.item as BaseCabinetItem;
    expect(added.xUm).toBe(cab.xUm - (mm(600) + mm(450)) / 2);
    expect(added.yUm).toBe(cab.yUm);
    expect(added.params.front).toBe('drawers');
    expect(r.selection).toEqual({ kind: 'furniture', id: added.id });
  });

  it('rejects edits that would collide with another piece, keeping the scene unchanged', () => {
    const { ctx, cab } = setup();
    // To the right there is the bed: refused. To the left there is room.
    const blocked = planTool(ctx, { tool: 'add_base_cabinet', args: { widthMm: 600 } });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/Queen bed and Base cabinet overlap/);
    const r1 = planTool(ctx, { tool: 'add_base_cabinet', args: { widthMm: 600, side: 'left' } });
    if (!r1.ok || !r1.command) throw new Error('expected add');
    const next = apply(ctx.project, r1.command);
    // Widening the first unit now runs into its new neighbour.
    const r2 = planTool({ project: next, selection: { kind: 'furniture', id: cab.id } }, { tool: 'set_dimension', args: { dimension: 'width', valueMm: 900 } });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/overlap/);
    const r3 = planTool({ project: next, selection: { kind: 'furniture', id: cab.id } }, { tool: 'move', args: { dxMm: 10000 } });
    expect(r3.ok).toBe(false);
  });

  it('applies to other kinds within their own limits', () => {
    const p = sampleProject();
    const w = newWardrobe();
    p.furniture = [w];
    const ctx: ToolContext = { project: p, selection: { kind: 'furniture', id: w.id } };
    expect(planTool(ctx, { tool: 'set_dimension', args: { dimension: 'width', valueMm: 2000 } }).ok).toBe(true);
    expect(planTool(ctx, { tool: 'set_dimension', args: { dimension: 'plinth', valueMm: 100 } }).ok).toBe(false);
  });
});

describe('natural-language parser', () => {
  const cases: [string, unknown][] = [
    ['Change the selected base cabinet width to 900 mm.', [{ tool: 'set_dimension', args: { target: 'selected', expectKind: 'basecabinet', dimension: 'width', valueMm: 900 } }]],
    ['make it 45 cm deep', [{ tool: 'set_dimension', args: { target: 'selected', dimension: 'depth', valueMm: 450 } }]],
    ['height 870', [{ tool: 'set_dimension', args: { target: 'selected', dimension: 'height', valueMm: 870 } }]],
    ['widen it by 150mm', [{ tool: 'set_dimension', args: { target: 'selected', dimension: 'width', deltaMm: 150 } }]],
    ['change the doors to walnut', [{ tool: 'set_material', args: { target: 'selected', slot: 'shutter', material: 'walnut' } }]],
    ['make the worktop white quartz', [{ tool: 'set_material', args: { target: 'selected', slot: 'worktop', material: 'white quartz' } }]],
    ['rotate 90 degrees', [{ tool: 'rotate', args: { target: 'selected', byDeg: 90 } }]],
    ['move it 100 mm left', [{ tool: 'move', args: { target: 'selected', dxMm: -100, dyMm: 0 } }]],
    ['use 2 shelves', [{ tool: 'set_parameter', args: { target: 'selected', parameter: 'shelfCount', value: 2 } }]],
    ['switch to drawers', [{ tool: 'set_parameter', args: { target: 'selected', parameter: 'front', value: 'drawers' } }]],
    ['add a 450 mm drawer base cabinet', [{ tool: 'add_base_cabinet', args: { widthMm: 450, front: 'drawers' } }]],
    ['delete it', [{ tool: 'delete', args: { target: 'selected' } }]],
  ];
  for (const [text, expected] of cases) {
    it(`parses “${text}”`, () => expect(parseCommand(text)).toEqual(expected));
  }

  it('splits compound requests and carries the named kind', () => {
    const calls = parseCommand('set the base cabinet width to 800 and change the doors to sage');
    expect(calls).toEqual([
      { tool: 'set_dimension', args: { target: 'selected', expectKind: 'basecabinet', dimension: 'width', valueMm: 800 } },
      { tool: 'set_material', args: { target: 'selected', slot: 'shutter', material: 'sage', expectKind: 'basecabinet' } },
    ]);
  });

  it('returns null for requests it cannot parse with certainty (handed to the model)', () => {
    for (const t of ['design me a cosy reading corner', 'what is the counter height?', 'make it nicer', '']) expect(parseCommand(t)).toBeNull();
  });
});
