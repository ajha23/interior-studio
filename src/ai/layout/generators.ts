/**
 * Candidate generators. Each turns the current project and objective into ordinary
 * `DesignCommand` lists (never touching the live project). Search over variants (corner offsets,
 * cabinet depths, positions) asks `check`, which runs the commands on an isolated copy and applies
 * the constraint engine, so generators propose and the deterministic engine decides.
 */
import {
  allElements,
  APPLIANCE_SPECS,
  CABINET_SPECS,
  offsetAlongWall,
  spanAlongWall,
  specOf,
  WALL_LABEL,
  WALLS,
  wallLength,
  type CabinetType,
  type DesignCommand,
  type KitchenElement,
  type KitchenProject,
  type WallId,
} from '@/domain';
import { footprintSize } from '@/engine/geometry/box';
import { localToRoom } from '@/engine/geometry/transform';
import type { Topology } from '../schema';
import type { ResolvedObjective } from './constraints';
import { BASE_DEPTH, BASE_WIDTHS, cornerWalls, fillWidths, freeStretches, OPPOSITE, OVERHANG, runDepth, runWalls, TOPOLOGY_LABEL, U_SHAPES, unitsOn, WALL_WIDTHS } from './runs';

export type Strategy = 'storage' | 'counter' | 'budget' | 'workflow' | 'clearance' | 'minimal';

export interface Recipe {
  generator: 'extend' | 'remove-run' | 'storage' | 'fix' | 'relocate' | 'fresh' | 'island';
  strategy: Strategy;
  topology: Exclude<Topology, 'keep'> | 'current';
  walls: WallId[];
}

export interface Generated {
  recipe: Recipe;
  name: string;
  summary: string;
  commands: DesignCommand[];
  assumptions: string[];
}

export interface Check {
  /** Runs commands on an isolated copy; ok when the domain accepts them and no hard rule breaks. */
  (commands: DesignCommand[]): { ok: boolean; project: KitchenProject | null; hard: string[]; ids: string[] };
}

export interface GenContext {
  project: KitchenProject;
  resolved: ResolvedObjective;
  check: Check;
  newId: (prefix: string) => string;
  /** Hard-rule messages from rejected variants, for "why not" explanations. */
  reasons: string[];
}

const STRATEGY_LABEL: Record<Strategy, string> = {
  storage: 'most storage',
  counter: 'most worktop',
  budget: 'lowest cost',
  workflow: 'best workflow',
  clearance: 'clearances first',
  minimal: 'fewest changes',
};

const isPreserved = (ctx: GenContext, el: KitchenElement) => ctx.resolved.preserved.includes(el.id) || ctx.resolved.objective.preserveWalls.includes(el.wallId as WallId);

/**
 * Commands for a new run on `wall` between offsets [start, end]: floor modules, then wall cabinets
 * above them (each kept only if it is allowed, e.g. not over a window). `cornerAt` is the end that
 * meets the middle of the kitchen; a storage run puts its tall unit at the other end.
 */
