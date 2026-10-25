import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../domain/commands';
import { DEFAULT_RULE_PACK } from '../domain/catalog';
import { blankProject, newBaseCabinet, newWallCabinet, singleRoomPlan } from '../domain/factory';
import type { KitchenItem, Opening, Project } from '../domain/types';
import { mm } from '../domain/units';
import { DEFAULT_TALL_CABINET, DEFAULT_WALL_CABINET, resolveTallCabinet, resolveWallCabinet } from '../furniture/kitchen';
import { envelope, resolveParametric } from '../furniture';
import { footprint, localToRoom } from '../geometry/furniture';
import { detectRooms } from '../plan/rooms';
import { validateProject } from '../validation';
import { parseCommand } from '../tools/nl';
import { planTool, planTools } from '../tools/sceneTools';
import { freeStretches, planRun, splitRun, wallFace } from './run';

const rp = DEFAULT_RULE_PACK;
const resolveParametricOf = (i: Parameters<typeof resolveParametric>[0]) => resolveParametric(i, rp);
const errs = (r: { issues: { severity: string; code: string }[] }) => r.issues.filter((i) => i.severity === 'error').map((i) => i.code);

/** 3000 × 2400 kitchen; a window over the counter on the north wall, a door on the east wall. */
function kitchen(): Project {
  const p = blankProject('Kitchen', 'Test');
  const { plan, walls } = singleRoomPlan('Kitchen', mm(3000), mm(2400));
  const [north, east] = walls;
  const h = mm(115);
  const win: Opening = { id: 'win-1', kind: 'window', wallId: north.id, offsetUm: h + mm(900), widthUm: mm(1200), heightUm: mm(1200), sillUm: mm(1000), hinge: 'start', side: 1 };
  const door: Opening = { id: 'door-1', kind: 'door', wallId: east.id, offsetUm: h + mm(1300), widthUm: mm(900), heightUm: mm(2100), sillUm: 0, hinge: 'start', side: 1 };
  return { ...p, plan, openings: [win, door], furniture: [] };
}

describe('wall and tall cabinet templates', () => {
  it('wall cabinet resolves at its mount height with a full top and bottom', () => {
    const r = resolveWallCabinet(DEFAULT_WALL_CABINET, rp);
    expect(errs(r)).toEqual([]);
    expect(r.overall).toEqual({ widthUm: mm(600), depthUm: mm(350), heightUm: mm(2170), zMinUm: mm(1450) });
    expect(Math.min(...r.parts.map((p) => p.box.z))).toBe(mm(1450));
    expect(r.parts.map((p) => p.key)).toEqual(expect.arrayContaining(['top', 'bottom', 'side-l', 'side-r', 'door-1', 'shelf-1']));
    expect(errs(resolveWallCabinet({ ...DEFAULT_WALL_CABINET, widthUm: mm(900) }, rp))).toContain('DOOR_WIDE');
    expect(errs(resolveWallCabinet({ ...DEFAULT_WALL_CABINET, widthUm: mm(900), front: 'flap' }, rp))).toEqual([]);
    expect(resolveWallCabinet({ ...DEFAULT_WALL_CABINET, front: 'open' }, rp).parts.some((p) => p.role === 'shutter')).toBe(false);
  });

  it('tall unit splits doors at the split height with a fixed shelf behind', () => {
    const r = resolveTallCabinet(DEFAULT_TALL_CABINET, rp);
    expect(errs(r)).toEqual([]);
    const lower = r.parts.find((p) => p.key === 'door-lo-1')!;
    const upper = r.parts.find((p) => p.key === 'door-up-1')!;
    expect(lower.box.z + lower.box.h).toBeLessThan(mm(1300));
    expect(upper.box.z).toBeGreaterThan(mm(1300));
    expect(upper.box.z - (lower.box.z + lower.box.h)).toBe(rp.shutterGapUm);
    expect(r.parts.some((p) => p.key === 'fixed-shelf')).toBe(true);
    expect(errs(resolveTallCabinet({ ...DEFAULT_TALL_CABINET, splitUm: mm(400) }, rp))).toContain('SPLIT_RANGE');
  });
});

