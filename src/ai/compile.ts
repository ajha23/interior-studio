/**
 * Compiles one assistant operation into ordinary `DesignCommand`s against the current project:
 * references become ids, lengths become whole millimetres, and relative instructions ("300 mm to
 * the right", "next to the sink") become absolute placements using the semantics documented in
 * `schema.ts`. Nothing here changes the project; the transaction runs the commands.
 */
import {
  APPLIANCE_SPECS,
  CABINET_SPECS,
  executeBatch,
  FURNITURE_SPECS,
  offsetAlongWall,
  specOf,
  wallAxis,
  wallLength,
  WALL_LABEL,
  type DesignCommand,
  type Dimensions,
  type ElementSpec,
  type KitchenElement,
  type KitchenProject,
  type MaterialCategory,
  type Rotation,
  type WallId,
} from '@/domain';
import { footprintSize } from '@/engine/geometry/box';
import { localToRoom } from '@/engine/geometry/transform';
import { parseLength, toMm, toStoredMm, type LengthUnit } from '@/engine/measurement/units';
import { describeEntity, isWallHung, RIGHT_ALONG, type Entity } from './entities';
import { resolveTarget, type ResolveContext } from './resolve';
import type { AssistantOperation, Direction, LengthInput, PlacementInput, TargetRef } from './schema';

export interface CompileContext extends ResolveContext {
  newId: (prefix: string) => string;
}

export type Compiled =
  | { ok: true; commands: DesignCommand[]; targets: string[]; created: string[]; note?: string }
  | { ok: false; kind: 'ambiguous'; key: string; question: string; candidates: Entity[] }
  | { ok: false; kind: 'error'; message: string };

class CompileError extends Error {}
class Ambiguity extends Error {
  constructor(readonly key: string, readonly question: string, readonly candidates: Entity[]) {
    super(question);
  }
}

const fail = (message: string): never => {
  throw new CompileError(message);
};

/** Converts a length to whole millimetres with the storage policy (exact, then rounded once). */
export function lengthToMm(input: LengthInput, what: string, opts: { allowNegative?: boolean; allowZero?: boolean } = {}): number {
  let mm: number;
  if (typeof input === 'number') mm = toStoredMm(input);
  else if (typeof input === 'string') {
    const parsed = parseLength(input, 'mm', opts.allowNegative);
    if (!parsed.ok) fail(`${what}: ${parsed.error}`);
    mm = (parsed as { mm: number }).mm;
  } else {
    const unit: Exclude<LengthUnit, 'ft-in'> = input.unit === 'ft-in' ? 'in' : input.unit;
    mm = toStoredMm(toMm(input.value, unit));
  }
  if (!opts.allowNegative && mm < 0) fail(`${what} cannot be negative.`);
  if (!opts.allowZero && !opts.allowNegative && mm === 0) fail(`${what} must be more than 0 mm.`);
  return mm;
}

const optMm = (input: LengthInput | undefined, what: string) => (input === undefined ? undefined : lengthToMm(input, what));

export function compileOperation(project: KitchenProject, op: AssistantOperation, index: number, ctx: CompileContext): Compiled {
  try {
    return { ok: true, ...compile(project, op, index, ctx) };
  } catch (e) {
    if (e instanceof Ambiguity) return { ok: false, kind: 'ambiguous', key: e.key, question: e.question, candidates: e.candidates };
    if (e instanceof CompileError) return { ok: false, kind: 'error', message: e.message };
    throw e;
  }
}

interface Out {
  commands: DesignCommand[];
  targets: string[];
  created: string[];
  note?: string;
}

function resolve(project: KitchenProject, ref: TargetRef, ctx: CompileContext, key: string, multiple: boolean): Entity[] {
  const r = resolveTarget(project, ref, ctx, key, multiple);
  if (r.ok) return r.entities;
  if (r.kind === 'ambiguous') throw new Ambiguity(r.key, r.question, r.candidates);
  return fail(r.message);
}

const one = (project: KitchenProject, ref: TargetRef, ctx: CompileContext, key: string) => resolve(project, ref, ctx, key, false)[0]!;

