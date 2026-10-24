/**
 * Scene tools: the only way natural-language (AI) commands — and the inspector's validated
 * fields — change a design. Each tool takes plain JSON arguments, resolves its target against the
 * current scene and selection, validates against the template's limits and construction rules,
 * and returns a typed, undoable `Command`. Tools never mutate the scene themselves, so a rejected
 * call leaves the design exactly as it was.
 */
import { FINISHES, WORKTOP_FINISHES, finishById } from '../domain/catalog';
import { applyCommand, type Command } from '../domain/commands';
import { validateProject, type ValidationResult } from '../validation';
import { newBaseCabinet, newTallCabinet, newWallCabinet } from '../domain/factory';
import { isDecor, isKitchen, isParametric, type BaseCabinetParams, type FurnitureItem, type KitchenItem, type ParametricItem, type Project } from '../domain/types';
import { fmtMm, mm, type Um } from '../domain/units';
import { normDeg } from '../geometry/furniture';
import { adjustBaseCabinet, BASE_CABINET_LIMITS } from '../furniture/basecabinet';
import { adjustDoors, TALL_CABINET_LIMITS, WALL_CABINET_LIMITS } from '../furniture/kitchen';
import { planRun, wallFace, type RunType } from '../kitchen/run';
import { detectRooms } from '../plan/rooms';
import { nearestWall, wallIndexLabel } from '../plan/walls';
import { envelope, resolveParametric } from '../furniture';
import type { Issue } from '../furniture/parts';
import { MATERIALS, materialById } from '../materials/library';
import { anchoredMove } from './anchor';

export type ToolSelection = { kind: 'furniture' | 'opening' | 'wall' | 'room'; id: string } | null;

export interface ToolContext {
  project: Project;
  selection: ToolSelection;
}

export type ToolName = 'set_dimension' | 'set_parameter' | 'set_material' | 'rotate' | 'move' | 'rename' | 'delete' | 'select' | 'add_base_cabinet' | 'add_cabinet' | 'fill_wall';

export interface ToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
}

export type ToolResult =
  | { ok: true; command: Command | null; summary: string; selection?: ToolSelection; itemId?: string }
  | { ok: false; error: string };

export type Dimension = 'width' | 'depth' | 'height' | 'plinth' | 'worktop' | 'mount_height' | 'elevation' | 'split';
export type MaterialSlot = 'carcass' | 'shutter' | 'worktop' | 'main' | 'accent' | 'color';