function runCommands(ctx: GenContext, base: DesignCommand[], wall: WallId, start: number, end: number, strategy: Strategy, depth: number, cornerAt: 'start' | 'end'): DesignCommand[] {
  const scope = ctx.resolved.objective.scope;
  let length = end - start;
  const floor: { type: CabinetType; width: number }[] = [];
  let tall: { type: CabinetType; width: number } | null = null;
  if (scope !== 'upper-only') {
    if (strategy === 'storage' && length >= 1500 && depth >= CABINET_SPECS.tall.depth.min) {
      tall = { type: 'tall', width: 600 };
      length -= 600;
    }
    const widths = fillWidths(length, BASE_WIDTHS.filter((w) => w <= 1000), strategy === 'budget');
    widths.forEach((w, i) => floor.push({ type: strategy === 'storage' && i % 2 === 1 && w >= 300 ? 'drawer' : 'base', width: w }));
  }
  // Modules from the corner outwards; the tall unit at the open end.
  const ordered = cornerAt === 'start' ? [...floor, ...(tall ? [tall] : [])] : [...(tall ? [tall] : []), ...floor];
  const commands: DesignCommand[] = [];
  let at = cornerAt === 'start' ? start : end - ordered.reduce((s, m) => s + m.width, 0);
  const spans: { offset: number; width: number; tall: boolean }[] = [];
  for (const m of ordered) {
    const spec = CABINET_SPECS[m.type];
    const d = Math.min(spec.depth.max, Math.max(spec.depth.min, depth));
    commands.push({ type: 'add_cabinet', cabinetType: m.type, id: ctx.newId('cab'), dimensions: { width: m.width, height: spec.defaults.height, depth: d }, placement: { wallId: wall, offset: at } });
    spans.push({ offset: at, width: m.width, tall: m.type === 'tall' });
    at += m.width;
  }
  if (strategy === 'budget' || scope === 'base-only') return commands;
  // Wall cabinets: above the new floor modules, or along the whole stretch for an upper-only change.
  const upperSpans = scope === 'upper-only' ? fillWidths(end - start, WALL_WIDTHS.filter((w) => w <= 1000), false).reduce<{ offset: number; width: number }[]>((acc, w) => [...acc, { offset: (acc.at(-1)?.offset ?? start) + (acc.at(-1)?.width ?? 0), width: w }], []) : spans.filter((s) => !s.tall);
  let accepted = [...base, ...commands];
  for (const s of upperSpans) {
    const cmd: DesignCommand = { type: 'add_cabinet', cabinetType: 'wall', id: ctx.newId('cab'), dimensions: { width: s.width, height: 720, depth: Math.min(350, Math.max(250, depth - 210)) }, placement: { wallId: wall, offset: s.offset } };
    if (ctx.check([...accepted, cmd]).ok) {
      accepted = [...accepted, cmd];
      commands.push(cmd);
    }
  }
  return commands;
}

/** Start/end offsets on `wall` that clear the runs on the walls at its corners. */
function stretchFor(ctx: GenContext, wall: WallId, runSet: Set<WallId>, newDepth: number, extra: number): { start: number; end: number; cornerAt: 'start' | 'end' } {
  const p = ctx.project;
  const len = wallLength(p.room, wall);
  const corners = cornerWalls(wall);
  const reach = (w: WallId) => (runWalls(p).includes(w) ? runDepth(p, w) : newDepth) + OVERHANG;
  const atStart = runSet.has(corners.start);
  const atEnd = runSet.has(corners.end);
  const start = atStart ? reach(corners.start) + extra : 0;
  const end = atEnd ? len - reach(corners.end) - (atStart ? 0 : extra) : len;
  return { start, end, cornerAt: atStart ? 'start' : 'end' };
}