/** The first candidate command list that the domain accepts, or the first one's errors. */
function firstThatWorks(project: KitchenProject, candidates: DesignCommand[][]): { commands: DesignCommand[]; index: number } | { errors: string[] } {
  let firstErrors: string[] | null = null;
  for (const [index, commands] of candidates.entries()) {
    const run = executeBatch(project, commands);
    if (run.success) return { commands, index };
    firstErrors ??= run.results.at(-1)?.errors ?? ['That change is not allowed.'];
  }
  return { errors: firstErrors ?? ['There is nowhere to put it.'] };
}

/** Offsets beside `x` on its wall for something `width` wide; right/left as seen facing `x`. */
function besideOffsets(x: Entity, width: number, side: 'left' | 'right' | 'auto'): { side: 'left' | 'right'; offset: number }[] {
  const dir = RIGHT_ALONG[x.wallId!];
  const right = dir === 1 ? x.span!.end : x.span!.start - width;
  const left = dir === 1 ? x.span!.start - width : x.span!.end;
  const sides: ('left' | 'right')[] = side === 'auto' ? ['right', 'left'] : [side];
  return sides.map((s) => ({ side: s, offset: s === 'right' ? right : left })).filter((c) => c.offset >= 0);
}

/** Centre beside a free-standing element, backs aligned, in that element's frame. */
function besideFree(x: KitchenElement, dims: Dimensions, side: 'left' | 'right'): { x: number; z: number } {
  const s = side === 'right' ? 1 : -1;
  const p = localToRoom(x, { x: s * (x.dimensions.width / 2 + dims.width / 2), y: 0, z: -x.dimensions.depth / 2 + dims.depth / 2 });
  return { x: p.x, z: p.z };
}

/** Candidate offsets on a wall for a new item: the wall start, then after each item on that wall, then every 50 mm. */
function wallOffsets(project: KitchenProject, wall: WallId, width: number): number[] {
  const len = wallLength(project.room, wall);
  const ends = [...project.cabinets, ...project.appliances, ...project.furniture].filter((e) => e.wallId === wall).map((e) => offsetAlongWall(e) + e.dimensions.width);
  const grid = Array.from({ length: Math.floor(len / 50) + 1 }, (_, i) => i * 50);
  return [...new Set([0, ...ends, ...grid])].filter((o) => o + width <= len).sort((a, b) => a - b);
}

function finishId(project: KitchenProject, category: MaterialCategory, query: string): string {
  const q = query.toLowerCase().replace(/\b(finish|colour|color|paint|the)\b/g, '').trim();
  const options = Object.values(project.materials).filter((m) => m.category === category);
  const words = q.split(/\s+/).filter(Boolean);
  const exact = options.find((m) => m.id === q || m.name.toLowerCase() === q);
  if (exact) return exact.id;
  const matches = options.filter((m) => words.every((w) => m.name.toLowerCase().includes(w) || m.id.includes(w)));
  if (matches.length === 1) return matches[0]!.id;
  const names = options.map((m) => m.name).join(', ');
  return fail(matches.length ? `“${query}” matches several ${category} finishes (${matches.map((m) => m.name).join(', ')}). Which one?` : `There is no ${category} finish called “${query}”. Available: ${names}.`);
}

const specLabel = (spec: ElementSpec) => spec.label.toLowerCase();