/** JSON-schema tool declarations (for LLM function calling) generated from the same registry. */
export const TOOL_SPECS: { name: ToolName; description: string; parameters: Record<string, unknown> }[] = [
  {
    name: 'set_dimension',
    description: 'Change one overall dimension of a furniture piece in millimetres. Base cabinets (basecabinet): width 150–1200, height 600–1000 (floor to carcass top incl. plinth, excl. worktop), depth 300–700, plinth 0–200, worktop 0 or 12–60. Wall cabinets (wallcabinet): width 150–1200, height 300–1000, depth 250–450, mount_height 1200–2200 (underside above floor). Tall units (tallcabinet): width 300–900, height 1800–2400, depth 300–700, plinth 0–200, split 0 or the top of the lower doors.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '"selected" (default), an item id, or an item name.' },
        expectKind: { type: 'string', description: 'Optional kind the user named: basecabinet, wardrobe, tvunit, bed, sofa, table, side-table, box, library, model.' },
        dimension: { type: 'string', enum: ['width', 'depth', 'height', 'plinth', 'worktop', 'mount_height', 'elevation', 'split'] },
        valueMm: { type: 'number', description: 'New absolute value in millimetres.' },
        deltaMm: { type: 'number', description: 'Or: change relative to the current value, in millimetres (negative to reduce).' },
      },
      required: ['dimension'],
    },
  },
  {
    name: 'set_parameter',
    description: 'Change a construction parameter of a parametric piece: base cabinet front ("doors" or "drawers"), doorCount 1–2, drawerCount 1–5, shelfCount 0–3; wall cabinet front ("doors", "flap" or "open"), doorCount, shelfCount 0–3; tall unit doorCount, shelfCount 0–6; wardrobe shutterCount, shelvesPerModule, drawersPerModule.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        expectKind: { type: 'string' },
        parameter: { type: 'string', enum: ['front', 'doorCount', 'drawerCount', 'shelfCount', 'shutterCount', 'shelvesPerModule', 'drawersPerModule'] },
        value: { type: 'string', description: 'Number for counts (e.g. "2"), or "doors"/"drawers" for front.' },
      },
      required: ['parameter', 'value'],
    },
  },
  {
    name: 'set_material',
    description: 'Change a finish. Parametric pieces: slot carcass, shutter (doors/drawer fronts) or worktop. Catalogue pieces: main or accent. Blocks: color (hex). Material can be an id or a name, e.g. "walnut", "white quartz".',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string' }, expectKind: { type: 'string' }, slot: { type: 'string', enum: ['carcass', 'shutter', 'worktop', 'main', 'accent', 'color'] }, material: { type: 'string' } },
      required: ['slot', 'material'],
    },
  },
  {
    name: 'rotate',
    description: 'Rotate a piece about its centre by degrees (positive = clockwise in plan), or to an absolute angle.',
    parameters: { type: 'object', properties: { target: { type: 'string' }, byDeg: { type: 'number' }, toDeg: { type: 'number' } } },
  },
  {
    name: 'move',
    description: 'Move a piece in plan by millimetres: dxMm east(+)/west(−), dyMm south(+)/north(−).',
    parameters: { type: 'object', properties: { target: { type: 'string' }, dxMm: { type: 'number' }, dyMm: { type: 'number' } } },
  },
  { name: 'rename', description: 'Rename a piece.', parameters: { type: 'object', properties: { target: { type: 'string' }, name: { type: 'string' } }, required: ['name'] } },
  { name: 'delete', description: 'Delete a piece.', parameters: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'select', description: 'Select a piece by id or name.', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  {
    name: 'add_cabinet',
    description: 'Add one kitchen cabinet: type base, wall or tall. With a kitchen unit selected it goes beside it (side right/left); a wall cabinet added while a base cabinet is selected goes directly above it.',
    parameters: { type: 'object', properties: { type: { type: 'string', enum: ['base', 'wall', 'tall'] }, widthMm: { type: 'number' }, front: { type: 'string', enum: ['doors', 'drawers', 'flap', 'open'] }, side: { type: 'string', enum: ['right', 'left'] } }, required: ['type'] },
  },
  {
    name: 'fill_wall',
    description: 'Fill a wall with a run of kitchen cabinets of one type (base, wall or tall), skipping doors, windows the units would block, and pieces already on the wall. Wall: "selected" (the selected wall), "behind_selected" (the wall behind the selected piece, default) or a wall number. fit "exact" (default) widens modules to close gaps; "standard" keeps 900/800/600/450/300 widths and leaves fillers.',
    parameters: { type: 'object', properties: { wall: { type: 'string' }, type: { type: 'string', enum: ['base', 'wall', 'tall'] }, fit: { type: 'string', enum: ['exact', 'standard'] }, front: { type: 'string', enum: ['doors', 'drawers'] } }, required: ['type'] },
  },
  {
    name: 'add_base_cabinet',
    description: 'Add a kitchen base cabinet. With a base cabinet selected it is placed beside it (side "right" or "left"); otherwise at the centre of the first room.',
    parameters: { type: 'object', properties: { widthMm: { type: 'number' }, front: { type: 'string', enum: ['doors', 'drawers'] }, side: { type: 'string', enum: ['right', 'left'] } } },
  },
];

const KIND_LABEL: Record<FurnitureItem['kind'], string> = {
  basecabinet: 'base cabinet',
  wallcabinet: 'wall cabinet',
  tallcabinet: 'tall unit',
  wardrobe: 'wardrobe',
  tvunit: 'TV unit',
  bed: 'bed',
  sofa: 'sofa',
  table: 'table',
  'side-table': 'side table',
  box: 'block',
  library: 'catalogue piece',
  model: 'studio model',
};

const fail = (error: string): ToolResult => ({ ok: false, error });
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Resolve the piece a tool acts on: the selection, an id, or a unique name. */
export function resolveTarget(ctx: ToolContext, args: Record<string, unknown>): { item: FurnitureItem } | { error: string } {
  const t = str(args.target);
  let item: FurnitureItem | undefined;
  if (!t || t === 'selected' || t === 'it' || t === 'this') {
    if (ctx.selection?.kind !== 'furniture') return { error: 'Select a piece first (click it in the plan or 3D view).' };
    item = ctx.project.furniture.find((f) => f.id === ctx.selection!.id);
    if (!item) return { error: 'The selected piece no longer exists.' };
  } else {
    item = ctx.project.furniture.find((f) => f.id === t);
    if (!item) {
      const matches = ctx.project.furniture.filter((f) => f.name.toLowerCase() === t.toLowerCase());
      const loose = matches.length ? matches : ctx.project.furniture.filter((f) => f.name.toLowerCase().includes(t.toLowerCase()));
      if (loose.length > 1) return { error: `"${t}" matches ${loose.length} pieces (${loose.slice(0, 4).map((f) => f.name).join(', ')}). Select the one you mean.` };
      item = loose[0];
    }
    if (!item) return { error: `No piece called "${t}" in this design.` };
  }
  const expect = str(args.expectKind);
  if (expect && expect !== item.kind && !(expect === 'decor' && isDecor(item))) {
    const want = KIND_LABEL[expect as FurnitureItem['kind']] ?? expect;
    return { error: `The selected piece is a ${KIND_LABEL[item.kind]} (“${item.name}”), not a ${want}.` };
  }
  return { item };
}