/** Adds runs to reach a target topology (straight → L, L → U, straight → U). */
export function extendRuns(ctx: GenContext, target: 'l-shaped' | 'u-shaped', strategies: Strategy[]): Generated[] {
  const p = ctx.project;
  const current = runWalls(p);
  const options: { walls: WallId[]; open: string; set: WallId[] }[] = [];
  if (target === 'u-shaped') {
    for (const u of U_SHAPES) {
      const set = [u.middle, ...u.legs];
      if (!current.every((w) => set.includes(w))) continue;
      const missing = set.filter((w) => !current.includes(w));
      if (missing.length) options.push({ walls: missing, open: `opening to the ${u.open}`, set });
    }
  } else if (current.length === 1) {
    const w = current[0]!;
    for (const side of WALLS.filter((x) => x !== w && x !== OPPOSITE[w])) options.push({ walls: [side], open: `with a ${side}-wall leg`, set: [w, side] });
  }
  const out: Generated[] = [];
  for (const opt of options) {
    if (opt.walls.some((w) => ctx.resolved.objective.preserveWalls.includes(w))) {
      ctx.reasons.push(`A ${TOPOLOGY_LABEL[target]} layout ${opt.open} needs the ${opt.walls.join(' and ')} wall, which you asked me not to change.`);
      continue;
    }
    // A new run opposite an existing one must leave the walkway between them, even at the shallowest depth.
    const tooNarrow = opt.walls.find((w) => {
      const facing = OPPOSITE[w];
      if (!current.includes(facing)) return false;
      const across = wallLength(p.room, w === 'back' || w === 'front' ? 'left' : 'back');
      const corridor = across - runDepth(p, facing) - 350;
      if (corridor >= ctx.resolved.walkwayMm) return false;
      ctx.reasons.push(
        `A run on the ${w} wall would face the ${facing}-wall run across only ${corridor} mm: the room is ${across} mm across, the ${facing}-wall units are ${runDepth(p, facing)} mm deep and the shallowest new units 350 mm, leaving less than the ${ctx.resolved.walkwayMm} mm walkway.`,
      );
      return true;
    });
    if (tooNarrow) continue;
    for (const strategy of strategies) {
      let found: Generated | null = null;
      for (const depth of [BASE_DEPTH, 450, 350]) {
        for (const extra of [0, 300, 600, 900]) {
          const commands: DesignCommand[] = [];
          const runSet = new Set<WallId>(opt.set);
          let fits = true;
          for (const w of opt.walls) {
            const s = stretchFor(ctx, w, runSet, depth, extra);
            // Doors on the new wall split it; use the longest free stretch inside [start, end].
            const free = freeStretches(p, w, 'floor', s.start, s.end).sort((a, b) => b.end - b.start - (a.end - a.start))[0];
            if (!free || free.end - free.start < 600) {
              fits = false;
              ctx.reasons.push(`The ${WALL_LABEL[w].toLowerCase()} has no free stretch of at least 600 mm for a run (after corners${p.openings.some((o) => o.wallId === w) ? ' and openings' : ''}).`);
              break;
            }
            commands.push(...runCommands(ctx, commands, w, free.start, free.end, strategy, depth, free.start === s.start && s.cornerAt === 'start' ? 'start' : s.cornerAt));
          }
          if (!fits || !commands.length) break;
          const r = ctx.check(commands);
          if (r.ok) {
            const shallow = depth < BASE_DEPTH ? ` with ${depth} mm-deep units to keep the walkway` : '';
            found = {
              recipe: { generator: 'extend', strategy, topology: target, walls: opt.walls },
              name: `${TOPOLOGY_LABEL[target]} ${opt.open} · ${STRATEGY_LABEL[strategy]}`,
              summary: `Adds a run on the ${opt.walls.join(' and ')} wall${opt.walls.length > 1 ? 's' : ''}${shallow}; keeps the existing units where they are.`,
              commands,
              assumptions: depth < BASE_DEPTH ? [`The new run uses ${depth} mm-deep cabinets (standard is ${BASE_DEPTH} mm) so the walkway stays clear.`] : [],
            };
            break;
          }
          ctx.reasons.push(...r.hard.slice(0, 2));
        }
        if (found) break;
      }
      if (found) out.push(found);
    }
  }
  return out;
}

/** Removes a whole run (U → L, L → straight), never one holding something that must stay. */
export function removeRun(ctx: GenContext, target: 'l-shaped' | 'straight'): Generated[] {
  const p = ctx.project;
  const current = runWalls(p);
  const out: Generated[] = [];
  for (const wall of current) {
    const rest = current.filter((w) => w !== wall);
    const shapeOk = target === 'straight' ? rest.length === 1 : rest.length === 2 && OPPOSITE[rest[0]!] !== rest[1];
    if (!shapeOk) continue;
    const units = allElements(p).filter((e) => e.wallId === wall);
    const blocker = units.find((e) => isPreserved(ctx, e) || (ctx.resolved.sinkWalls.includes(wall) && e.type === 'sink'));
    if (blocker) {
      ctx.reasons.push(`The ${wall}-wall run cannot be removed: the ${blocker.type === 'sink' ? 'sink' : blocker.type} on it must stay.`);
      continue;
    }
    out.push({
      recipe: { generator: 'remove-run', strategy: 'minimal', topology: target, walls: [wall] },
      name: `${TOPOLOGY_LABEL[target]} · remove the ${wall}-wall run`,
      summary: `Removes the ${units.length} units on the ${wall} wall; everything else stays.`,
      commands: units.map((e) => ({ type: 'remove_entity', entityId: e.id })),
      assumptions: [],
    });
  }
  return out;
}

