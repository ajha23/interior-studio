import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../domain/commands';
import { DEFAULT_RULE_PACK } from '../domain/catalog';
import { blankProject, newBaseCabinet, newWallCabinet, singleRoomPlan } from '../domain/factory';
import type { KitchenItem, Opening, Project } from '../domain/types';
import { mm } from '../domain/units';
import { DEFAULT_TALL_CABINET, DEFAULT_WALL_CABINET, resolveTallCabinet, resolveWallCabinet } from '../furniture/kitchen';
import { envelope } from '../furniture';
import { footprint } from '../geometry/furniture';
import { detectRooms } from '../plan/rooms';
import { validateProject } from '../validation';
import { parseCommand } from '../tools/nl';
import { planTool, planTools } from '../tools/sceneTools';
import { freeStretches, planRun, splitRun, wallFace } from './run';

const rp = DEFAULT_RULE_PACK;
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
    expect(run.items.map((i) => i.params.widthUm)).toEqual([mm(900), mm(900), mm(600), mm(600)]);
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