function compile(project: KitchenProject, op: AssistantOperation, index: number, ctx: CompileContext): Out {
  const key = (path: string) => `${index}:${path}`;
  switch (op.op) {
    case 'create_cabinet':
    case 'create_appliance':
    case 'create_furniture':
      return compileCreate(project, op, ctx, key);

    case 'create_opening': {
      const id = ctx.newId('opn');
      const command: DesignCommand = {
        type: 'add_opening',
        kind: op.kind,
        id,
        wallId: op.wall,
        offset: op.offset === undefined ? undefined : lengthToMm(op.offset, 'Offset', { allowZero: true }),
        width: optMm(op.width, 'Width'),
        height: optMm(op.height, 'Height'),
        sill: op.sill === undefined ? undefined : lengthToMm(op.sill, 'Sill', { allowZero: true }),
      };
      if (op.offset !== undefined && !op.wall) fail('Say which wall the opening goes on when you give its position.');
      return { commands: [command], targets: [], created: [id] };
    }

    case 'resize':
    case 'resize_by': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      const relative = op.op === 'resize_by';
      const value = (v: LengthInput | undefined, current: number, what: string) => {
        if (v === undefined) return current;
        return relative ? current + lengthToMm(v, what, { allowNegative: true }) : lengthToMm(v, what);
      };
      if (op.width === undefined && op.height === undefined && op.depth === undefined) fail('Say which size to change: width, height or depth.');
      const commands: DesignCommand[] = [];
      let room = project.room;
      for (const t of targets) {
        if (t.element) {
          const el = t.element;
          const dims = { width: value(op.width, el.dimensions.width, 'Width'), height: value(op.height, el.dimensions.height, 'Height'), depth: value(op.depth, el.dimensions.depth, 'Depth') };
          if (t.category === 'cabinet') commands.push({ type: 'resize_cabinet', cabinetId: el.id, dimensions: dims });
          else if (t.category === 'furniture') commands.push({ type: 'resize_furniture', furnitureId: el.id, dimensions: dims });
          else {
            if (dims.height !== el.dimensions.height || dims.depth !== el.dimensions.depth) fail(`The height and depth of the ${t.label} are fixed; only its width can change (${specOf(el).widths.join(', ')} mm).`);
            commands.push({ type: 'resize_appliance', applianceId: el.id, width: dims.width });
          }
        } else if (t.opening) {
          if (op.depth !== undefined) fail('Openings have no depth to change.');
          commands.push({ type: 'update_opening', id: t.id, width: value(op.width, t.opening.width, 'Width'), height: value(op.height, t.opening.height, 'Height') });
        } else {
          const wall = t.wallId!;
          const lengthKey = wallAxis(wall) === 'x' ? 'width' : 'length';
          room = { ...room, [lengthKey]: value(op.width, room[lengthKey], 'Wall length'), height: value(op.height, room.height, 'Wall height'), wallThickness: value(op.depth, room.wallThickness, 'Wall thickness') };
        }
      }
      if (room !== project.room) commands.push({ type: 'set_room', room });
      return { commands, targets: targets.map((t) => t.id), created: [] };
    }

    case 'move_by': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      const distance = lengthToMm(op.distance, 'Distance');
      const commands = targets.map((t) => moveBy(t, distance, op.direction));
      return { commands, targets: targets.map((t) => t.id), created: [] };
    }

    case 'move_to': {
      const t = one(project, op.target, ctx, key('target'));
      const out = moveTo(project, t, op.placement, ctx, key('placement'));
      return { commands: out.commands, targets: [t.id], created: [], note: out.note };
    }

    case 'rotate': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      const commands = targets.map((t): DesignCommand => {
        if (!t.element) fail(`The ${t.label.toLowerCase()} cannot be rotated.`);
        const rotationY = ((((t.element!.rotationY + op.degrees) % 360) + 360) % 360) as Rotation;
        return { type: 'rotate_entity', entityId: t.id, rotationY };
      });
      return { commands, targets: targets.map((t) => t.id), created: [] };
    }

    case 'delete': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      const commands = targets.map((t): DesignCommand => {
        if (t.category === 'wall') fail('Walls cannot be deleted; the room is always a rectangle. Change the room size instead.');
        return t.opening ? { type: 'remove_opening', id: t.id } : { type: 'remove_entity', entityId: t.id };
      });
      return { commands, targets: targets.map((t) => t.id), created: [] };
    }

    case 'set_finish': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      if (targets.every((t) => t.category === 'wall')) {
        return { commands: [{ type: 'set_surface_material', surface: 'wall', materialId: finishId(project, 'wall', op.finish) }], targets: [], created: [], note: 'Wall paint applies to every wall.' };
      }
      const bad = targets.find((t) => t.category !== 'cabinet' && t.category !== 'furniture');
      if (bad) fail(`The ${bad.label} has a fixed finish; only cabinets and furniture can change finish.`);
      return { commands: [{ type: 'set_material', targetIds: targets.map((t) => t.id), materialId: finishId(project, 'shutter', op.finish) }], targets: targets.map((t) => t.id), created: [] };
    }

    case 'set_surface_finish':
      return { commands: [{ type: 'set_surface_material', surface: op.surface, materialId: finishId(project, op.surface, op.finish) }], targets: [], created: [] };

    case 'set_front_style': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      const commands = targets.map((t): DesignCommand => {
        if (t.category !== 'cabinet') fail(`The ${t.label} has no doors to change.`);
        return { type: 'set_front_style', cabinetId: t.id, style: op.style };
      });
      return { commands, targets: targets.map((t) => t.id), created: [] };
    }

    case 'set_room': {
      const room = {
        width: optMm(op.width, 'Room width') ?? project.room.width,
        length: optMm(op.length, 'Room length') ?? project.room.length,
        height: optMm(op.height, 'Ceiling height') ?? project.room.height,
        wallThickness: optMm(op.wallThickness, 'Wall thickness') ?? project.room.wallThickness,
      };
      return { commands: [{ type: 'set_room', room }], targets: [], created: [] };
    }

    case 'update_opening': {
      const targets = resolve(project, op.target, ctx, key('target'), true);
      const commands = targets.map((t): DesignCommand => {
        if (!t.opening) fail(`The ${t.label} is not a door, window or opening.`);
        return { type: 'update_opening', id: t.id, swing: op.swing, hinge: op.hinge, sill: op.sill === undefined ? undefined : lengthToMm(op.sill, 'Sill', { allowZero: true }) };
      });
      return { commands, targets: targets.map((t) => t.id), created: [] };
    }

    case 'set_units':
      return { commands: [{ type: 'set_measurement_unit', unit: op.unit }], targets: [], created: [] };

    case 'rename_project':
      return { commands: [{ type: 'rename_project', name: op.name }], targets: [], created: [] };

    case 'create_finish': {
      // Same name and category: update that finish instead of adding a duplicate.
      const existing = Object.values(project.materials).find((m) => m.category === op.category && m.name.toLowerCase() === op.name.toLowerCase());
      const slug = op.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'finish';
      const id = existing?.id ?? `${op.category}-${slug}`;
      const DEFAULT_ROUGHNESS: Record<MaterialCategory, number> = { shutter: 0.55, carcass: 0.7, countertop: 0.3, floor: 0.5, wall: 0.9 };
      const SCALE: Partial<Record<NonNullable<typeof op.texture>, number>> = { wood: 600, planks: 180, marble: 1000, tile: 600, terrazzo: 800, concrete: 1500, plaster: 2000, stone: 600, fabric: 150, brick: 300 };
      const material = { id, name: op.name, category: op.category, color: op.color.toLowerCase(), roughness: op.roughness ?? DEFAULT_ROUGHNESS[op.category], metalness: 0, ...(op.texture && op.texture !== 'plain' ? { texture: op.texture, textureScale: SCALE[op.texture] } : {}) };
      return { commands: [{ type: 'define_material', material }], targets: [], created: [] };
    }
  }
}