/** More storage in the current topology: wall cabinets over runs, runs extended into free wall. */
export function storageInPlace(ctx: GenContext): Generated[] {
  const p = ctx.project;
  const scope = ctx.resolved.objective.scope;
  const walls = runWalls(p).filter((w) => !ctx.resolved.objective.preserveWalls.includes(w));
  const uppers = (): DesignCommand[] => {
    const cmds: DesignCommand[] = [];
    for (const w of walls) {
      const runs = unitsOn(p, w).filter((e) => e.dimensions.height + e.position.y < 1300);
      if (!runs.length) continue;
      const from = Math.min(...runs.map((e) => spanAlongWall(e).start));
      const to = Math.max(...runs.map((e) => spanAlongWall(e).end));
      for (const s of freeStretches(p, w, 'upper', from, to)) {
        for (const width of fillWidths(s.end - s.start, WALL_WIDTHS.filter((x) => x <= 1000), false).reduce<{ o: number; w: number }[]>((acc, x) => [...acc, { o: (acc.at(-1)?.o ?? s.start) + (acc.at(-1)?.w ?? 0), w: x }], [])) {
          const cmd: DesignCommand = { type: 'add_cabinet', cabinetType: 'wall', id: ctx.newId('cab'), dimensions: { width: width.w, height: 720, depth: 350 }, placement: { wallId: w, offset: width.o } };
          if (ctx.check([...cmds, cmd]).ok) cmds.push(cmd);
        }
      }
    }
    return cmds;
  };
  const extend = (strategy: Strategy): DesignCommand[] => {
    const cmds: DesignCommand[] = [];
    for (const w of walls) {
      for (const s of freeStretches(p, w, 'floor')) {
        if (s.end - s.start < 300) continue;
        const corners = cornerWalls(w);
        const occupied = runWalls(p);
        const start = s.start === 0 && occupied.includes(corners.start) ? runDepth(p, corners.start) + OVERHANG : s.start;
        const end = s.end === wallLength(p.room, w) && occupied.includes(corners.end) ? s.end - runDepth(p, corners.end) - OVERHANG : s.end;
        if (end - start < 300) continue;
        const add = runCommands(ctx, cmds, w, start, end, strategy, BASE_DEPTH, 'start');
        if (ctx.check([...cmds, ...add]).ok) cmds.push(...add);
      }
    }
    return cmds;
  };
  const out: Generated[] = [];
  if (scope !== 'base-only') {
    const u = uppers();
    if (u.length) out.push({ recipe: { generator: 'storage', strategy: 'storage', topology: 'current', walls }, name: 'Same layout · wall cabinets added', summary: `Adds ${u.length} wall cabinet${u.length === 1 ? '' : 's'} above the existing runs where the wall is free.`, commands: u, assumptions: [] });
  }
  if (scope !== 'upper-only') {
    for (const strategy of ['storage', 'budget'] as const) {
      const e = extend(strategy);
      if (e.length) out.push({ recipe: { generator: 'storage', strategy, topology: 'current', walls }, name: `Same layout · runs extended · ${STRATEGY_LABEL[strategy]}`, summary: `Extends the existing runs into free wall with ${e.length} new unit${e.length === 1 ? '' : 's'}.`, commands: e, assumptions: [] });
    }
  }
  return out;
}