function errorIssues(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.severity === 'error');
}

/**
 * Validate parametric params: reject if the edit introduces construction errors the piece did not
 * already have (so an older, already-flagged design can still be repaired step by step).
 */
function checkParametric(ctx: ToolContext, item: ParametricItem, params: Record<string, unknown>): string | null {
  const before = new Set(errorIssues(resolveParametric(item, ctx.project.rulePack).issues).map((i) => i.code));
  const candidate = { ...item, params: { ...item.params, ...params } } as ParametricItem;
  const introduced = errorIssues(resolveParametric(candidate, ctx.project.rulePack).issues).filter((i) => !before.has(i.code));
  return introduced.length ? introduced.map((i) => i.message).join(' ') : null;
}

const DIMENSION_KEYS: Record<Dimension, string> = {
  width: 'widthUm',
  depth: 'depthUm',
  height: 'heightUm',
  plinth: 'plinthUm',
  worktop: 'worktopUm',
  mount_height: 'mountHeightUm',
  elevation: 'elevationUm',
  split: 'splitUm',
};

/** The limits table for kitchen units (one source for tools, inspector and resolver). */
function kitchenLimits(item: FurnitureItem): Record<string, { min: number; max: number; label: string }> | null {
  return item.kind === 'basecabinet' ? BASE_CABINET_LIMITS : item.kind === 'wallcabinet' ? WALL_CABINET_LIMITS : item.kind === 'tallcabinet' ? TALL_CABINET_LIMITS : null;
}

function allowedDimensions(item: FurnitureItem): Dimension[] {
  switch (item.kind) {
    case 'basecabinet': return ['width', 'depth', 'height', 'plinth', 'worktop'];
    case 'wallcabinet': return ['width', 'depth', 'height', 'mount_height'];
    case 'tallcabinet': return ['width', 'depth', 'height', 'plinth', 'split'];
    case 'tvunit': return ['width', 'depth', 'height', 'mount_height'];
    case 'library':
    case 'model': return ['width', 'depth', 'height', 'elevation'];
    default: return ['width', 'depth', 'height'];
  }
}

/** Shared by set_dimension / set_parameter: validate a params patch and build the command. */
function planParams(ctx: ToolContext, item: FurnitureItem, patch: Record<string, unknown>, what: string): ToolResult {
  let params = patch;
  const notes: string[] = [];
  if (item.kind === 'basecabinet') {
    const adj = adjustBaseCabinet(item.params, { ...item.params, ...patch } as BaseCabinetParams);
    params = { ...patch };
    for (const k of Object.keys(adj.params) as (keyof BaseCabinetParams)[]) if (adj.params[k] !== item.params[k]) params[k] = adj.params[k];
    notes.push(...adj.notes);
  } else if (item.kind === 'wallcabinet' || item.kind === 'tallcabinet') {
    const next = { ...item.params, ...patch } as typeof item.params;
    const adj = adjustDoors(item.params, next, item.kind === 'tallcabinet' || (next as { front?: string }).front === 'doors');
    params = { ...patch };
    if (adj.params.doorCount !== item.params.doorCount) params.doorCount = adj.params.doorCount;
    notes.push(...adj.notes);
  }
  if (isParametric(item)) {
    const err = checkParametric(ctx, item, params);
    if (err) return fail(`Can't change ${item.name}: ${err}`);
  }
  const changed = Object.keys(params).some((k) => (item.params as unknown as Record<string, unknown>)[k] !== params[k]);
  if (!changed) return { ok: true, command: null, summary: `${item.name} already has ${what}.`, itemId: item.id };
  const paramsCmd: Command = { type: 'furniture.params', id: item.id, params };
  const moveCmd = anchoredMove(item, { ...item, params: { ...item.params, ...params } } as FurnitureItem, ctx.project.plan);
  return {
    ok: true,
    command: moveCmd ? { type: 'batch', label: what, commands: [paramsCmd, moveCmd] } : paramsCmd,
    summary: `${item.name}: ${what}${notes.length ? ` — ${notes.join('; ')}` : ''}.`,
    itemId: item.id,
  };
}

