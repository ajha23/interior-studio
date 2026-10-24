/**
 * Scene tools: the only way natural-language (AI) commands — and the inspector's validated
 * fields — change a design. Each tool takes plain JSON arguments, resolves its target against the
 * current scene and selection, validates against the template's limits and construction rules,
 * and returns a typed, undoable `Command`. Tools never mutate the scene themselves, so a rejected
 * call leaves the design exactly as it was.
 */
import { FINISHES, WORKTOP_FINISHES, finishById } from '../domain/catalog';
import type { Command } from '../domain/commands';
import { newBaseCabinet } from '../domain/factory';
import { isDecor, isParametric, type BaseCabinetParams, type FurnitureItem, type ParametricItem, type Project } from '../domain/types';
import { fmtMm, mm, type Um } from '../domain/units';
import { normDeg } from '../geometry/furniture';
import { adjustBaseCabinet, BASE_CABINET_LIMITS } from '../furniture/basecabinet';
import { envelope, resolveParametric } from '../furniture';
import type { Issue } from '../furniture/parts';
import { MATERIALS, materialById } from '../materials/library';
import { anchoredMove } from './anchor';

export type ToolSelection = { kind: 'furniture' | 'opening' | 'wall' | 'room'; id: string } | null;

export interface ToolContext {
  project: Project;
  selection: ToolSelection;
}

export type ToolName = 'set_dimension' | 'set_parameter' | 'set_material' | 'rotate' | 'move' | 'rename' | 'delete' | 'select' | 'add_base_cabinet';

export interface ToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
}

export type ToolResult =
  | { ok: true; command: Command | null; summary: string; selection?: ToolSelection; itemId?: string }
  | { ok: false; error: string };

export type Dimension = 'width' | 'depth' | 'height' | 'plinth' | 'worktop' | 'mount_height' | 'elevation';
export type MaterialSlot = 'carcass' | 'shutter' | 'worktop' | 'main' | 'accent' | 'color';

/** JSON-schema tool declarations (for LLM function calling) generated from the same registry. */
export const TOOL_SPECS: { name: ToolName; description: string; parameters: Record<string, unknown> }[] = [
  {
    name: 'set_dimension',
    description: 'Change one overall dimension of a furniture piece in millimetres. Kitchen base cabinets: width 150–1200, height 600–1000 (floor to carcass top incl. plinth, excl. worktop), depth 300–700, plinth 0–200, worktop 0 or 12–60.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '"selected" (default), an item id, or an item name.' },
        expectKind: { type: 'string', description: 'Optional kind the user named: basecabinet, wardrobe, tvunit, bed, sofa, table, side-table, box, library, model.' },
        dimension: { type: 'string', enum: ['width', 'depth', 'height', 'plinth', 'worktop', 'mount_height', 'elevation'] },
        valueMm: { type: 'number', description: 'New absolute value in millimetres.' },
        deltaMm: { type: 'number', description: 'Or: change relative to the current value, in millimetres (negative to reduce).' },
      },
      required: ['dimension'],
    },
  },
  {
    name: 'set_parameter',
    description: 'Change a construction parameter of a parametric piece: base cabinet front ("doors" or "drawers"), doorCount 1–2, drawerCount 1–5, shelfCount 0–3; wardrobe shutterCount, shelvesPerModule, drawersPerModule.',
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
    name: 'add_base_cabinet',
    description: 'Add a kitchen base cabinet. With a base cabinet selected it is placed beside it (side "right" or "left"); otherwise at the centre of the first room.',
    parameters: { type: 'object', properties: { widthMm: { type: 'number' }, front: { type: 'string', enum: ['doors', 'drawers'] }, side: { type: 'string', enum: ['right', 'left'] } } },
  },
];

const KIND_LABEL: Record<FurnitureItem['kind'], string> = {
  basecabinet: 'base cabinet',
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
};

function allowedDimensions(item: FurnitureItem): Dimension[] {
  switch (item.kind) {
    case 'basecabinet': return ['width', 'depth', 'height', 'plinth', 'worktop'];
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
  if (item.kind === 'basecabinet') {
    const lim = BASE_CABINET_LIMITS[key as keyof typeof BASE_CABINET_LIMITS];
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
    const front = v.startsWith('door') ? 'doors' : v.startsWith('drawer') ? 'drawers' : null;
    if (!front) return fail('Front must be "doors" or "drawers".');
    return planParams(ctx, item, { front }, `${front} front`);
  }
  const v = num(args.value);
  if (!Number.isInteger(v)) return fail(`${p} must be a whole number.`);
  if (item.kind === 'basecabinet') {
    const lim = BASE_CABINET_LIMITS[p as 'doorCount' | 'drawerCount' | 'shelfCount'];
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
};

export function isToolName(s: string): s is ToolName {
  return s in HANDLERS;
}

/** Validate one tool call against the scene. Never throws for bad input. */
export function planTool(ctx: ToolContext, call: ToolCall): ToolResult {
  if (!call || typeof call.tool !== 'string' || !isToolName(call.tool)) return fail(`Unknown action "${String(call?.tool)}".`);
  const args = call.args && typeof call.args === 'object' ? call.args : {};
  try {
    return HANDLERS[call.tool](ctx, args);
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