describe('kitchen runs', () => {
  it('splits lengths into standard modules, then fits exactly', () => {
    expect(splitRun(mm(3000), 'base', 'standard')).toEqual({ widthsUm: [mm(900), mm(900), mm(600), mm(600)], fillerUm: 0 });
    const std = splitRun(mm(2370), 'base', 'standard');
    expect(std.fillerUm).toBe(mm(20));
    const exact = splitRun(mm(2370), 'base', 'exact');
    expect(exact.fillerUm).toBe(0);
    expect(exact.widthsUm.reduce((s, w) => s + w, 0)).toBe(mm(2370));
    expect(splitRun(mm(100), 'base').widthsUm).toEqual([]);
    expect(splitRun(mm(260), 'base', 'exact').widthsUm).toEqual([mm(260)]);
  });

  it('finds the clear face of a wall and what blocks base vs wall units', () => {
    const p = kitchen();
    const rooms = detectRooms(p.plan);
    const north = wallFace(p.plan, p.plan.walls[0].id, rooms)!;
    expect(north.end - north.start).toBe(mm(3000));
    // The window sill (1000) is above the counter: base units run under it; wall units stop at it.
    expect(freeStretches(p, north, 'base')).toEqual([[north.start, north.end]]);
    expect(freeStretches(p, north, 'wall').map(([a, b]) => b - a)).toEqual([mm(900), mm(900)]);
    const east = wallFace(p.plan, p.plan.walls[1].id, rooms)!;
    expect(freeStretches(p, east, 'base').map(([a, b]) => b - a)).toEqual([mm(1300), mm(200)]);
  });

  it('places a run backed to the wall, inside the room, with no overlaps or construction errors', () => {
    const p = kitchen();
    const face = wallFace(p.plan, p.plan.walls[0].id)!;
    const run = planRun(p, face, 'base');
    // The biggest module goes to the inside corner (here the east end, where the east wall is clear).
    expect(run.items.map((i) => i.params.widthUm)).toEqual([mm(600), mm(600), mm(900), mm(900)]);
    const next = { ...p, furniture: run.items };
    const issues = validateProject(next).filter((r) => r.severity === 'error');
    expect(issues).toEqual([]);
    for (const it of run.items) {
      // Back edge on the wall face (y = 0 inside the room), rotation faces into the room.
      expect(Math.min(...footprint(it).map((v) => v.y))).toBeCloseTo(0, -1);
      expect(it.rotDeg).toBe(0);
    }
    // Wall units above respect the window and share no plan space conflict with base units.
    const wallRun = planRun(next, face, 'wall');
    expect(wallRun.items).toHaveLength(2);
    expect(validateProject({ ...next, furniture: [...run.items, ...wallRun.items] }).filter((r) => r.severity === 'error')).toEqual([]);
  });
});

describe('kitchen tools', () => {
  const apply = (p: Project, c: Command) => applyCommand(p, c)[0];

  it('fill_wall behind the selected cabinet fills the rest of the wall in one undo step', () => {
    const p = kitchen();
    const first = newBaseCabinet(0, 0, { widthUm: mm(600) });
    first.xUm = mm(300);
    first.yUm = envelope(first).depthUm / 2;
    p.furniture = [first];
    const r = planTools({ project: p, selection: { kind: 'furniture', id: first.id } }, [{ tool: 'fill_wall', args: { type: 'base' } }], 'fill', apply);
    expect(r.ok).toBe(true);
    if (!r.ok || !r.command) throw new Error('expected command');
    const next = apply(p, r.command);
    const bases = next.furniture.filter((f) => f.kind === 'basecabinet') as KitchenItem[];
    expect(bases.reduce((s, b) => s + b.params.widthUm, 0)).toBe(mm(3000));
    expect(validateProject(next).filter((x) => x.severity === 'error')).toEqual([]);
    const [undone] = applyCommand(next, applyCommand(p, r.command)[1]);
    expect(undone.furniture).toHaveLength(1);
  });

  it('add_cabinet puts a wall unit directly above the selected base unit; limits are enforced', () => {
    const p = kitchen();
    const base = newBaseCabinet(mm(450), mm(290), { widthUm: mm(900), doorCount: 2 });
    p.furniture = [base];
    const ctx = { project: p, selection: { kind: 'furniture' as const, id: base.id } };
    const r = planTool(ctx, { tool: 'add_cabinet', args: { type: 'wall' } });
    expect(r.ok).toBe(true);
    if (!r.ok || r.command?.type !== 'furniture.add') throw new Error('expected add');
    const wc = r.command.item as KitchenItem;
    expect(wc.kind).toBe('wallcabinet');
    expect(wc.params.widthUm).toBe(mm(900));
    expect(wc.xUm).toBe(base.xUm);
    // Backs flush: centre moved back by half the depth difference.
    expect(wc.yUm).toBe(base.yUm + (mm(350) - mm(580)) / 2);
    expect(planTool(ctx, { tool: 'add_cabinet', args: { type: 'tall', widthMm: 1100 } }).ok).toBe(false);
    const wsel = { project: { ...p, furniture: [newWallCabinet()] }, selection: null };
    wsel.selection = { kind: 'furniture', id: wsel.project.furniture[0].id } as never;
    expect(planTool(wsel, { tool: 'set_dimension', args: { dimension: 'mount_height', valueMm: 2500 } }).ok).toBe(false);
    const ok = planTool(wsel, { tool: 'set_dimension', args: { dimension: 'width', valueMm: 800 } });
    expect(ok.ok && ok.summary).toMatch(/2 doors/);
  });

  it('parses kitchen phrasing', () => {
    expect(parseCommand('fill this wall with base cabinets')).toEqual([{ tool: 'fill_wall', args: { type: 'base' } }]);
    expect(parseCommand('fill wall 2 with wall units')).toEqual([{ tool: 'fill_wall', args: { type: 'wall', wall: '2' } }]);
    expect(parseCommand('add a wall cabinet above it')).toEqual([{ tool: 'add_cabinet', args: { type: 'wall' } }]);
    expect(parseCommand('add a 450 mm tall pantry unit')).toEqual([{ tool: 'add_cabinet', args: { type: 'tall', widthMm: 450 } }]);
    expect(parseCommand('set the wall cabinet mount height to 1500')).toEqual([{ tool: 'set_dimension', args: { target: 'selected', expectKind: 'wallcabinet', dimension: 'mount_height', valueMm: 1500 } }]);
  });
});