function setDimension(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  const { item } = r;
  const dim = str(args.dimension) as Dimension;
  const allowed = allowedDimensions(item);
  if (!allowed.includes(dim)) return fail(`A ${KIND_LABEL[item.kind]} has no "${dim || '?'}" dimension. Use ${allowed.join(', ')}.`);
  const key = DIMENSION_KEYS[dim];
  const current = (item.params as unknown as Record<string, number>)[key];
  const delta = num(args.deltaMm);
  const v = args.valueMm === undefined && Number.isFinite(delta) ? Math.round(current / 100) / 10 + delta : num(args.valueMm);
  if (!Number.isFinite(v)) return fail(`${dim} must be a number of millimetres.`);
  if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) return fail('Dimensions are limited to 0.1 mm.');
  const um: Um = mm(Math.round(v * 10) / 10);
  const limits = kitchenLimits(item);
  if (limits) {
    const lim = limits[key];
    if (um < lim.min || um > lim.max) return fail(`${lim.label} must be between ${fmtMm(lim.min)} and ${fmtMm(lim.max)} mm — ${fmtMm(um)} mm is outside the range.`);
  } else if (dim === 'elevation' || dim === 'mount_height') {
    if (um < 0 || um > mm(3000)) return fail(`${dim === 'elevation' ? 'Elevation' : 'Mount height'} must be between 0 and 3000 mm.`);
  } else if (um < mm(10) || um > mm(8000)) {
    return fail(`${dim[0].toUpperCase()}${dim.slice(1)} must be between 10 and 8000 mm.`);
  }
  return planParams(ctx, item, { [key]: um }, `${dim.replace('_', ' ')} ${fmtMm(um)} mm`);
}

const PARAMS_BY_KIND: Partial<Record<FurnitureItem['kind'], string[]>> = {
  basecabinet: ['front', 'doorCount', 'drawerCount', 'shelfCount'],
  wallcabinet: ['front', 'doorCount', 'shelfCount'],
  tallcabinet: ['doorCount', 'shelfCount'],
  wardrobe: ['shutterCount', 'shelvesPerModule', 'drawersPerModule'],
};

function setParameter(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  const { item } = r;
  const p = str(args.parameter);
  const allowed = PARAMS_BY_KIND[item.kind] ?? [];
  if (!allowed.includes(p)) return fail(allowed.length ? `A ${KIND_LABEL[item.kind]} has no "${p}" setting. Use ${allowed.join(', ')}.` : `A ${KIND_LABEL[item.kind]} has no construction settings.`);
  if (p === 'front') {
    const v = str(args.value).toLowerCase();
    const options = item.kind === 'wallcabinet' ? ['doors', 'flap', 'open'] : ['doors', 'drawers'];
    const front = options.find((o) => v.startsWith(o.replace(/s$/, ''))) ?? null;
    if (!front) return fail(`Front must be ${options.map((o) => `"${o}"`).join(' or ')}.`);
    return planParams(ctx, item, { front }, `${front} front`);
  }
  const v = num(args.value);
  if (!Number.isInteger(v)) return fail(`${p} must be a whole number.`);
  const limits = kitchenLimits(item);
  if (limits) {
    const lim = limits[p];
    if (v < lim.min || v > lim.max) return fail(`${lim.label} must be between ${lim.min} and ${lim.max}.`);
  } else if (v < 0 || v > 12) return fail(`${p} must be between 0 and 12.`);
  return planParams(ctx, item, { [p]: v }, `${p.replace(/Count$/, ' count').replace(/([A-Z])/g, ' $1').toLowerCase()} ${v}`);
}

function findFinish(list: { id: string; name: string }[], q: string) {
  const s = q.toLowerCase();
  return list.find((f) => f.id === s) ?? list.find((f) => f.name.toLowerCase() === s) ?? list.find((f) => f.name.toLowerCase().includes(s) || f.id.includes(s.replace(/\s+/g, '-')));
}

const CSS_COLORS: Record<string, string> = { white: '#f2f0eb', black: '#2b2b2d', grey: '#9a9893', gray: '#9a9893', beige: '#cbbba1', brown: '#7a5a40', green: '#7d8a6f', blue: '#5f7c96', red: '#a5503f', yellow: '#d6b04a', cream: '#ece3cf' };