/** Moves (or, as a separate option, removes) units involved in hard-rule problems. */
export function fixIssues(ctx: GenContext): Generated[] {
  const p = ctx.project;
  const problems = ctx.check([]).hard;
  if (!problems.length) return [];
  const els = allElements(p);
  // Units named in problems, skipping ones that must stay.
  const ids = [...new Set(problemIds(ctx, []))].filter((id) => {
    const el = els.find((e) => e.id === id);
    return el && !isPreserved(ctx, el);
  });
  const moved: DesignCommand[] = [];
  for (const id of ids) {
    if (!problemIds(ctx, moved).includes(id)) continue;
    const el = els.find((e) => e.id === id)!;
    if (!el.wallId) continue;
    const len = wallLength(p.room, el.wallId);
    const from = offsetAlongWall(el);
    const hung = specOf(el).mount === 'wall';
    const tries = Array.from({ length: Math.floor(len / 10) }, (_, i) => i * 10).sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    for (const offset of tries) {
      if (offset === from || offset + el.dimensions.width > len) continue;
      const cmd: DesignCommand = { type: 'move_entity', entityId: id, placement: { wallId: el.wallId, offset, elevation: hung ? el.position.y : undefined } };
      const before = problemIds(ctx, moved).length;
      const after = problemIds(ctx, [...moved, cmd]);
      if (!after.includes(id) && after.length < before) {
        moved.push(cmd);
        break;
      }
    }
  }
  const out: Generated[] = [];
  if (moved.length) out.push({ recipe: { generator: 'fix', strategy: 'minimal', topology: 'current', walls: [] }, name: 'Fix by moving units', summary: `Moves ${moved.length} unit${moved.length === 1 ? '' : 's'} along ${moved.length === 1 ? 'its' : 'their'} wall to the nearest position that clears the problem.`, commands: moved, assumptions: [] });
  const removed: DesignCommand[] = [];
  for (const id of ids) {
    if (!problemIds(ctx, removed).includes(id)) continue;
    removed.push({ type: 'remove_entity', entityId: id });
  }
  if (removed.length) out.push({ recipe: { generator: 'fix', strategy: 'clearance', topology: 'current', walls: [] }, name: 'Fix by removing units', summary: `Removes ${removed.length} conflicting unit${removed.length === 1 ? '' : 's'}.`, commands: removed, assumptions: [] });
  return out;
}

/** Ids involved in hard problems after `commands` (all of them when the commands are rejected). */
function problemIds(ctx: GenContext, commands: DesignCommand[]): string[] {
  const r = ctx.check(commands);
  return r.project ? r.ids : allElements(ctx.project).map((e) => e.id);
}