describe('continuous worktops', () => {
  it('joins edge-to-edge base units into one slab with joints, and splits at gaps', async () => {
    const { worktopRuns } = await import('./worktops');
    const p = kitchen();
    const { items } = planRun(p, wallFace(p.plan, p.plan.walls[0].id)!, 'base');
    const withTop = items.map((b) => ({ ...b, params: { ...b.params, worktopUm: mm(40) } }));
    const proj = { ...p, furniture: withTop as Project['furniture'] };
    const runs = worktopRuns(proj);
    expect(runs).toHaveLength(1);
    expect(runs[0].itemIds).toHaveLength(withTop.length);
    expect(runs[0].lengthUm).toBe(mm(3000));
    expect(runs[0].joints).toBe(withTop.length - 1);
    // Drop the middle unit: the run breaks into two slabs.
    const gapWidth = withTop[1].params.widthUm;
    const gap = withTop.filter((_, i) => i !== 1);
    const split = worktopRuns({ ...p, furniture: gap as Project['furniture'] });
    expect(split).toHaveLength(2);
    expect(split.reduce((s, r) => s + r.lengthUm, 0)).toBe(mm(3000) - gapWidth);
  });
});

describe('worktop cut-outs', () => {
  const base = (w: number, patch = {}) => newBaseCabinet(0, 0, { widthUm: mm(w), ...patch });
  const ctxOf = (items: KitchenItem[]) => ({ project: { ...kitchen(), furniture: items }, selection: items[0] ? { kind: 'furniture' as const, id: items[0].id } : null });

  it('sets, validates and clears a sink cut-out through the scene tools', () => {
    const unit = base(900);
    const ctx = ctxOf([unit]);
    const ok = planTool(ctx, { tool: 'set_parameter', args: { parameter: 'cutout', value: 'sink' } });
    expect(ok.ok).toBe(true);
    const narrow = base(450);
    const bad = planTool(ctxOf([narrow]), { tool: 'set_parameter', args: { parameter: 'cutout', value: 'hob' } });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).toMatch(/at least 600 mm/);
    const noTop = base(900, { worktopUm: 0 });
    expect(planTool(ctxOf([noTop]), { tool: 'set_parameter', args: { parameter: 'cutout', value: 'sink' } }).ok).toBe(false);
    expect(planTool(ctxOf([unit]), { tool: 'set_parameter', args: { parameter: 'cutout', value: 'bogus' } }).ok).toBe(false);
  });

  it('is undoable and shows up in worktop runs and the BOM', async () => {
    const { worktopRuns } = await import('./worktops');
    const { buildBom, DEFAULT_PRICE_LIST } = await import('../commerce/pricing');
    const unit = base(900);
    let project = { ...kitchen(), furniture: [unit] as Project['furniture'] };
    const [next, inverse] = applyCommand(project, { type: 'furniture.params', id: unit.id, params: { cutout: 'sink' } });
    expect(worktopRuns(next)[0].cutouts).toEqual([{ itemId: unit.id, kind: 'sink' }]);
    const bom = buildBom(next, DEFAULT_PRICE_LIST);
    const line = bom.lines.find((l) => l.description.startsWith('Worktop cut-outs'))!;
    expect(line.qty).toBe(1);
    expect(line.amount).toBe(DEFAULT_PRICE_LIST.cutoutEach);
    const [back] = applyCommand(next, inverse);
    expect(worktopRuns(back)[0].cutouts).toEqual([]);
    expect(buildBom(back, DEFAULT_PRICE_LIST).lines.some((l) => l.description.startsWith('Worktop cut-outs'))).toBe(false);
  });
});