function setMaterial(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  const { item } = r;
  let slot = str(args.slot) as MaterialSlot;
  const q = str(args.material);
  if (!q) return fail('Name a material, e.g. walnut or white quartz.');
  if (isParametric(item)) {
    if (slot === 'main' || slot === 'color') slot = 'shutter';
    const slots = item.kind === 'basecabinet' ? ['carcass', 'shutter', 'worktop'] : ['carcass', 'shutter'];
    if (!slots.includes(slot)) return fail(`A ${KIND_LABEL[item.kind]} has ${slots.join(', ')} finishes.`);
    const list = slot === 'worktop' ? WORKTOP_FINISHES : FINISHES;
    const f = findFinish(list, q);
    if (!f) return fail(`"${q}" isn't a ${slot === 'worktop' ? 'worktop' : 'cabinet'} finish. Choose from: ${list.map((x) => x.name).join(', ')}.`);
    const mats = item.materials as Record<string, string>;
    if (mats[slot] === f.id) return { ok: true, command: null, summary: `${item.name} ${slot} is already ${f.name}.`, itemId: item.id };
    const label = slot === 'shutter' ? (item.kind === 'basecabinet' && item.params.front === 'drawers' ? 'drawer fronts' : 'doors') : slot;
    return { ok: true, command: { type: 'furniture.update', id: item.id, patch: { materials: { ...mats, [slot]: f.id } } }, summary: `${item.name}: ${label} → ${finishById(f.id).name}.`, itemId: item.id };
  }
  if (item.kind === 'library') {
    if (slot !== 'accent') slot = 'main';
    const f = findFinish(MATERIALS.filter((m) => m.category === 'surface'), q);
    if (!f) return fail(`"${q}" isn't in the material library.`);
    return { ok: true, command: { type: 'furniture.update', id: item.id, patch: { materials: { ...item.materials, [slot]: f.id } } }, summary: `${item.name}: ${slot} → ${materialById(f.id).name}.`, itemId: item.id };
  }
  if (isDecor(item)) {
    const finish = findFinish(FINISHES, q);
    const hex = /^#[0-9a-f]{6}$/i.test(q) ? q.toLowerCase() : (CSS_COLORS[q.toLowerCase()] ?? (finish ? finishById(finish.id).color : undefined));
    if (!hex) return fail(`Use a colour like #a07a55 or a name (${Object.keys(CSS_COLORS).join(', ')}).`);
    return { ok: true, command: { type: 'furniture.params', id: item.id, params: { color: hex } }, summary: `${item.name}: colour ${hex}.`, itemId: item.id };
  }
  return fail('Studio models keep the materials they were uploaded with.');
}

function rotate(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  const by = num(args.byDeg);
  const to = num(args.toDeg);
  if (!Number.isFinite(by) && !Number.isFinite(to)) return fail('Give an angle in degrees.');
  const next = normDeg(Number.isFinite(to) ? to : r.item.rotDeg + by);
  return { ok: true, command: { type: 'furniture.update', id: r.item.id, patch: { rotDeg: next } }, summary: `${r.item.name}: rotated to ${next}°.`, itemId: r.item.id };
}

function move(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  const dx = num(args.dxMm ?? 0);
  const dy = num(args.dyMm ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fail('Distances must be numbers of millimetres.');
  if (Math.abs(dx) > 20000 || Math.abs(dy) > 20000) return fail('Moves are limited to 20 m.');
  return { ok: true, command: { type: 'furniture.update', id: r.item.id, patch: { xUm: r.item.xUm + mm(dx), yUm: r.item.yUm + mm(dy) } }, summary: `${r.item.name}: moved ${fmtMm(mm(Math.hypot(dx, dy)))} mm.`, itemId: r.item.id };
}

function rename(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  const name = str(args.name).slice(0, 80);
  if (!name) return fail('Give a new name.');
  return { ok: true, command: { type: 'furniture.update', id: r.item.id, patch: { name } }, summary: `Renamed “${r.item.name}” to “${name}”.`, itemId: r.item.id };
}

function del(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, args);
  if ('error' in r) return fail(r.error);
  return { ok: true, command: { type: 'furniture.remove', id: r.item.id }, summary: `Deleted ${r.item.name}.`, selection: null };
}

function select(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const r = resolveTarget(ctx, { ...args, target: str(args.target) || 'selected' });
  if ('error' in r) return fail(r.error);
  return { ok: true, command: null, summary: `Selected ${r.item.name}.`, selection: { kind: 'furniture', id: r.item.id }, itemId: r.item.id };
}