/** Moves one unit towards a destination (e.g. the entrance), by free spot or by swapping with cabinets. */
export function relocate(ctx: GenContext, id: string, to: { x: number; z: number }, toLabel: string): Generated[] {
  const p = ctx.project;
  const el = allElements(p).find((e) => e.id === id);
  if (!el || !el.wallId) return [];
  const dist = (wall: WallId, offset: number) => {
    const pos = { ...el, wallId: wall, position: placeCentre(p, wall, el, offset) };
    const c = localToRoom(pos, { x: 0, y: 0, z: el.dimensions.depth / 2 });
    return Math.hypot(c.x - to.x, c.z - to.z);
  };
  const current = dist(el.wallId, offsetAlongWall(el));
  const hung = specOf(el).mount === 'wall';
  const spots: { wall: WallId; offset: number; d: number }[] = [];
  for (const wall of WALLS) {
    if (ctx.resolved.objective.preserveWalls.includes(wall)) continue;
    for (const s of freeStretches(p, wall, 'floor')) {
      for (let o = s.start; o + el.dimensions.width <= s.end; o += 50) spots.push({ wall, offset: o, d: dist(wall, o) });
    }
  }
  const out: Generated[] = [];
  const name = el.type === 'fridge' ? 'refrigerator' : el.type;
  for (const s of spots.filter((x) => x.d < current - 300).sort((a, b) => a.d - b.d)) {
    const cmd: DesignCommand = { type: 'move_entity', entityId: id, placement: { wallId: s.wall, offset: s.offset, elevation: hung ? el.position.y : undefined } };
    if (ctx.check([cmd]).ok) {
      out.push({ recipe: { generator: 'relocate', strategy: 'workflow', topology: 'current', walls: [s.wall] }, name: `Move the ${name} into free space near the ${toLabel}`, summary: `Moves the ${name} to ${s.offset} mm along the ${s.wall} wall, ${Math.round((current - s.d) / 10) / 100} m closer to the ${toLabel}.`, commands: [cmd], assumptions: [] });
      break;
    }
  }
  // Swap with base cabinets nearer the destination, refilling the old spot with base cabinets.
  for (const wall of WALLS) {
    if (ctx.resolved.objective.preserveWalls.includes(wall)) continue;
    const run = unitsOn(p, wall);
    for (let i = 0; i < run.length; i++) {
      const group: KitchenElement[] = [];
      let width = 0;
      for (let j = i; j < run.length && width < el.dimensions.width; j++) {
        const u = run[j]!;
        if (u.id === id || !('interior' in u) || u.type === 'sink' || u.type === 'corner' || isPreserved(ctx, u)) break;
        if (group.length && Math.abs(spanAlongWall(group.at(-1)!).end - spanAlongWall(u).start) > 1) break;
        group.push(u);
        width += u.dimensions.width;
      }
      if (width < el.dimensions.width || !group.length) continue;
      const start = spanAlongWall(group[0]!).start;
      const d = dist(wall, start);
      if (d >= current - 300) continue;
      const commands: DesignCommand[] = group.map((u) => ({ type: 'remove_entity', entityId: u.id }));
      commands.push({ type: 'move_entity', entityId: id, placement: { wallId: wall, offset: start } });
      const old = { wall: el.wallId, start: offsetAlongWall(el), end: offsetAlongWall(el) + el.dimensions.width };
      let at = old.start;
      for (const w of fillWidths(old.end - old.start, BASE_WIDTHS, false)) {
        commands.push({ type: 'add_cabinet', cabinetType: 'base', id: ctx.newId('cab'), dimensions: { ...CABINET_SPECS.base.defaults, width: w }, placement: { wallId: old.wall, offset: at } });
        at += w;
      }
      let rest = start + el.dimensions.width;
      for (const w of fillWidths(start + width - rest, BASE_WIDTHS, false)) {
        commands.push({ type: 'add_cabinet', cabinetType: 'base', id: ctx.newId('cab'), dimensions: { ...CABINET_SPECS.base.defaults, width: w }, placement: { wallId: wall, offset: rest } });
        rest += w;
      }
      if (ctx.check(commands).ok) {
        out.push({
          recipe: { generator: 'relocate', strategy: 'storage', topology: 'current', walls: [wall] },
          name: `Swap the ${name} with cabinets near the ${toLabel}`,
          summary: `Moves the ${name} ${Math.round((current - d) / 10) / 100} m closer to the ${toLabel}, in place of ${group.length} base unit${group.length === 1 ? '' : 's'}, and fills its old space with base units.`,
          commands,
          assumptions: ['Cabinet contents and finishes in the swapped positions use the default base unit.'],
        });
        return out;
      }
    }
  }
  return out;
}

function placeCentre(p: KitchenProject, wall: WallId, el: KitchenElement, offset: number) {
  const rot = { back: 0, left: 90, right: 270, front: 180 }[wall] as 0 | 90 | 180 | 270;
  const { sx, sz } = footprintSize(el.dimensions, rot);
  const along = offset + (wall === 'back' || wall === 'front' ? sx : sz) / 2;
  return wall === 'back' ? { x: along, y: 0, z: sz / 2 } : wall === 'front' ? { x: along, y: 0, z: p.room.length - sz / 2 } : wall === 'left' ? { x: sx / 2, y: 0, z: along } : { x: p.room.width - sx / 2, y: 0, z: along };
}