type CreateOp = Extract<AssistantOperation, { op: 'create_cabinet' | 'create_appliance' | 'create_furniture' }>;

function compileCreate(project: KitchenProject, op: CreateOp, ctx: CompileContext, key: (path: string) => string): Out {
  const spec = op.op === 'create_cabinet' ? CABINET_SPECS[op.cabinetType] : op.op === 'create_appliance' ? APPLIANCE_SPECS[op.applianceType] : FURNITURE_SPECS[op.furnitureType];
  const id = ctx.newId(op.op === 'create_cabinet' ? 'cab' : op.op === 'create_appliance' ? 'app' : 'fur');
  const dims: Dimensions = {
    width: optMm(op.width, 'Width') ?? spec.defaults.width,
    height: op.op === 'create_appliance' ? spec.defaults.height : (optMm(op.height, 'Height') ?? spec.defaults.height),
    depth: op.op === 'create_appliance' ? spec.defaults.depth : (optMm(op.depth, 'Depth') ?? spec.defaults.depth),
  };
  const materialId = op.op !== 'create_appliance' && op.finish ? finishId(project, 'shutter', op.finish) : undefined;
  const add = (placement?: { wallId: WallId; offset: number; elevation?: number }): DesignCommand =>
    op.op === 'create_cabinet'
      ? { type: 'add_cabinet', cabinetType: op.cabinetType, id, dimensions: dims, materialId, placement }
      : op.op === 'create_appliance'
        ? { type: 'add_appliance', applianceType: op.applianceType, id, width: dims.width, placement }
        : { type: 'add_furniture', furnitureType: op.furnitureType, id, dimensions: dims, materialId };
  const done = (commands: DesignCommand[], note?: string): Out => ({ commands, targets: [], created: [id], note });
  const placement = op.placement;
  const furniture = op.op === 'create_furniture';

  if (!placement) return done([add()]);

  if ('wall' in placement) {
    if (furniture) fail('Furniture is placed on the floor: give its distance from the left and back walls instead.');
    const elevation = placement.elevation === undefined ? undefined : lengthToMm(placement.elevation, 'Height above the floor', { allowZero: true });
    if (placement.offset !== undefined) return done([add({ wallId: placement.wall, offset: lengthToMm(placement.offset, 'Offset', { allowZero: true }), elevation })]);
    const found = firstThatWorks(project, wallOffsets(project, placement.wall, dims.width).map((offset) => [add({ wallId: placement.wall, offset, elevation })]));
    if ('errors' in found) fail(`There is no free ${dims.width} mm stretch on the ${WALL_LABEL[placement.wall].toLowerCase()} for a ${specLabel(spec)}.`);
    return done((found as { commands: DesignCommand[] }).commands);
  }

  if ('fromLeftWall' in placement) {
    if (spec.mount === 'wall') fail(`A ${specLabel(spec)} hangs on a wall; give a wall and an offset instead.`);
    const x = lengthToMm(placement.fromLeftWall, 'Distance from the left wall', { allowZero: true }) + dims.width / 2;
    const z = lengthToMm(placement.fromBackWall, 'Distance from the back wall', { allowZero: true }) + dims.depth / 2;
    return done([add(), { type: 'place_entity', entityId: id, x, z, rotationY: 0 }]);
  }

  const near = 'near' in placement;
  const anchorRef = 'near' in placement ? placement.near : placement.nextTo;
  const side = 'nextTo' in placement ? placement.side : 'auto';
  const x = one(project, anchorRef, ctx, key('placement'));
  if (!x.element) fail(`New items go beside units and appliances, not beside a ${x.category}.`);
  let candidates: DesignCommand[][];
  if (x.wallId && !furniture) {
    candidates = besideOffsets(x, dims.width, side).map((c) => [add({ wallId: x.wallId!, offset: c.offset })]);
  } else {
    if (spec.mount === 'wall') fail(`A ${specLabel(spec)} hangs on a wall, but the ${x.label} stands free.`);
    const sides: ('left' | 'right')[] = side === 'auto' ? ['right', 'left'] : [side];
    candidates = sides.map((s) => {
      const c = besideFree(x.element!, dims, s);
      return [add(), { type: 'place_entity', entityId: id, x: c.x, z: c.z, rotationY: x.element!.rotationY } as DesignCommand];
    });
  }
  const found = firstThatWorks(project, candidates);
  if ('commands' in found) return done(found.commands);
  if (near) {
    // Soft placement: no room beside it, so use the first free spot and say so.
    return done([add()], `There was no room beside the ${x.label}, so it goes in the first free spot.`);
  }
  const where = side === 'auto' ? 'on either side of' : `to the ${side} of`;
  return fail(`There is no room for a ${dims.width} mm ${specLabel(spec)} ${where} the ${describeEntity(x)}: ${found.errors.join(' ')}`);
}