function addBaseCabinet(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const w = args.widthMm === undefined ? 600 : num(args.widthMm);
  const lim = BASE_CABINET_LIMITS.widthUm;
  if (!Number.isFinite(w) || mm(w) < lim.min || mm(w) > lim.max) return fail(`Width must be between ${fmtMm(lim.min)} and ${fmtMm(lim.max)} mm.`);
  const front = str(args.front) === 'drawers' ? 'drawers' : 'doors';
  const item = newBaseCabinet(0, 0, { widthUm: mm(w), front, doorCount: mm(w) > mm(600) ? 2 : 1 });
  const sel = ctx.selection?.kind === 'furniture' ? ctx.project.furniture.find((f) => f.id === ctx.selection!.id) : undefined;
  if (sel?.kind === 'basecabinet') {
    // Beside the selected unit along its own width axis, backs aligned.
    const dir = str(args.side) === 'left' ? -1 : 1;
    const a = (sel.rotDeg * Math.PI) / 180;
    const off = (envelope(sel).widthUm + envelope(item).widthUm) / 2;
    const dBack = (envelope(item).depthUm - envelope(sel).depthUm) / 2; // keep the backs flush
    item.xUm = Math.round(sel.xUm + dir * off * Math.cos(a) - dBack * Math.sin(a));
    item.yUm = Math.round(sel.yUm + dir * off * Math.sin(a) + dBack * Math.cos(a));
    item.rotDeg = sel.rotDeg;
    item.params = { ...item.params, heightUm: sel.params.heightUm, depthUm: sel.params.depthUm, plinthUm: sel.params.plinthUm, worktopUm: sel.params.worktopUm };
    item.materials = { ...sel.materials };
  } else {
    const xs = ctx.project.plan.walls.flatMap((wl) => [wl.a.x, wl.b.x]);
    const ys = ctx.project.plan.walls.flatMap((wl) => [wl.a.y, wl.b.y]);
    item.xUm = xs.length ? Math.round((Math.min(...xs) + Math.max(...xs)) / 2) : mm(1000);
    item.yUm = ys.length ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : mm(1000);
  }
  return { ok: true, command: { type: 'furniture.add', item }, summary: `Added a ${fmtMm(item.params.widthUm)} mm ${front === 'drawers' ? 'drawer' : 'door'} base cabinet.`, selection: { kind: 'furniture', id: item.id }, itemId: item.id };
}

const RUN_KIND: Record<RunType, KitchenItem['kind']> = { base: 'basecabinet', wall: 'wallcabinet', tall: 'tallcabinet' };

function selectedItem(ctx: ToolContext): FurnitureItem | undefined {
  return ctx.selection?.kind === 'furniture' ? ctx.project.furniture.find((f) => f.id === ctx.selection!.id) : undefined;
}