/** Repositions free-standing units (islands) for the most clear floor around them. */
export function repositionIslands(ctx: GenContext, clearanceOf: (p: KitchenProject) => number | null): Generated[] {
  const p = ctx.project;
  const islands = allElements(p).filter((e) => !e.wallId && specOf(e).mount === 'floor' && !isPreserved(ctx, e) && 'interior' in e);
  if (!islands.length) return [];
  const out: Generated[] = [];
  const results: { cmds: DesignCommand[]; clear: number }[] = [];
  for (const el of islands) {
    const { sx, sz } = footprintSize(el.dimensions, el.rotationY);
    for (let x = Math.ceil(sx / 2 / 50) * 50; x <= p.room.width - sx / 2; x += 100) {
      for (let z = Math.ceil(sz / 2 / 50) * 50; z <= p.room.length - sz / 2; z += 100) {
        const cmd: DesignCommand = { type: 'place_entity', entityId: el.id, x, z, rotationY: el.rotationY };
        const r = ctx.check([cmd]);
        if (r.ok && r.project) results.push({ cmds: [cmd], clear: clearanceOf(r.project) ?? 0 });
      }
    }
  }
  results.sort((a, b) => b.clear - a.clear);
  for (const r of results.slice(0, 2)) out.push({ recipe: { generator: 'island', strategy: 'clearance', topology: 'current', walls: [] }, name: `Island moved for ${r.clear} mm walkways`, summary: `Repositions the island so the narrowest walkway is ${r.clear} mm.`, commands: r.cmds, assumptions: [] });
  return out;
}

/** A new kitchen from scratch in an (emptied) room: straight, L or U, with the core appliances. */
export function freshLayouts(ctx: GenContext, topologies: ('straight' | 'l-shaped' | 'u-shaped')[], clear: DesignCommand[], cleared: KitchenProject): Generated[] {
  const p = cleared;
  const local: GenContext = { ...ctx, project: p };
  const out: Generated[] = [];
  // The longest wall without a door carries the sink run.
  const main = [...WALLS].sort((a, b) => doorFree(p, b) - doorFree(p, a))[0]!;
  const sides = WALLS.filter((w) => w !== main && w !== OPPOSITE[main]);
  for (const topology of topologies) {
    const legsets: WallId[][] = topology === 'straight' ? [[main]] : topology === 'l-shaped' ? sides.map((x) => [main, x]) : [[main, ...sides]];
    for (const set of legsets) {
      for (const strategy of ['workflow', 'storage'] as const) {
        let made: DesignCommand[] | null = null;
        for (const extra of [0, 300, 600]) {
          const commands = buildFresh(local, set, topology, strategy, extra, clear);
          if (!commands) break;
          const r = ctx.check(commands);
          if (r.ok) {
            made = commands;
            break;
          }
          ctx.reasons.push(...r.hard.slice(0, 2));
        }
        if (!made) continue;
        out.push({
          recipe: { generator: 'fresh', strategy, topology, walls: set },
          name: `New ${TOPOLOGY_LABEL[topology]} kitchen on the ${set.join(' + ')} wall${set.length > 1 ? 's' : ''} · ${STRATEGY_LABEL[strategy]}`,
          summary: `Sink, dishwasher, range with hood and refrigerator on ${set.length} run${set.length > 1 ? 's' : ''}, filled with standard ${strategy === 'storage' ? 'drawer and base' : 'base'} units.`,
          commands: made,
          assumptions: ['Appliance widths are catalogue defaults (sink unit 800, dishwasher 600, range 600, refrigerator 600 mm); confirm the chosen models.'],
        });
      }
    }
  }
  return out;
}