describe('blind-corner units', () => {
  it('puts a blind-corner unit at a clear inside corner, with its blind panel on the corner side', () => {
    const p = kitchen();
    const face = wallFace(p.plan, p.plan.walls[0].id)!;
    const run = planRun(p, face, 'base');
    expect(run.corners).toBe(1);
    const corner = run.items.filter((i) => i.name.startsWith('Corner unit'));
    expect(corner).toHaveLength(1);
    const c = corner[0];
    expect(c.kind === 'basecabinet' && c.params.blindUm).toBe(mm(600));
    expect(errs(resolveParametricOf(c))).toEqual([]);
    // The blind panel's centre is nearer the east wall than the door's centre.
    const r = resolveParametricOf(c);
    const mid = (k: string) => {
      const part = r.parts.find((x) => x.key === k)!;
      return localToRoom(c, part.box.x + part.box.w / 2, part.box.y).x;
    };
    expect(mid('blind-panel')).toBeGreaterThan(mid('door-1'));
    // The run that follows on the east wall starts clear of the corner unit's depth: no overlap, no errors.
    const withRun = { ...p, furniture: run.items };
    const east = planRun(withRun, wallFace(p.plan, p.plan.walls[1].id)!, 'base');
    expect(east.items.length).toBeGreaterThan(0);
    expect(east.corners).toBe(0);
    const all = { ...p, furniture: [...run.items, ...east.items] };
    expect(validateProject(all).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('rejects an unworkable blind width and drawers on a blind unit', () => {
    const narrow = newBaseCabinet(0, 0, { widthUm: mm(800), blindUm: mm(600), blindSide: 'right' });
    expect(errs(resolveParametricOf(narrow))).toContain('BLIND_OPEN');
    const drawers = newBaseCabinet(0, 0, { widthUm: mm(900), blindUm: mm(600), blindSide: 'right', front: 'drawers' });
    expect(errs(resolveParametricOf(drawers))).toContain('BLIND_FRONT');
    const ok = newBaseCabinet(0, 0, { widthUm: mm(900), blindUm: mm(600), blindSide: 'left' });
    expect(errs(resolveParametricOf(ok))).toEqual([]);
  });

  it('can be switched off with corners: false', () => {
    const p = kitchen();
    const run = planRun(p, wallFace(p.plan, p.plan.walls[0].id)!, 'base', { corners: false });
    expect(run.corners).toBe(0);
  });
});

describe('corner tools', () => {
  const unit = newBaseCabinet(0, 0, { widthUm: mm(900) });
  const ctx = (u = unit) => ({ project: { ...kitchen(), furniture: [u] as Project['furniture'] }, selection: { kind: 'furniture' as const, id: u.id } });

  it('makes a unit a blind corner and back, and validates the blind width', () => {
    const on = planTool(ctx(), { tool: 'set_parameter', args: { parameter: 'corner', value: 'right' } });
    expect(on.ok).toBe(true);
    const [next, inverse] = applyCommand(ctx().project, (on as { command: Command }).command);
    const c = next.furniture[0];
    expect(c.kind === 'basecabinet' && [c.params.blindUm, c.params.blindSide]).toEqual([mm(600), 'right']);
    // Width can't leave less than 300 mm of door.
    const narrow = planTool({ project: next, selection: { kind: 'furniture', id: unit.id } }, { tool: 'set_dimension', args: { dimension: 'width', valueMm: 800 } });
    expect(narrow.ok).toBe(false);
    expect(JSON.stringify(narrow)).toMatch(/300 mm of open door/);
    // Blind width itself is a validated dimension on a corner unit only.
    expect(planTool({ project: next, selection: { kind: 'furniture', id: unit.id } }, { tool: 'set_dimension', args: { dimension: 'blind', valueMm: 500 } }).ok).toBe(true);
    expect(planTool(ctx(), { tool: 'set_dimension', args: { dimension: 'blind', valueMm: 500 } }).ok).toBe(false);
    const back = applyCommand(next, inverse)[0].furniture[0];
    expect(back.kind === 'basecabinet' && (back.params.blindUm ?? 0)).toBe(0);
    const off = planTool({ project: next, selection: { kind: 'furniture', id: unit.id } }, { tool: 'set_parameter', args: { parameter: 'corner', value: 'none' } });
    expect(off.ok).toBe(true);
  });

  it('fill_wall reports the blind-corner unit in its summary', () => {
    const p = kitchen();
    const r = planTool({ project: p, selection: null }, { tool: 'fill_wall', args: { wall: '1', type: 'base' } });
    expect(r.ok && r.summary).toMatch(/with 1 blind-corner unit/);
  });
});