function addCabinet(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const type = (str(args.type) || 'base') as RunType;
  if (!['base', 'wall', 'tall'].includes(type)) return fail('Cabinet type must be base, wall or tall.');
  const limits = type === 'base' ? BASE_CABINET_LIMITS : type === 'wall' ? WALL_CABINET_LIMITS : TALL_CABINET_LIMITS;
  const w = args.widthMm === undefined ? 600 : num(args.widthMm);
  if (!Number.isFinite(w) || mm(w) < limits.widthUm.min || mm(w) > limits.widthUm.max) return fail(`Width must be between ${fmtMm(limits.widthUm.min)} and ${fmtMm(limits.widthUm.max)} mm.`);
  const widthUm = mm(w);
  const doorCount = widthUm > mm(600) ? 2 : 1;
  const frontArg = str(args.front);
  let item: KitchenItem;
  if (type === 'base') item = newBaseCabinet(0, 0, { widthUm, front: frontArg === 'drawers' ? 'drawers' : 'doors', doorCount });
  else if (type === 'wall') item = newWallCabinet(0, 0, { widthUm, front: frontArg === 'flap' || frontArg === 'open' ? frontArg : 'doors', doorCount });
  else item = newTallCabinet(0, 0, { widthUm, doorCount });
  const sel = selectedItem(ctx);
  if (sel && isKitchen(sel)) {
    const a = (sel.rotDeg * Math.PI) / 180;
    const eSel = envelope(sel);
    const eNew = envelope(item);
    const dBack = (eNew.depthUm - eSel.depthUm) / 2; // keep the backs flush
    if (type === 'wall' && sel.kind === 'basecabinet') {
      // Directly above the base unit, same width, backs on the same wall.
      item.params = { ...item.params, widthUm: sel.params.widthUm, doorCount: sel.params.widthUm > mm(600) ? 2 : 1 };
      const d2 = (envelope(item).depthUm - eSel.depthUm) / 2;
      item.xUm = Math.round(sel.xUm - d2 * Math.sin(a));
      item.yUm = Math.round(sel.yUm + d2 * Math.cos(a));
    } else {
      const dir = str(args.side) === 'left' ? -1 : 1;
      const off = (eSel.widthUm + eNew.widthUm) / 2;
      item.xUm = Math.round(sel.xUm + dir * off * Math.cos(a) - dBack * Math.sin(a));
      item.yUm = Math.round(sel.yUm + dir * off * Math.sin(a) + dBack * Math.cos(a));
      if (sel.kind === item.kind) {
        const keep = sel.kind === 'basecabinet' ? ['heightUm', 'depthUm', 'plinthUm', 'worktopUm'] : sel.kind === 'wallcabinet' ? ['heightUm', 'depthUm', 'mountHeightUm'] : ['heightUm', 'depthUm', 'plinthUm', 'splitUm'];
        const p = { ...item.params } as Record<string, unknown>;
        for (const k of keep) p[k] = (sel.params as unknown as Record<string, unknown>)[k];
        item.params = p as never;
      }
    }
    item.rotDeg = sel.rotDeg;
    // Match the selected unit's finishes (a base unit's worktop stays its own).
    item.materials = { ...(item.materials as object), carcass: sel.materials.carcass, shutter: sel.materials.shutter } as never;
  } else {
    const xs = ctx.project.plan.walls.flatMap((wl) => [wl.a.x, wl.b.x]);
    const ys = ctx.project.plan.walls.flatMap((wl) => [wl.a.y, wl.b.y]);
    item.xUm = xs.length ? Math.round((Math.min(...xs) + Math.max(...xs)) / 2) : mm(1000);
    item.yUm = ys.length ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : mm(1000);
  }
  const what = type === 'base' ? `${item.kind === 'basecabinet' && item.params.front === 'drawers' ? 'drawer' : 'door'} base cabinet` : type === 'wall' ? 'wall cabinet' : 'tall unit';
  return { ok: true, command: { type: 'furniture.add', item }, summary: `Added a ${fmtMm(envelope(item).widthUm)} mm ${what}${type === 'wall' && sel?.kind === 'basecabinet' ? ` above ${sel.name}` : ''}.`, selection: { kind: 'furniture', id: item.id }, itemId: item.id };
}

function fillWall(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const type = (str(args.type) || 'base') as RunType;
  if (!['base', 'wall', 'tall'].includes(type)) return fail('Run type must be base, wall or tall.');
  const which = str(args.wall) || (ctx.selection?.kind === 'wall' ? 'selected' : 'behind_selected');
  let wallId: string | undefined;
  const sel = selectedItem(ctx);
  if (which === 'selected') {
    if (ctx.selection?.kind !== 'wall') return fail('Select a wall first (click it in the plan).');
    wallId = ctx.selection.id;
  } else if (which === 'behind_selected') {
    if (ctx.selection?.kind === 'wall') wallId = ctx.selection.id;
    else if (sel) {
      // The wall behind the piece: from its centre, step back half its depth.
      const a = (sel.rotDeg * Math.PI) / 180;
      const d = envelope(sel).depthUm / 2;
      const back = { x: sel.xUm + Math.sin(a) * d, y: sel.yUm - Math.cos(a) * d };
      wallId = nearestWall(ctx.project.plan, back, mm(150))?.wall.id;
      if (!wallId) return fail(`${sel.name} isn't against a wall. Select a wall instead.`);
    } else return fail('Select a wall, or a cabinet standing against the wall to fill.');
  } else {
    const n = Number(which.replace(/\D/g, ''));
    wallId = Number.isInteger(n) && n >= 1 ? ctx.project.plan.walls[n - 1]?.id : undefined;
    if (!wallId) return fail(`There is no wall "${which}".`);
  }
  const face = wallFace(ctx.project.plan, wallId, detectRooms(ctx.project.plan));
  if (!face) return fail(`${wallIndexLabel(ctx.project.plan, wallId)} doesn't face a closed room.`);
  const fit = str(args.fit) === 'standard' ? 'standard' : 'exact';
  const front = str(args.front) === 'drawers' ? 'drawers' : str(args.front) === 'doors' ? 'doors' : undefined;
  const template = sel && sel.kind === RUN_KIND[type] ? sel : ctx.project.furniture.find((f) => f.kind === RUN_KIND[type]);
  const run = planRun(ctx.project, face, type, { fit, front, template });
  if (!run.items.length) return fail(`No clear stretch of ${wallIndexLabel(ctx.project.plan, wallId)} is long enough for ${type} units (at least 150 mm, clear of doors${type === 'base' ? '' : ' and windows'} and other pieces).`);
  const fillers = run.fillersUm.filter((f) => f > mm(1));
  const widths = run.items.map((i) => fmtMm(i.params.widthUm)).join(' + ');
  return {
    ok: true,
    command: { type: 'batch', label: `Fill wall with ${type} units`, commands: run.items.map((item): Command => ({ type: 'furniture.add', item })) },
    summary: `Added ${run.items.length} ${type} unit${run.items.length > 1 ? 's' : ''} on ${wallIndexLabel(ctx.project.plan, wallId)}: ${widths} mm${fillers.length ? ` (filler ${fillers.map((f) => fmtMm(f)).join(', ')} mm)` : ''}.`,
    itemId: run.items[0].id,
  };
}