const LOCAL: Partial<Record<Direction, { x: number; z: number }>> = { left: { x: -1, z: 0 }, right: { x: 1, z: 0 }, forward: { x: 0, z: 1 }, backward: { x: 0, z: -1 } };
const ROOM: Partial<Record<Direction, { x: number; z: number }>> = {
  towards_left_wall: { x: -1, z: 0 },
  towards_right_wall: { x: 1, z: 0 },
  towards_back_wall: { x: 0, z: -1 },
  towards_front_wall: { x: 0, z: 1 },
};

function moveBy(t: Entity, d: number, direction: Direction): DesignCommand {
  if (t.category === 'wall') fail('Walls cannot be moved; change the room size instead.');
  if (t.opening) {
    const o = t.opening;
    if (direction === 'up' || direction === 'down') {
      if (o.kind !== 'window') fail(`A ${o.kind} starts at the floor; only windows can move up or down.`);
      return { type: 'update_opening', id: o.id, sill: o.sill + (direction === 'up' ? d : -d) };
    }
    let along: number;
    if (direction === 'left' || direction === 'right') along = (direction === 'right' ? 1 : -1) * RIGHT_ALONG[o.wallId] * d;
    else if (ROOM[direction]) {
      const v = ROOM[direction]!;
      along = (wallAxis(o.wallId) === 'x' ? v.x : v.z) * d;
      if (along === 0) fail(`The ${t.label} is in the wall; it can only move along it.`);
    } else return fail(`The ${t.label} is in the wall; it can only move along it, left or right.`);
    const offset = o.offset + along;
    if (offset < 0) fail(`That would move the ${t.label} past the start of the ${o.wallId} wall (it can move at most ${o.offset} mm that way).`);
    return { type: 'update_opening', id: o.id, offset };
  }

  const el = t.element!;
  const spec = specOf(el);
  if (direction === 'up' || direction === 'down') {
    if (spec.mount === 'floor') fail(`The ${t.label} stands on the floor; its height above the floor is fixed at ${spec.elevation} mm.`);
    const elevation = el.position.y + (direction === 'up' ? d : -d);
    if (elevation < 0) fail(`That would put the ${t.label} below the floor.`);
    return { type: 'move_entity', entityId: el.id, placement: { wallId: el.wallId!, offset: offsetAlongWall(el), elevation } };
  }
  let dx: number;
  let dz: number;
  if (LOCAL[direction]) {
    const v = LOCAL[direction]!;
    const p = localToRoom(el, { x: v.x * d, y: 0, z: v.z * d });
    dx = p.x - el.position.x;
    dz = p.z - el.position.z;
  } else {
    const v = ROOM[direction]!;
    dx = v.x * d;
    dz = v.z * d;
  }
  if (el.wallId) {
    const axis = wallAxis(el.wallId);
    const along = axis === 'x' ? dx : dz;
    const across = axis === 'x' ? dz : dx;
    if (across !== 0) {
      if (isWallHung(t)) fail(`The ${t.label} hangs on the ${el.wallId} wall; it can only move along it, up or down.`);
      return { type: 'place_entity', entityId: el.id, x: el.position.x + dx, z: el.position.z + dz, rotationY: el.rotationY };
    }
    const offset = offsetAlongWall(el) + along;
    if (offset < 0) fail(`That would move the ${t.label} past the start of the ${el.wallId} wall (it can move at most ${offsetAlongWall(el)} mm that way).`);
    return { type: 'move_entity', entityId: el.id, placement: { wallId: el.wallId, offset, elevation: isWallHung(t) ? el.position.y : undefined } };
  }
  return { type: 'place_entity', entityId: el.id, x: el.position.x + dx, z: el.position.z + dz, rotationY: el.rotationY };
}