type Slot = { kind: 'cab'; type: CabinetType; width: number } | { kind: 'app'; type: 'fridge' | 'range' | 'dishwasher'; width: number };

function buildFresh(ctx: GenContext, set: WallId[], topology: string, strategy: Strategy, extra: number, clear: DesignCommand[]): DesignCommand[] | null {
  const p = ctx.project;
  const commands: DesignCommand[] = [...clear];
  const runSet = new Set(set);
  for (const [i, w] of set.entries()) {
    const st = i === 0 ? { start: 0, end: wallLength(p.room, w) } : stretchFor(ctx, w, runSet, BASE_DEPTH, extra);
    const free = freeStretches(p, w, 'floor', st.start, st.end).sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    if (!free || free.end - free.start < 1200) {
      ctx.reasons.push(`The ${w} wall has no free stretch of 1.2 m for a run.`);
      return null;
    }
    const slots: Slot[] = [];
    const ends: Slot[] = [];
    if (i === 0) {
      // A blind corner unit where a leg meets this run on the unit's left (its blind side).
      const corners = cornerWalls(w);
      const leftEnd = RIGHT_IS_ALONG[w] ? corners.start : corners.end;
      if (set.includes(leftEnd)) (RIGHT_IS_ALONG[w] ? slots : ends).push({ kind: 'cab', type: 'corner', width: 1000 });
      slots.push({ kind: 'cab', type: 'sink', width: 800 }, { kind: 'app', type: 'dishwasher', width: 600 });
    }
    const range = topology === 'straight' || i === 1;
    const fridge = topology === 'straight' || i === set.length - 1;
    const fixed = [...slots, ...ends].reduce((n, x) => n + x.width, 0) + (range ? 600 : 0) + (fridge ? 600 : 0);
    const room = free.end - free.start - fixed;
    if (room < 0) {
      ctx.reasons.push(`The ${w} wall has ${free.end - free.start} mm free; the units planned for it need ${fixed} mm.`);
      return null;
    }
    const fills = fillWidths(room, BASE_WIDTHS, strategy === 'workflow');
    const half = Math.ceil(fills.length / 2);
    fills.slice(0, half).forEach((fw) => slots.push({ kind: 'cab', type: strategy === 'storage' ? 'drawer' : 'base', width: fw }));
    if (range) slots.push({ kind: 'app', type: 'range', width: 600 });
    fills.slice(half).forEach((fw) => slots.push({ kind: 'cab', type: 'base', width: fw }));
    if (fridge) slots.push({ kind: 'app', type: 'fridge', width: 600 });
    slots.push(...ends);
    // Runs on a leg start at the corner end; place from the start of the free stretch.
    let at = ends.length ? free.end - slots.reduce((n, x) => n + x.width, 0) : free.start;
    for (const item of slots) {
      if (item.kind === 'cab') commands.push({ type: 'add_cabinet', cabinetType: item.type, id: ctx.newId('cab'), dimensions: { ...CABINET_SPECS[item.type].defaults, width: item.width }, placement: { wallId: w, offset: at } });
      else {
        commands.push({ type: 'add_appliance', applianceType: item.type, id: ctx.newId('app'), width: item.width, placement: { wallId: w, offset: at } });
        if (item.type === 'range') commands.push({ type: 'add_appliance', applianceType: 'hood', id: ctx.newId('app'), width: 600, placement: { wallId: w, offset: at, elevation: APPLIANCE_SPECS.hood.elevation } });
      }
      at += item.width;
    }
  }
  return commands;
}

/** True where a unit's right (seen facing it) points along increasing offset. */
const RIGHT_IS_ALONG: Record<WallId, boolean> = { back: true, right: true, left: false, front: false };

function doorFree(p: KitchenProject, w: WallId): number {
  return Math.max(0, ...freeStretches(p, w, 'floor').map((s) => s.end - s.start));
}