const HANDLERS: Record<ToolName, (ctx: ToolContext, args: Record<string, unknown>) => ToolResult> = {
  set_dimension: setDimension,
  set_parameter: setParameter,
  set_material: setMaterial,
  rotate,
  move,
  rename,
  delete: del,
  select,
  add_base_cabinet: addBaseCabinet,
  add_cabinet: addCabinet,
  fill_wall: fillWall,
};

export function isToolName(s: string): s is ToolName {
  return s in HANDLERS;
}

/** Plan checks a geometry-changing tool must not make worse. */
const SPATIAL = new Set(['OVERLAP', 'OUT_OF_ROOM', 'CROSSES_WALL', 'ABOVE_CEILING']);
const GEOMETRIC: ReadonlySet<ToolName> = new Set(['set_dimension', 'set_parameter', 'rotate', 'move', 'add_cabinet', 'add_base_cabinet', 'fill_wall']);

/**
 * Reject a change that introduces a collision, pushes a piece out of its room, into a wall or
 * through the ceiling. Problems that already existed don't block (so a messy design can be fixed
 * step by step).
 */
function spatialCheck(project: Project, command: Command): string | null {
  const key = (r: ValidationResult) => `${r.code}:${[...r.itemIds].sort().join(',')}`;
  const pick = (p: Project) => validateProject(p).filter((r) => r.severity === 'error' && SPATIAL.has(r.code));
  const before = new Set(pick(project).map(key));
  const introduced = pick(applyCommand(project, command)[0]).filter((r) => !before.has(key(r)));
  return introduced.length ? introduced.slice(0, 2).map((r) => r.message).join(' ') : null;
}

/** Validate one tool call against the scene. Never throws for bad input. */
export function planTool(ctx: ToolContext, call: ToolCall): ToolResult {
  if (!call || typeof call.tool !== 'string' || !isToolName(call.tool)) return fail(`Unknown action "${String(call?.tool)}".`);
  const args = call.args && typeof call.args === 'object' ? call.args : {};
  try {
    const r = HANDLERS[call.tool](ctx, args);
    if (r.ok && r.command && GEOMETRIC.has(call.tool)) {
      const clash = spatialCheck(ctx.project, r.command);
      if (clash) return fail(clash);
    }
    return r;
  } catch (e) {
    return fail(`Could not apply ${call.tool}: ${(e as Error).message}`);
  }
}

export interface ToolBatch {
  ok: true;
  /** One undoable step for the whole request (null when nothing changes). */
  command: Command | null;
  summaries: string[];
  selection: ToolSelection | undefined;
}

/**
 * Validate a sequence of calls; each sees the scene as the previous ones left it. All-or-nothing:
 * the first rejected call rejects the whole request.
 */
export function planTools(ctx: ToolContext, calls: ToolCall[], label: string, apply: (p: Project, c: Command) => Project): ToolBatch | { ok: false; error: string; index: number } {
  if (!calls.length) return { ok: false, error: 'Nothing to do.', index: -1 };
  if (calls.length > 12) return { ok: false, error: 'Too many actions in one request (max 12).', index: -1 };
  let project = ctx.project;
  let selection = ctx.selection;
  let selectionOut: ToolSelection | undefined;
  const commands: Command[] = [];
  const summaries: string[] = [];
  for (let i = 0; i < calls.length; i++) {
    const r = planTool({ project, selection }, calls[i]);
    if (!r.ok) return { ok: false, error: r.error, index: i };
    summaries.push(r.summary);
    if (r.command) {
      project = apply(project, r.command);
      commands.push(r.command);
    }
    if (r.selection !== undefined) {
      selection = r.selection;
      selectionOut = r.selection;
    }
  }
  const command: Command | null = commands.length === 0 ? null : commands.length === 1 ? commands[0] : { type: 'batch', label, commands };
  return { ok: true, command, summaries, selection: selectionOut };
}