function moveTo(project: KitchenProject, t: Entity, placement: PlacementInput, ctx: CompileContext, key: string): { commands: DesignCommand[]; note?: string } {
  if (t.category === 'wall') fail('Walls cannot be moved; change the room size instead.');
  if (t.opening) {
    if (!('wall' in placement)) fail('Doors and windows are placed on a wall: give the wall and the distance from its start.');
    const p = placement as Extract<PlacementInput, { wall: WallId }>;
    const offset = p.offset === undefined ? (p.wall === t.opening!.wallId ? t.opening!.offset : 0) : lengthToMm(p.offset, 'Offset', { allowZero: true });
    return { commands: [{ type: 'update_opening', id: t.id, wallId: p.wall, offset }] };
  }
  const el = t.element!;
  const hung = isWallHung(t);
  const elevation = hung ? el.position.y : undefined;
  if ('wall' in placement) {
    const elev = placement.elevation === undefined ? elevation : lengthToMm(placement.elevation, 'Height above the floor', { allowZero: true });
    if (placement.offset !== undefined) {
      return { commands: [{ type: 'move_entity', entityId: el.id, placement: { wallId: placement.wall, offset: lengthToMm(placement.offset, 'Offset', { allowZero: true }), elevation: elev } }] };
    }
    if (placement.wall === el.wallId) return { commands: [{ type: 'move_entity', entityId: el.id, placement: { wallId: placement.wall, offset: offsetAlongWall(el), elevation: elev } }] };
    const without = { ...project, cabinets: project.cabinets.filter((c) => c.id !== el.id), appliances: project.appliances.filter((a) => a.id !== el.id), furniture: project.furniture.filter((f) => f.id !== el.id) };
    const found = firstThatWorks(project, wallOffsets(without, placement.wall, el.dimensions.width).map((offset) => [{ type: 'move_entity', entityId: el.id, placement: { wallId: placement.wall, offset, elevation: elev } } as DesignCommand]));
    if ('errors' in found) fail(`There is no free ${el.dimensions.width} mm stretch on the ${WALL_LABEL[placement.wall].toLowerCase()} for the ${t.label}.`);
    return { commands: (found as { commands: DesignCommand[] }).commands };
  }
  if ('fromLeftWall' in placement) {
    if (hung) fail(`The ${t.label} hangs on a wall; it cannot stand free.`);
    const { sx, sz } = footprintSize(el.dimensions, el.rotationY);
    const x = lengthToMm(placement.fromLeftWall, 'Distance from the left wall', { allowZero: true }) + sx / 2;
    const z = lengthToMm(placement.fromBackWall, 'Distance from the back wall', { allowZero: true }) + sz / 2;
    return { commands: [{ type: 'place_entity', entityId: el.id, x, z, rotationY: el.rotationY }] };
  }
  const anchorRef = 'near' in placement ? placement.near : placement.nextTo;
  const side = 'nextTo' in placement ? placement.side : 'auto';
  const x = one(project, anchorRef, ctx, key);
  if (x.id === t.id) fail('Something cannot be moved next to itself.');
  if (!x.element) fail(`Items go beside units and appliances, not beside a ${x.category}.`);
  let candidates: DesignCommand[][];
  if (x.wallId) {
    // Measure beside the anchor as if the moving item were already out of the way.
    candidates = besideOffsets(x, el.dimensions.width, side).map((c) => [{ type: 'move_entity', entityId: el.id, placement: { wallId: x.wallId!, offset: c.offset, elevation } }]);
  } else {
    if (hung) fail(`The ${t.label} hangs on a wall, but the ${x.label} stands free.`);
    const sides: ('left' | 'right')[] = side === 'auto' ? ['right', 'left'] : [side];
    candidates = sides.map((s) => {
      const c = besideFree(x.element!, el.dimensions, s);
      return [{ type: 'place_entity', entityId: el.id, x: c.x, z: c.z, rotationY: x.element!.rotationY }];
    });
  }
  const found = firstThatWorks(project, candidates);
  if ('errors' in found) fail(`There is no room for the ${t.label} ${side === 'auto' ? 'on either side of' : `to the ${side} of`} the ${describeEntity(x)}: ${found.errors.join(' ')}`);
  return { commands: (found as { commands: DesignCommand[] }).commands };
}

