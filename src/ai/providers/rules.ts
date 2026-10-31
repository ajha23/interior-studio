/**
 * A deterministic, rule-based provider: no network, same input → same output. It understands the
 * common designer requests (create, resize, move, rotate, delete, finishes, room size, units,
 * openings, inspection, undo/redo, "keep X unchanged") and multi-step requests joined by "then".
 * It produces the same `AssistantResponse`s a language model would, so everything downstream —
 * reference resolution, unit conversion, validation, preview and commit — is exercised for real.
 */
import { WALLS, type FurnitureType, type KitchenProject, type WallId } from '@/domain';
import { LENGTH_UNITS, parseLength, UNIT_LABEL, type LengthUnit } from '@/engine/measurement/units';
import { findEntity } from '../entities';
import { resolveTarget, typeAlias } from '../resolve';
import { DesignObjectiveSchema, type AssistantOperation, type AssistantRequest, type AssistantResponse, type DeliverableRequest, type DesignObjectiveInput, type PackageOp, type Direction, type LengthInput, type PlacementInput, type Priority, type Show, type TargetRef } from '../schema';
import type { SceneAction } from '../schema';
import { parseHomeBrief } from '@/engine/home/brief';
import type { AssistantProvider } from './types';

export const EXAMPLE_REQUESTS = [
  'Create a 900 mm wide base cabinet',
  'Make it 750 mm high',
  'Move the selected cabinet 300 mm to the right',
  'Change all base cabinets to 750 mm height',
  'Add a 600 mm dishwasher next to the sink cabinet',
  'Change the room width to 12 feet',
  'Change all measurements to feet and inches',
  'Show me all cabinet dimensions',
  'Keep the window wall unchanged',
  'Undo the last change',
];

export class RuleBasedProvider implements AssistantProvider {
  readonly id = 'rules';
  readonly model = 'rules-v1';

  async respond(request: AssistantRequest): Promise<AssistantResponse> {
    return interpret(request);
  }
}

type Ctx = { project: KitchenProject; unit: LengthUnit; request: AssistantRequest };

const HELP = `I can create, resize, move, rotate and delete units, appliances, furniture, doors and windows; change finishes, the room size and display units; list dimensions; and undo or redo. For example: “${EXAMPLE_REQUESTS[0]}”, “${EXAMPLE_REQUESTS[2]}” or “${EXAMPLE_REQUESTS[4]}”.`;

export function interpret(request: AssistantRequest): AssistantResponse {
  const ctx: Ctx = { project: request.project, unit: request.project.preferences.unit, request };
  const text = normalise(request.message);

  const history = /^(undo|redo)\b(?:.*?\b(\d+|two|three)\b)?/.exec(text) ?? (/^(?:revert|go back|take that back)\b/.test(text) ? ['', 'undo'] : null);
  if (history) {
    const steps = history[2] ? (WORD_NUM[history[2]] ?? Number(history[2])) : 1;
    return { kind: 'history', action: history[1] as 'undo' | 'redo', steps: Math.min(10, Math.max(1, steps || 1)) };
  }

  // A whole home ("design a 3BHK apartment", "4 bedroom villa, 2400 sq ft").
  const brief = parseHomeBrief(request.message);
  if (brief) return { kind: 'home', brief };

  // Doors, drawers, walking and views: acting in the room, not editing it.
  const scene = sceneRequest(text, ctx);
  if (scene) return scene;

  // Client package pages, notes, label positions and title block (never the design).
  const pkg = packageRequest(text, request.message.trim());
  if (pkg) return pkg;

  // Drawings, schedules, BOM, readiness and exports are computed by the app.
  const deliverable = deliverableRequest(text);
  if (deliverable) return deliverable;

  // Layout goals ("convert this L into a U…") go to the layout planner before anything else.
  const design = designRequest(text, ctx);
  if (design) return design;

  const protect = protectRequest(text, ctx);
  if (protect) return protect;

  const units = unitsRequest(text);
  if (units) return units;

  if (isQuestion(text)) return inspect(text, ctx);

  const clauses = text.split(/\s*(?:;|\.\s+|,?\s+and then\s+|,?\s+then\s+)\s*/).filter(Boolean);
  const operations: AssistantOperation[] = [];
  const said: string[] = [];
  let lastCreated: number | null = null;
  for (const clause of clauses) {
    const parsed = parseClause(clause, ctx, lastCreated);
    if ('clarify' in parsed) return { kind: 'clarify', question: parsed.clarify, options: [] };
    if ('error' in parsed) return { kind: 'answer', text: parsed.error };
    operations.push(...parsed.ops);
    said.push(parsed.say);
    if (parsed.ops.some((o) => o.op.startsWith('create_'))) lastCreated = operations.length - 1;
  }
  if (!operations.length) return { kind: 'answer', text: `I didn't understand that. ${HELP}` };
  return { kind: 'plan', explanation: said.map((x, i) => (i ? x.charAt(0).toLowerCase() + x.slice(1) : x)).join(' Then '), operations };
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^(please|can you|could you|would you|i'd like you to|i want you to|let's)\s+/g, '')
    .replace(/^(please)\s+/, '')
    .replace(/\s*(please)?[.!?]*$/, '')
    .replace(/\s+/g, ' ');
}

function isQuestion(t: string): boolean {
  if (/^(create|add|insert|put|place|move|shift|slide|nudge|make|set|change|resize|rotate|turn|delete|remove|widen|shrink|paint|swap|replace|use|switch)\b/.test(t)) return false;
  return /^(show|list|what|which|how|tell me|give me|where|describe|summari[sz]e|are there|is there|do i|any)\b/.test(t) || t.endsWith('?');
}

// ── Lengths ────────────────────────────────────────────────────────────────

const LENGTH_RE = /(\d+(?:[.,]\d+)?)(?:\s*(?:'|ft\b|feet\b|foot\b)(?:\s*-?\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*(?:"|''|in\b|inch(?:es)?\b)?)?|\s*(mm\b|millimet(?:er|re)s?\b|cm\b|centimet(?:er|re)s?\b|m\b|met(?:er|re)s?\b|"|in\b|inch(?:es)?\b))?/g;

interface Found {
  value: LengthInput;
  at: number;
  end: number;
  /** As typed. */
  raw: string;
  /** As typed, with the display unit added to a bare number. */
  shown: string;
}

/** Lengths in the text with their positions. Bare numbers use the display unit (inches in ft-in). */
function lengths(t: string, unit: LengthUnit): Found[] {
  const out: Found[] = [];
  for (const m of t.matchAll(LENGTH_RE)) {
    const raw = m[0].trim();
    const shown = raw === m[1] ? `${raw} ${unit === 'ft-in' ? 'in' : unit}` : raw;
    // Skip angles and counts ("90 degrees", "2 shelves").
    const after = t.slice(m.index! + m[0].length).trimStart();
    if (/^(°|deg|degrees?|times|shelves|steps|changes)\b/.test(after) || /^°/.test(after)) continue;
    const hasUnit = raw !== m[1];
    const value: LengthInput = hasUnit ? raw : { value: Number(m[1]!.replace(',', '.')), unit: unit === 'ft-in' ? 'in' : unit };
    if (typeof value === 'string' && !parseLength(value, 'mm').ok) continue;
    out.push({ value, at: m.index!, end: m.index! + m[0].length, raw, shown });
  }
  return out;
}

type Dim = 'width' | 'height' | 'depth';

/** Assigns lengths to width/height/depth from the words around them ("750 mm high", "height 750"). */
function dims(t: string, found: Found[]): Partial<Record<Dim, LengthInput>> & { unassigned: LengthInput[] } {
  const out: Partial<Record<Dim, LengthInput>> & { unassigned: LengthInput[] } = { unassigned: [] };
  const word = (s: string): Dim | null =>
    /^(wide|width|long|length)\b/.test(s) ? 'width' : /^(high|height|tall)\b/.test(s) ? 'height' : /^(deep|depth)\b/.test(s) ? 'depth' : null;
  for (const f of found) {
    const after = t.slice(f.end).trimStart().replace(/^(in |of )/, '');
    const before = t.slice(0, f.at).trimEnd();
    const pre = /(width|height|depth|length|wide|high|tall|deep|long)\s*(?:to|of|=|:|is)?\s*$/.exec(before);
    const d = word(after) ?? (pre ? word(pre[1]!) : null);
    if (d && out[d] === undefined) out[d] = f.value;
    else out.unassigned.push(f.value);
  }
  return out;
}

// ── References ─────────────────────────────────────────────────────────────

const TYPE_WORDS = [
  'base cabinet', 'base unit', 'wall cabinet', 'wall unit', 'upper cabinet', 'tall unit', 'tall cabinet', 'pantry', 'drawer unit', 'drawers', 'drawer', 'sink cabinet', 'sink unit', 'sink',
  'corner unit', 'corner cabinet', 'corner', 'refrigerator', 'fridge', 'dishwasher', 'range cooker', 'cooker', 'range', 'oven', 'hob', 'stove', 'cooker hood', 'hood', 'extractor',
  'entertainment unit', 'cupboard wardrobe', 'chest of drawers', 'dressing table', 'shower cubicle', 'bedside table', 'coffee table', 'centre table', 'center table', 'lounge chair', 'study table', 'double bed', 'single bed', 'nightstand', 'side table', 'tv cabinet', 'tv console', 'media unit', 'book shelf', 'wash basin', 'work desk', 'bookshelf', 'washbasin', 'staircase', 'king bed', 'wardrobe', 'bookcase', 'armchair', 'bath tub', 'almirah', 'tv unit', 'dresser', 'commode', 'bathtub', 'closet', 'toilet', 'vanity', 'shower', 'stairs', 'basin', 'stair', 'desk', 'bed', 'tub', 'wc',
  'island', 'table', 'chair', 'sofa', 'couch', 'door', 'window', 'archway', 'opening', 'cabinets', 'cabinet', 'units', 'unit', 'cupboard', 'appliances', 'appliance', 'furniture',
];

/** The object word that comes first in the text (longest match at that position). */
function firstTypeWord(text: string): string | undefined {
  let best: { word: string; at: number } | undefined;
  for (const w of TYPE_WORDS) {
    const m = new RegExp(`\\b${w}s?\\b`).exec(text);
    if (m && (!best || m.index < best.at || (m.index === best.at && w.length > best.word.length))) best = { word: w, at: m.index };
  }
  return best?.word;
}

function typeOf(word: string): string {
  const w = word.replace(/ (cabinet|unit)s?$/, (m) => (/(base|wall|upper|tall|corner|sink|drawer)/.test(word) ? '' : m)).trim();
  if (w === 'range cooker' || w === 'cooker hood') return w === 'cooker hood' ? 'hood' : 'range';
  if (w === 'units' || w === 'unit' || w === 'cupboard' || w === 'cabinets') return 'cabinet';
  if (w === 'upper') return 'wall';
  if (w === 'appliances') return 'appliance';
  return w;
}

const WALL_WORD = /\b(?:on|along|against|to|of)?\s*the (back|left|right|front) wall\b/;

/** Finds the noun phrase for an object in `phrase` and turns it into a reference. */
function targetIn(phrase: string, ctx: Ctx, lastCreated: number | null): TargetRef | null {
  const p = phrase.trim();
  if (/\b(selected|selection|highlighted)\b/.test(p)) return { ref: 'selected' };
  if (/\b(previous one|the previous|other one|the one before|last one)\b/.test(p)) return { ref: 'previous' };
  // "This" is the current selection; without one, a typed "this base cabinet" is resolved (and asked about) like "the base cabinet".
  if (/^this\b/.test(p)) {
    if (ctx.request.context.selectedId) return { ref: 'selected' };
    const rest = p.replace(/^this\s*/, '');
    if (rest && !/^(one|thing|item)\b/.test(rest)) return targetIn(`the ${rest}`, ctx, lastCreated);
  }
  if (/^(it|that|this|them|those|these|that one|this one|the same one)\b/.test(p) || /\b(that|this) (cabinet|unit|one|appliance|item|thing)\b/.test(p)) {
    return lastCreated !== null ? { created: lastCreated } : { ref: 'it' };
  }
  const windowWall = /\b(window|door) wall\b/.exec(p);
  if (windowWall) return { query: { kind: 'wall', hasOpening: windowWall[1] as 'window' | 'door' } };
  const wallOnly = /^(?:the )?(back|left|right|front) wall\b/.exec(p);
  if (wallOnly) return { id: `wall-${wallOnly[1]}` };

  // "the X next to / beside / left of the Y"
  const rel = /^(.*?)\s*(?:(?:that(?:'s| is)|which is)\s+)?(next to|beside|by|to the (left|right) of|left of|right of)\s+(?:the\s+)?(.+)$/.exec(p);
  if (rel) {
    const inner = targetIn(rel[1]!, ctx, lastCreated);
    const anchor = targetIn(rel[4]!, ctx, lastCreated);
    const side = (rel[3] ?? (rel[2]!.startsWith('left') ? 'left' : rel[2]!.startsWith('right') ? 'right' : undefined)) as 'left' | 'right' | undefined;
    if (anchor) {
      const base = inner && 'query' in inner ? inner.query : { kind: 'any' as const };
      return { query: { ...base, nextTo: anchor, side } };
    }
  }

  const type = firstTypeWord(p);
  if (!type) return null;
  const all = /\b(all|every|each)\b/.test(p) || (new RegExp(`\\b${type}s\\b`).test(p) && !/\bthe\b/.test(p.split(type)[0] ?? '')) || /\bboth\b/.test(p);
  const wall = WALL_WORD.exec(p)?.[1] as WallId | undefined;
  const extreme = /\b(left|leftmost)\b(?! wall)/.test(p.replace(WALL_WORD, '')) ? 'leftmost' : /\b(right|rightmost)\b(?! wall)/.test(p.replace(WALL_WORD, '')) ? 'rightmost' : undefined;
  const nth = /\b(first|second|third|fourth|fifth)\b/.exec(p)?.[1];
  const t = typeOf(type);
  const alias = typeAlias(t);
  if (alias?.freeStanding) return { query: { kind: 'cabinet', freeStanding: true, ...(all ? { all: true } : {}) } };
  return {
    query: {
      ...(alias?.type ? { type: t } : { kind: alias?.category ?? 'any' }),
      ...(wall ? { wall } : {}),
      ...(extreme ? { extreme } : {}),
      ...(nth ? { nth: ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(nth) + 1 } : {}),
      ...(all ? { all: true } : {}),
    },
  };
}

/** The object a clause is about, falling back to the selection, then the conversation's focus. */
function subject(phrase: string, ctx: Ctx, lastCreated: number | null): TargetRef | null {
  const t = targetIn(phrase, ctx, lastCreated);
  if (t) return t;
  if (lastCreated !== null) return { created: lastCreated };
  if (ctx.request.context.selectedId) return { ref: 'selected' };
  if (ctx.request.context.focus.length) return { ref: 'it' };
  return null;
}

// ── Clauses ────────────────────────────────────────────────────────────────

type Parsed = { ops: AssistantOperation[]; say: string } | { clarify: string } | { error: string };

const DIRECTION: [RegExp, Direction][] = [
  [/\btowards? the left wall\b/, 'towards_left_wall'],
  [/\btowards? the right wall\b/, 'towards_right_wall'],
  [/\btowards? the back wall\b/, 'towards_back_wall'],
  [/\btowards? the front wall\b/, 'towards_front_wall'],
  [/\b(to the )?left\b/, 'left'],
  [/\b(to the )?right\b/, 'right'],
  [/\b(up|upwards|higher)\b/, 'up'],
  [/\b(down|downwards|lower)\b/, 'down'],
  [/\b(forward|forwards|out|away from the wall|towards me)\b/, 'forward'],
  [/\b(back|backward|backwards|towards the wall)\b/, 'backward'],
];

function parseClause(t: string, ctx: Ctx, lastCreated: number | null): Parsed {
  const found = lengths(t, ctx.unit);

  // Room size: "change the room width to 12 feet", "make the room 4 m by 3.5 m", "ceiling height 2.7 m".
  const roomEdit = /\b(room|ceiling|kitchen size)\b/.test(t) && found.length > 0 && !/\b(add|create|move|put|place)\b/.test(t);
  // "Create a kitchen that is 12 ft by 10 ft" in an open project sizes its room.
  const roomCreate = /^(create|make|set up|start|build|design)\b.*\b(kitchen|room)\b/.test(t) && /\d.*\b(by|x|×)\b.*\d/.test(t);
  if (roomEdit || roomCreate) {
    const by = /(\d+(?:\.\d+)?)\s*(\S+)?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(\S+)?/.exec(t);
    if (by && (/\broom\b/.test(t) || roomCreate)) {
      const unitWord = by[4] ?? by[2] ?? '';
      const a = by[2] && /^[a-z'"]+$/.test(by[2]) ? `${by[1]} ${by[2]}` : `${by[1]} ${unitWord}`;
      const b = `${by[3]} ${unitWord}`;
      return { ops: [{ op: 'set_room', width: a.trim(), length: b.trim() }], say: `Set the room to ${a.trim()} × ${b.trim()}.` };
    }
    const v = found[0]!.value;
    const field = /\b(ceiling|height|high|tall)\b/.test(t) ? 'height' : /\b(length|long|deep|depth)\b/.test(t) ? 'length' : /\bwall thickness\b/.test(t) ? 'wallThickness' : 'width';
    return { ops: [{ op: 'set_room', [field]: v } as AssistantOperation], say: `Set the room ${field === 'height' ? 'ceiling height' : field} to ${found[0]!.shown}.` };
  }

  // Create.
  const create = /^(?:create|add|insert|place|put|install|i need|i want|give me|new)\b\s*(.*)$/.exec(t);
  if (create) return parseCreate(create[1]!, ctx, lastCreated);

  // Delete.
  const del = /^(?:delete|remove|get rid of|take out|erase)\s+(.*)$/.exec(t);
  if (del) {
    const target = subject(del[1]!, ctx, lastCreated);
    if (!target) return { clarify: 'What should I delete? Select it or name it, e.g. “delete the dishwasher”.' };
    return { ops: [{ op: 'delete', target }], say: `Delete ${phraseOf(del[1]!)}.` };
  }

  // Rotate.
  const rot = /^(?:rotate|turn|spin)\s+(.*?)(?:\s+(?:by\s+)?(-?\d+)\s*(?:°|deg(?:rees)?)?)?(?:\s+(clockwise|anti-?clockwise|counter-?clockwise))?$/.exec(t);
  if (rot) {
    const target = subject(rot[1] ?? '', ctx, lastCreated);
    if (!target) return { clarify: 'What should I rotate?' };
    let deg = rot[2] ? Number(rot[2]) : 90;
    if (rot[3] === 'clockwise') deg = -deg;
    const norm = ((deg % 360) + 360) % 360;
    if (![90, 180, 270].includes(norm)) return { error: 'Units can only turn in quarter turns: 90, 180 or 270 degrees.' };
    return { ops: [{ op: 'rotate', target, degrees: norm as 90 | 180 | 270 }], say: `Rotate ${phraseOf(rot[1] ?? 'it')} by ${norm}°.` };
  }

  // Move.
  const move = /^(?:move|shift|slide|nudge|push|pull|bring|relocate)\s+(.*)$/.exec(t);
  if (move) return parseMove(move[1]!, found, ctx, lastCreated);

  // Surface finishes: "change the worktop to black granite", "paint the walls sage", "floor terrazzo".
  const surface = /\b(worktops?|countertops?|counters?|floor|walls|wall paint|carcass)\b/.exec(t);
  if (surface && !found.length && /\b(to|in|with|as|paint|make|change|use|set)\b|^(worktop|floor|walls|carcass)\b/.test(t) && !/\b(cabinet|unit|fridge|sink)\b/.test(t)) {
    const s = surface[1]!.startsWith('worktop') || surface[1]!.startsWith('counter') ? 'countertop' : surface[1] === 'floor' ? 'floor' : surface[1] === 'carcass' ? 'carcass' : 'wall';
    const name = finishWords(t, ctx.project, s);
    if (!name) return { clarify: `Which ${s === 'countertop' ? 'worktop' : s} finish? ${options(ctx.project, s)}` };
    return { ops: [{ op: 'set_surface_finish', surface: s, finish: name }], say: `Change the ${s === 'countertop' ? 'worktop' : s} finish to ${name}.` };
  }

  // Door styles.
  const style = /\b(glass|open|solid)\s*(fronts?|doors?|shelving|style)?\b/.exec(t);
  if (style && /^(make|set|change|use|give)\b/.test(t) && (style[2] || /\bto (glass|open|solid)\b/.test(t))) {
    const target = subject(t.replace(/^(make|set|change|use|give)\s+/, '').replace(/\s*(to\s+)?(glass|open|solid).*$/, ''), ctx, lastCreated);
    if (!target) return { clarify: 'Which cabinet should get the new fronts?' };
    return { ops: [{ op: 'set_front_style', target, style: style[1] as 'glass' | 'open' | 'solid' }], say: `Give ${phraseOf(t)} ${style[1]} fronts.` };
  }

  // Shutter finishes on objects: "make the base cabinets oak", "change the finish of it to walnut".
  const shutter = finishWords(t, ctx.project, 'shutter');
  if (shutter && !found.length && /^(make|change|set|paint|use|switch|give|apply|finish)\b/.test(t)) {
    const phrase = t.replace(/^(make|change|set|paint|use|switch|give|apply)\s+(the\s+)?(finish|colou?r|fronts?|shutters?)?\s*(of\s+)?/, '').replace(new RegExp(`\\s*(to|in|with|as)?\\s*${escape(shutter.toLowerCase())}.*$`), '');
    const target = subject(phrase, ctx, lastCreated);
    if (!target) return { clarify: 'Which units should get the new finish?' };
    return { ops: [{ op: 'set_finish', target, finish: shutter }], say: `Change the finish of ${phraseOf(phrase || 'it')} to ${shutter}.` };
  }

  // Resize: "make it 750 mm high", "change all base cabinets to 750 mm height", "make the back wall 4 m".
  const resize = /^(?:make|set|change|resize|increase|reduce|widen|shrink|extend|raise|adjust)\s+(.*)$/.exec(t);
  if (resize || /\b(wider|narrower|taller|shorter|deeper|shallower)\b/.test(t)) {
    const body = resize?.[1] ?? t;
    const relative = /\b(\d.*)\s*(wider|narrower|taller|shorter|higher|lower|deeper|shallower)\b/.exec(body) ?? /\b(wider|narrower|taller|shorter|deeper|shallower) by\b/.exec(body);
    if (relative && found.length) {
      const word = (/(wider|narrower|taller|shorter|higher|lower|deeper|shallower)/.exec(body)![1])!;
      const dim: Dim = /wider|narrower/.test(word) ? 'width' : /deeper|shallower/.test(word) ? 'depth' : 'height';
      const sign = /narrower|shorter|lower|shallower/.test(word) ? -1 : 1;
      const v = found[0]!.value;
      const delta: LengthInput = sign > 0 ? v : typeof v === 'string' ? `-${v}` : typeof v === 'number' ? -v : { ...v, value: -v.value };
      const phrase = body.slice(0, body.indexOf(found[0]!.raw)).replace(/\b(the )?(width|height|depth) of\b/, '');
      const target = subject(phrase, ctx, lastCreated);
      if (!target) return { clarify: `What should I make ${word}? Select it or name it.` };
      return { ops: [{ op: 'resize_by', target, [dim]: delta } as AssistantOperation], say: `Make ${phraseOf(phrase || 'it')} ${found[0]!.shown} ${word}.` };
    }
    if (!found.length) {
      // Never invent a size: ask for it.
      const comparative = /\b(wider|narrower|taller|shorter|higher|lower|deeper|shallower|bigger|smaller|longer)\b/.exec(body)?.[1];
      return { clarify: comparative ? `How much ${comparative}? For example “100 mm ${comparative}”.` : 'What size should it be? For example “make it 750 mm high” or “900 mm wide”.' };
    }
    const inBody = lengths(body, ctx.unit);
    const d = dims(body, inBody);
    if (d.width === undefined && d.height === undefined && d.depth === undefined) d.width = d.unassigned[0];
    const cut = Math.min(...found.map((f) => body.indexOf(f.raw)).filter((i) => i >= 0), ...[/\b(to|width|height|depth|length)\b/.exec(body)?.index ?? Infinity]);
    const phrase = body.slice(0, cut).replace(/\b(the )?(width|height|depth|length|size) of\b/, '').replace(/\b(width|height|depth|length|size)\b/, '').trim();
    const target = subject(phrase, ctx, lastCreated);
    if (!target) return { clarify: 'Which object should I resize? Select it or name it.' };
    const parts = (['width', 'height', 'depth'] as const).filter((k) => d[k] !== undefined).map((k) => `${k} ${(inBody.find((f) => f.value === d[k]) ?? inBody[0]!).shown}`);
    return { ops: [{ op: 'resize', target, width: d.width, height: d.height, depth: d.depth }], say: `Set ${phraseOf(phrase || 'it')} to ${parts.join(', ')}.` };
  }

  return { error: `I didn't understand “${t}”. ${HELP}` };
}

function parseCreate(rest: string, ctx: Ctx, lastCreated: number | null): Parsed {
  const r = rest.replace(/^(a|an|one|another|the|new)\s+/, '');
  const kindWord = firstTypeWord(r);
  if (!kindWord) return { clarify: 'What should I add? A base, wall, tall, drawer, sink or corner cabinet; a fridge, dishwasher, range or hood; a table, chair or sofa; or a door or window.' };
  const type = typeOf(kindWord);
  const tail = r.slice(r.indexOf(kindWord) + kindWord.length);
  const inR = lengths(r, ctx.unit);
  const d = dims(r, inR);
  const width = d.width ?? d.unassigned[0];

  // Placement.
  let placement: PlacementInput | undefined;
  let where: string;
  const overlap = /\b(?:that |which )?(?:overlaps?|over|in front of|blocking|blocks|at|in) (?:the )?(door|window|opening|archway)\b/.exec(tail);
  const rel = /\b(next to|beside|by|to the (left|right) of|left of|right of)\s+(?:the\s+)?(.+?)(?=\s+(?:on|along|at)\s+the\b|$)/.exec(tail);
  const wall = WALL_WORD.exec(tail)?.[1] as WallId | undefined;
  const at = /\bat\s+(.+?)\s+(?:along|from the start of)\b/.exec(tail);
  if (overlap) {
    const ref = resolveTarget(ctx.project, { query: { type: overlap[1]! } }, emptyResolve(ctx), 'x', false);
    if (!ref.ok) return ref.kind === 'ambiguous' ? { clarify: `Which ${overlap[1]}? ${ref.candidates.map((c) => c.label).join('; ')}.` } : { error: ref.message };
    const o = ref.entities[0]!;
    placement = { wall: o.wallId!, offset: o.span!.start };
    where = ` at the ${o.label.toLowerCase()}`;
  } else if (rel) {
    const anchor = targetIn(rel[3]!, ctx, lastCreated);
    if (!anchor) return { clarify: `Next to what? I couldn't find “${rel[3]}”.` };
    const side = (rel[2] ?? (rel[1]!.startsWith('left') ? 'left' : rel[1]!.startsWith('right') ? 'right' : 'auto')) as 'left' | 'right' | 'auto';
    placement = { nextTo: anchor, side };
    where = ` ${rel[1]} the ${rel[3]}`;
  } else if (wall) {
    const offset = at ? lengths(at[1]!, ctx.unit)[0]?.value : undefined;
    placement = offset !== undefined ? { wall, offset } : { wall };
    where = ` on the ${wall} wall${at ? ` at ${at[1]}` : ''}`;
  } else if (ctx.request.context.selectedId && findEntity(ctx.project, ctx.request.context.selectedId)?.element?.wallId && typeAlias(type)?.category !== 'furniture' && !['door', 'window', 'opening', 'archway'].includes(type)) {
    // Beside the selected unit if there is room, otherwise the first free spot.
    placement = { near: { ref: 'selected' } };
    where = ` beside the selected ${findEntity(ctx.project, ctx.request.context.selectedId)!.label} (or the first free spot if there's no room)`;
  } else where = ' in the first free spot';

  const size = width !== undefined ? `${(inR.find((f) => f.value === width) ?? inR[0])?.shown ?? ''} ` : '';
  const alias = typeAlias(type);
  if (alias?.category === 'opening') {
    const kind = type === 'archway' ? 'opening' : (type as 'door' | 'window' | 'opening');
    const op: AssistantOperation = { op: 'create_opening', kind, width, height: d.height, ...(placement && 'wall' in placement ? { wall: placement.wall, offset: placement.offset } : {}) };
    return { ops: [op], say: `Add a ${size}${kind}${where}.` };
  }
  if (alias?.category === 'furniture') {
    const furnitureType = (type === 'couch' ? 'sofa' : (alias.type ?? type)) as FurnitureType;
    return { ops: [{ op: 'create_furniture', furnitureType, width, height: d.height, depth: d.depth }], say: `Add a ${size}${furnitureType}.` };
  }
  if (alias?.category === 'appliance' || type === 'appliance') {
    if (!alias?.type) return { clarify: 'Which appliance: a fridge, dishwasher, range or hood?' };
    const applianceType = alias.type as 'fridge' | 'range' | 'dishwasher' | 'hood';
    return { ops: [{ op: 'create_appliance', applianceType, width, placement }], say: `Add a ${size}${kindWord}${where}.` };
  }
  const cabinetType = (alias?.type ?? 'base') as 'base' | 'wall' | 'tall' | 'drawer' | 'sink' | 'corner';
  const finish = finishWords(tail, ctx.project, 'shutter') ?? undefined;
  return {
    ops: [{ op: 'create_cabinet', cabinetType, width, height: d.height, depth: d.depth, finish, placement }],
    say: `Add a ${size}${cabinetType === 'wall' ? 'wall' : cabinetType} cabinet${where}.`,
  };
}

function parseMove(rest: string, found: Found[], ctx: Ctx, lastCreated: number | null): Parsed {
  // "move X next to / beside the Y"
  const rel = /^(.*?)\s*(next to|beside|to the (left|right) of)\s+(?:the\s+)?(.+)$/.exec(rest);
  if (rel && !found.length) {
    const target = subject(rel[1]!, ctx, lastCreated);
    const anchor = targetIn(rel[4]!, ctx, lastCreated);
    if (!target) return { clarify: 'What should I move?' };
    if (!anchor) return { clarify: `Next to what? I couldn't find “${rel[4]}”.` };
    return { ops: [{ op: 'move_to', target, placement: { nextTo: anchor, side: (rel[3] as 'left' | 'right' | undefined) ?? 'auto' } }], say: `Move ${phraseOf(rel[1] || 'it')} ${rel[2]} the ${rel[4]}.` };
  }
  // "move X to the left wall [at 600]"
  const toWall = /^(.*?)\s*(?:to|onto) the (back|left|right|front) wall\b(.*)$/.exec(rest);
  if (toWall && !/\btowards\b/.test(rest)) {
    const target = subject(toWall[1]!, ctx, lastCreated);
    if (!target) return { clarify: 'What should I move?' };
    const offset = lengths(toWall[3]!, ctx.unit)[0]?.value;
    return { ops: [{ op: 'move_to', target, placement: { wall: toWall[2] as WallId, offset } }], say: `Move ${phraseOf(toWall[1] || 'it')} to the ${toWall[2]} wall${offset !== undefined ? ` at ${lengths(toWall[3]!, ctx.unit)[0]!.shown}` : ''}.` };
  }
  // "move X to 1200 [mm] along the wall" / "move X to 1200 from the start of the wall"
  const toOffset = /^(.*?)\s*to\s+(.+?)\s+(?:along|from the start of)\s+(?:the\s+)?(?:(back|left|right|front)\s+)?wall\b/.exec(rest);
  if (toOffset) {
    const target = subject(toOffset[1]!, ctx, lastCreated);
    if (!target) return { clarify: 'What should I move?' };
    const offset = lengths(toOffset[2]!, ctx.unit)[0];
    if (!offset) return { error: 'Give the distance from the start of the wall, e.g. “move it to 1200 mm along the wall”.' };
    let wall = toOffset[3] as WallId | undefined;
    if (!wall) {
      const r = resolveTarget(ctx.project, target, emptyResolve(ctx), 'x', false);
      wall = r.ok ? r.entities[0]!.wallId : undefined;
      if (!wall) return { clarify: 'Which wall should it go on?' };
    }
    return { ops: [{ op: 'move_to', target, placement: { wall, offset: offset.value } }], say: `Move ${phraseOf(toOffset[1] || 'it')} to ${offset.shown} along the ${wall} wall.` };
  }
  // "move X 300 mm to the right"
  if (!found.length) return { error: 'How far, and which way? e.g. “move it 300 mm to the right”.' };
  const dist = found[0]!;
  const phrase = rest.slice(0, rest.indexOf(dist.raw)).replace(/\b(by)\s*$/, '').trim();
  const after = rest.slice(rest.indexOf(dist.raw) + dist.raw.length);
  const dir = DIRECTION.find(([re]) => re.test(after))?.[1] ?? DIRECTION.find(([re]) => re.test(phrase))?.[1];
  if (!dir) return { clarify: 'Which way: left, right, up, down, forward or back?' };
  const target = subject(phrase.replace(/\b(left|right|up|down)\b/, ''), ctx, lastCreated);
  if (!target) return { clarify: 'What should I move? Select it or name it.' };
  return { ops: [{ op: 'move_by', target, distance: dist.value, direction: dir }], say: `Move ${phraseOf(phrase || 'it')} ${dist.shown} ${dir.replace(/_/g, ' ')}.` };
}

// ── Other requests ─────────────────────────────────────────────────────────

function unitsRequest(t: string): AssistantResponse | null {
  if (/\d/.test(t) || !/\b(units?|measurements?|dimensions|lengths|sizes|metric|imperial|switch to|show (everything|it all|lengths|sizes) in)\b/.test(t)) return null;
  if (!/^(change|switch|use|show|set|display|convert|give me|put)\b/.test(t)) return null;
  const unit: LengthUnit | null = /feet (and|&) inch|ft-in|imperial|feet\/inch/.test(t)
    ? 'ft-in'
    : /millimet|\bmm\b|metric/.test(t)
      ? 'mm'
      : /centimet|\bcm\b/.test(t)
        ? 'cm'
        : /\binch|\bin\b/.test(t)
          ? 'in'
          : /\bfeet\b|\bft\b|\bfoot\b/.test(t)
            ? 'ft'
            : /\bmet(er|re)s?\b|\bm\b/.test(t)
              ? 'm'
              : null;
  if (!unit && !/\b(units?|measurements?)\b/.test(t)) return null;
  if (!unit) return { kind: 'clarify', question: `Which units? ${LENGTH_UNITS.map((u) => UNIT_LABEL[u]).join(', ')}.`, options: LENGTH_UNITS.map((u) => `Show lengths in ${UNIT_LABEL[u].toLowerCase()}`) };
  return { kind: 'plan', explanation: `Show all lengths in ${UNIT_LABEL[unit].toLowerCase()}. The design itself is unchanged; it is still stored in millimetres.`, operations: [{ op: 'set_units', unit }] };
}

function protectRequest(t: string, ctx: Ctx): AssistantResponse | null {
  const m = /\b(?:keep|leave|don't (?:touch|change|move)|do not (?:touch|change|move)|preserve|lock)\s+(?:the\s+)?(.+?)(?:\s+(?:unchanged|as it is|as is|alone|fixed|the same|untouched|exactly as it is))?(?:\s+(?:while|when|and)\b.*)?$/.exec(t);
  if (!m || !/\b(keep|leave|don't|do not|preserve|lock)\b/.test(t) || !/(unchanged|as it is|as is|alone|fixed|the same|untouched|don't|do not|preserve|lock)/.test(t)) return null;
  const phrase = m[1]!;
  const walls: WallId[] = [];
  const opening = /\b(window|door) wall\b/.exec(phrase);
  if (opening) {
    const kind = opening[1] as 'window' | 'door';
    const ws = WALLS.filter((w) => ctx.project.openings.some((o) => o.wallId === w && o.kind === kind));
    if (!ws.length) return { kind: 'answer', text: `There is no ${kind} in this project, so I can't tell which wall you mean. Which wall should I keep unchanged?` };
    if (ws.length > 1) return { kind: 'clarify', question: `There are ${kind}s on the ${ws.join(' and ')} walls. Which one should I keep unchanged?`, options: ws.map((w) => `Keep the ${w} wall unchanged`) };
    walls.push(...ws);
  }
  for (const w of WALLS) if (new RegExp(`\\b${w} wall\\b`).test(phrase)) walls.push(w);
  if (walls.length) {
    const list = [...new Set(walls)];
    return { kind: 'answer', text: `OK. I'll keep the ${list.join(' and ')} wall${list.length > 1 ? 's' : ''} unchanged: any change that would move, resize, add or remove something there will be refused. Say “unlock” to release ${list.length > 1 ? 'them' : 'it'}.`, protect: { walls: list, targets: [] } };
  }
  const target = targetIn(phrase, ctx, null);
  if (!target) return null;
  return { kind: 'answer', text: `OK. I'll keep ${phraseOf(phrase)} unchanged in the changes I propose.`, protect: { walls: [], targets: [target] } };
}

function inspect(t: string, ctx: Ctx): AssistantResponse {
  const p = ctx.project;
  const show: Show = /\bissues?|problems?|warnings?|errors?|checks?|clash|wrong\b/.test(t)
    ? 'issues'
    : /\bselect(ed|ion)?\b/.test(t)
      ? 'selection'
      : /\b(doors?|windows?|openings?)\b/.test(t)
        ? 'openings'
        : /\bwalls?\b/.test(t) && !/\bwall cabinets?\b/.test(t)
          ? 'walls'
          : /\b(room|kitchen size|how big)\b/.test(t)
            ? 'room'
            : /\bappliances?\b/.test(t)
              ? 'appliances'
              : /\bfurniture|table|chairs?|sofa\b/.test(t)
                ? 'furniture'
                : /\b(cabinets?|units?|cupboards?)\b/.test(t)
                  ? 'cabinets'
                  : 'elements';
  const count = { cabinets: p.cabinets.length, appliances: p.appliances.length, furniture: p.furniture.length, openings: p.openings.length, elements: p.cabinets.length + p.appliances.length + p.furniture.length } as Record<string, number>;
  const text =
    show === 'room'
      ? 'Here is the room size.'
      : show === 'walls'
        ? 'Here are the walls with their lengths and openings.'
        : show === 'issues'
          ? 'Here are the current problems and design warnings.'
          : show === 'selection'
            ? ctx.request.context.selectedId ? 'Here is the selected object.' : 'Nothing is selected.'
            : count[show] === 0
              ? `There are no ${show} in this project.`
              : `There ${count[show] === 1 ? 'is 1' : `are ${count[show]}`} ${show === 'elements' ? 'objects' : count[show] === 1 ? show.replace(/s$/, '') : show}. Here are their dimensions:`;
  return { kind: 'answer', text, show };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyResolve(ctx: Ctx) {
  return { selectedId: ctx.request.context.selectedId, focus: ctx.request.context.focus, previousFocus: ctx.request.context.previousFocus, created: new Map(), bindings: {} };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A finish named in the text: the material whose distinctive word appears ("oak", "black granite"). */
function finishWords(t: string, project: KitchenProject, category: string): string | null {
  const options = Object.values(project.materials).filter((m) => m.category === category);
  const full = options.find((m) => t.includes(m.name.toLowerCase()));
  if (full) return full.name;
  const generic = new Set(['white', 'grey', 'natural', 'carcass', 'tile', 'planks', 'block', 'butcher', 'warm', 'deep', 'matte', 'green']);
  const hits = options.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => !generic.has(w) && new RegExp(`\\b${escape(w)}\\b`).test(t)));
  if (hits.length === 1) return hits[0]!.name;
  const loose = options.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => new RegExp(`\\b${escape(w)}\\b`).test(t)));
  return loose.length === 1 ? loose[0]!.name : null;
}

function options(project: KitchenProject, category: string): string {
  return `Options: ${Object.values(project.materials).filter((m) => m.category === category).map((m) => m.name).join(', ')}.`;
}

function phraseOf(s: string): string {
  const p = s.trim().replace(/^(the|a|an)\s+/, '');
  if (!p || /^(it|that|this|them|that one|this one)$/.test(p)) return 'it';
  if (/^(all|every|each|both)\b/.test(p)) return p.replace(/^(all|every|each|both)\s+(the\s+)?/, '$1 the ');
  return `the ${p}`;
}

// ── Layout goals ────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };

/**
 * Whole-layout requests: change topology, optimise, fix problems, new layouts for a room size, and
 * refinements of the last options. Returns null for ordinary single edits.
 */
function designRequest(t: string, ctx: Ctx): AssistantResponse | null {
  // The target is the shape after "into"/"to" ("convert this L into a U"), otherwise the last one named.
  const shapes = [...t.matchAll(/\b(?:(into|to|as)\s+(?:an?\s+)?)?(u[- ]?shaped?|l[- ]?shaped?|galley|single[- ]wall|straight|one[- ]wall)\b/g)];
  const topologyWord = (shapes.find((m) => m[1]) ?? shapes.at(-1))?.[2];
  const topology = topologyWord ? (/^u/.test(topologyWord) ? 'u-shaped' : /^l/.test(topologyWord) ? 'l-shaped' : topologyWord === 'galley' ? 'galley' : 'straight') : undefined;
  const another = /\b(another|more|other|different|new) (option|layout|alternative|design)s?\b/.test(t);
  const option = /\b(?:prefer|like|take|want|use)\s+(?:the\s+)?(?:option|layout|alternative)\s+(\w+)/.exec(t)?.[1];
  const previous = /\b(previous|last|that) (layout|option|design)\b/.test(t);
  const isDesign =
    (topology && /\b(convert|turn|change|make|redesign|transform|switch|create|design|give me|plan|into|to an?)\b/.test(t) && /\b(kitchen|layout)\b/.test(t)) ||
    /\b(redesign|re-design|optimi[sz]e|maximi[sz]e|rearrange|reorgani[sz]e|refactor)\b/.test(t) ||
    /\b(alternative|options?|layouts?)\b/.test(t) && /\b(give|show|suggest|generate|propose|find|create|design)\b/.test(t) ||
    /\bfind and fix|fix (all|any|the) (cabinet )?(collisions?|clashes|overlaps|clearance)/.test(t) ||
    /\bkitchen layout (suitable )?for\b/.test(t) ||
    /\b(move|bring|put) (the )?\w+ closer to the (entrance|door)\b/.test(t) ||
    /\badd more storage\b/.test(t) ||
    another ||
    !!option ||
    (previous && /\bonly\b/.test(t)) ||
    /\bonly (modify|change|touch|edit|update) (the )?(upper|wall|base|lower|floor) (cabinets|units)\b/.test(t) ||
    /\bprefer(ring)? the (lowest[- ]cost|cheapest)\b/.test(t) ||
    /\b(reposition|move) the island\b(?!.*\d)/.test(t);
  if (!isDesign) return null;

  const o: DesignObjectiveInput = { goal: t.slice(0, 300) };
  if (topology) o.topology = topology;
  const priorities: Priority[] = [];
  const at = (re: RegExp) => re.exec(t)?.index ?? Infinity;
  const pri: [Priority, number][] = [
    ['storage', at(/\b(storage|cupboard space)\b/)],
    ['counter', at(/\b(counter ?top|countertop|worktop|work surface|prep(aration)? space)\b/)],
    ['workflow', at(/\b(workflow|work triangle|flow)\b/)],
    ['budget', at(/\b(budget|cost|cheap|cheapest|lowest[- ]cost|price)\b/)],
    ['accessibility', at(/\b(accessib\w*|wheelchair|walkway|circulation)\b/)],
  ];
  for (const [p, i] of pri.sort((a, b) => a[1] - b[1])) if (i !== Infinity) priorities.push(p);
  if (priorities.length) o.priorities = priorities;
  if (/\b(keep|preserve|leave)\b[^.]*\bsink\b[^.]*\b(wall|where it is|in place)\b|\bsink on (its|the existing|the same|the current)\b/.test(t)) o.keepSinkWall = true;
  const keepWhat = [...t.matchAll(/\b(?:keep|preserve|leave)\s+(?:the\s+)?(refrigerator|fridge|range|cooker|hob|oven|dishwasher|hood|sink|island|tall unit)\s+(?:in place|where it is|unchanged|fixed|as it is|exactly where it is)\b/g)].map((m) => m[1]!);
  if (keepWhat.length) o.preserve = keepWhat.map((w) => ({ query: { type: w } }));
  if (/\b(preserv\w*|keep\w*)\s+(all\s+)?(the\s+)?(existing\s+)?appliances\b|\bappliances in (their )?(current )?(place|positions?)\b/.test(t)) o.preserveAppliances = true;
  const walls = [...t.matchAll(/\b(?:keep|preserve|don't (?:touch|change)|do not (?:touch|change))\s+(?:the\s+)?(back|left|right|front) wall\b/g)].map((m) => m[1] as WallId);
  if (/\b(keep|preserve)\s+the\s+window wall\b/.test(t)) walls.push(...WALLS.filter((w) => ctx.project.openings.some((x) => x.kind === 'window' && x.wallId === w)));
  if (walls.length) o.preserveWalls = [...new Set(walls)];
  if (/\bonly (modify|change|touch|edit|update) (the )?(upper|wall) (cabinets|units)\b|\bchange only the upper\b/.test(t)) o.scope = 'upper-only';
  else if (/\bonly (modify|change|touch|edit|update) (the )?(base|lower|floor) (cabinets|units)\b/.test(t)) o.scope = 'base-only';
  const walk = /\b(?:at least|minimum(?: of)?|keep)\s+([\d.]+\s*(?:mm|cm|m|in|ft|'|")?)\s*(?:of\s+)?(?:walking |walkway |clear )?(?:clearance|walkway|walking space|aisle)/.exec(t);
  if (walk) o.minWalkway = /[a-z'"]$/.test(walk[1]!.trim()) ? walk[1]!.trim() : { value: Number(walk[1]), unit: ctx.unit === 'ft-in' ? 'in' : ctx.unit };
  if (/\b(clearances?|walkways?) as (preferences|warnings|soft)\b|\bignore (the )?clearances\b/.test(t)) o.clearances = 'soft';
  if (/\bfind and fix|\bfix (all|any|the) (cabinet )?(collisions?|clashes|overlaps|clearance)/.test(t)) o.fixIssues = true;
  if (/\b(reposition|move) the island\b/.test(t)) o.repositionIsland = true;
  const closer = /\b(?:move|bring|put) (?:the )?(\w+) closer to the (entrance|door|sink|range|hob|cooker|fridge|refrigerator)\b/.exec(t);
  if (closer) {
    const to = closer[2] === 'door' ? 'entrance' : closer[2] === 'hob' || closer[2] === 'cooker' ? 'range' : closer[2] === 'refrigerator' ? 'fridge' : (closer[2] as 'entrance' | 'sink' | 'range' | 'fridge');
    o.moveNear = { target: { query: { type: closer[1]! } }, to };
  }
  const n = /\b(one|two|three|four|five|\d)\s+(alternative|option|layout|design)s?\b/.exec(t)?.[1];
  if (n && NUMBER_WORDS[n] && !option) o.alternatives = Math.min(5, NUMBER_WORDS[n]!);
  const room = /\bfor (?:a|an|the)?\s*([\d.]+\s*(?:mm|cm|m|ft|feet|foot|in|')?)\s*(?:by|x|×)\s*([\d.]+\s*(?:mm|cm|m|ft|feet|foot|in|')?)\s*(mm|cm|m|ft|feet|foot|in)?\s*room\b/.exec(t);
  if (room) {
    const unit = room[3] ?? (/[a-z']/.test(room[2]!) ? room[2]!.replace(/[\d.\s]/g, '') : '');
    const len = (v: string) => (/[a-z']/.test(v) ? v.trim() : `${v.trim()} ${unit || (ctx.unit === 'ft-in' ? 'in' : ctx.unit)}`);
    o.roomSize = { width: len(room[1]!), length: len(room[2]!) };
  }
  const parsed = DesignObjectiveSchema.safeParse(o);
  if (!parsed.success) return { kind: 'answer', text: `I couldn't read that layout goal: ${parsed.error.issues[0]?.message ?? 'invalid'}.` };
  const refine = option ? { option: NUMBER_WORDS[option] } : another || previous ? { another: another || undefined } : undefined;
  if (option && !NUMBER_WORDS[option]) return { kind: 'clarify', question: 'Which option number do you mean?', options: ['Option 1', 'Option 2', 'Option 3'] };
  return { kind: 'design', explanation: explainObjective(parsed.data, refine), objective: parsed.data, ...(refine ? { refine } : {}) };
}

const TOPOLOGY_NAME: Record<string, string> = { straight: 'single-wall', 'l-shaped': 'L-shaped', 'u-shaped': 'U-shaped', galley: 'galley', keep: 'as it is' };

function explainObjective(o: ReturnType<typeof DesignObjectiveSchema.parse>, refine?: { option?: number; another?: boolean }): string {
  const parts: string[] = [];
  if (refine?.option) parts.push(`Starting from option ${refine.option}`);
  else if (refine?.another) parts.push('New options, different from the ones shown');
  parts.push(o.roomSize ? 'New layouts for the room size you gave' : o.topology !== 'keep' ? `Layouts that make the kitchen ${TOPOLOGY_NAME[o.topology]}` : o.fixIssues ? 'Fixes for collisions and clearance problems' : o.moveNear ? 'Layouts that move it closer' : 'Improvements to the current layout');
  const keep: string[] = [];
  if (o.keepSinkWall) keep.push('the sink on its wall');
  if (o.preserve.length) keep.push(o.preserve.map((p) => ('query' in p ? `the ${p.query.type}` : 'the chosen object')).join(', ') + ' in place');
  if (o.preserveAppliances) keep.push('every appliance in place');
  if (o.preserveWalls.length) keep.push(`the ${o.preserveWalls.join(' and ')} wall unchanged`);
  if (keep.length) parts.push(`keeping ${keep.join(', ')}`);
  if (o.scope !== 'all') parts.push(o.scope === 'upper-only' ? 'changing only upper units' : 'changing only base units');
  if (o.priorities.length) parts.push(`ranked by ${o.priorities.join(', then ')}`);
  return `${parts.join(', ')}.`;
}

// ── Client package ─────────────────────────────────────────────────────────

/** The pages a sentence names ("elevation B", "the layout", "every page"); undefined = the open page. */
function pageRefIn(t: string): string | undefined {
  const letter = /\belevation ([a-h])\b/.exec(t);
  if (letter) return letter[1];
  const wall = /\b(back|left|right|front) wall elevation\b/.exec(t);
  if (wall) return `${wall[1]} wall`;
  if (/\b(every|all) pages?\b|\beach page\b/.test(t)) return 'all';
  if (/\b(stale|outdated|out of date) pages?\b/.test(t)) return 'stale';
  const n = /\bpage (\d+)\b/.exec(t);
  if (n) return n[1];
  if (/\b(kitchen layout|layout|floor plan)\b/.test(t)) return 'layout';
  if (/\b(hardware|accessories|reference images?)\b/.test(t)) return 'hardware';
  if (/\b3d view\b/.test(t)) return '3d';
  if (/\bschedule\b/.test(t)) return 'schedule';
  return undefined;
}

const INFO_FIELD: Record<string, Extract<PackageOp, { op: 'set_info' }>['field']> = {
  client: 'client',
  'client name': 'client',
  address: 'address',
  'site address': 'address',
  date: 'date',
  'drawn by': 'drawnBy',
  'approved by': 'approvedBy',
  'reference by': 'referenceBy',
  studio: 'studio',
  'studio name': 'studio',
  'studio address': 'studioAddress',
  project: 'projectTitle',
  'project title': 'projectTitle',
  'project name': 'projectTitle',
};

/** "add a note that…", "change this page to landscape", "move the 900 mm dimension away…", "which pages are outdated?" */
function packageRequest(t: string, raw: string): AssistantResponse | null {
  const pkg = (ops: PackageOp[], page?: string): AssistantResponse => ({ kind: 'package', request: { ...(page ? { page } : {}), ops } });
  if (/\b(which|what) pages?\b.*\b(outdated|out of date|stale|need(s)? (updating|regenerat\w*))\b|\b(outdated|stale) pages\b\??$/.test(t) && !/\bregenerate\b/.test(t)) return pkg([{ op: 'status' }]);
  if (/\badd (?:the |all )?(?:standard |default )?3d views?\b|\badd (?:a )?3d (?:page|view) for (?:each|every) (?:wall|run)\b/.test(t)) return pkg([{ op: 'add_views' }]);
  if (/\b(capture|recapture|retake|refresh|update)\b.*\b(stale|outdated|old)\b.*\b3d views?\b|\b(recapture|retake)\b.*\b3d views\b|\bcapture (?:all )?(?:the )?3d views again\b/.test(t)) return pkg([{ op: 'recapture_stale' }]);
  if (/^(?:capture|recapture|retake)(?: it| this(?: page)?)?(?: again)?$/.test(t)) return pkg([{ op: 'capture_view' }]);
  const cap = /\b(capture|recapture|retake|take)\b (?:a |the )?(?:(.+?) )?(?:3d )?view\b(?: again)?/.exec(t);
  if (cap && /\b(capture|recapture|retake)\b|\b3d\b/.test(t) && !/\bviews\b/.test(t)) {
    const v = cap[2]?.replace(/\b(3d|this|page'?s?)\b/g, '').trim();
    return pkg([{ op: 'capture_view', ...(v && v !== 'it' ? { view: v } : {}) }], pageRefIn(t.replace(cap[0], '')));
  }
  if (/\bopen (the )?client package\b/.test(t)) return pkg([{ op: 'open' }], pageRefIn(t.replace(/client package/, '')));

  const note = /^(?:please\s+)?add (?:a |an )?note(?: (?:to|on) (.+?))?(?:\s+(?:that|saying|which says))?\s*[:,]?\s+(.+)$/i.exec(raw);
  if (note && /^add (a |an )?note\b/.test(t)) {
    let text = note[2]!.trim().replace(/^["'“]|["'”.]$/g, '');
    if (!/^note\b/i.test(text)) text = `NOTE: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
    return pkg([{ op: 'add_note', text }], note[1] ? pageRefIn(note[1].toLowerCase()) : undefined);
  }
  const moveNote = /\bmove (?:the )?(?:last |new )?note (?:to )?(?:the )?(top[- ]left|top[- ]right|bottom[- ]left|bottom[- ]right|cent(?:re|er)|middle)\b/.exec(t);
  if (moveNote) {
    const p = moveNote[1]!.replace(' ', '-');
    return pkg([{ op: 'move_note', position: /cent|middle/.test(p) ? 'centre' : (p as 'top-left') }], pageRefIn(t));
  }
  const orient = /\b(change|make|set|switch|turn|put)\b.*\b(landscape|portrait)\b/.exec(t);
  if (orient) return pkg([{ op: 'set_orientation', orientation: orient[2] as 'landscape' | 'portrait' }], pageRefIn(t));
  const paper = /\b(change|make|set|switch|put|print)\b.*\b(a3|a4)\b/.exec(t);
  if (paper && /\bpages?\b|\b(layout|elevation|schedule|board)\b/.test(t)) return pkg([{ op: 'set_paper', paper: paper[2]!.toUpperCase() as 'A3' | 'A4' }], pageRefIn(t));
  const dim = /\b(move|shift|push|pull)\b (?:the )?(\d+) ?mm dimension(?: label| line)?\b.*?\b(away|further|closer|nearer|up|down|left|right)\b/.exec(t);
  if (dim) {
    const d = dim[3]!;
    return pkg([{ op: 'move_dimension', value: Number(dim[2]), direction: d === 'further' ? 'away' : d === 'nearer' ? 'closer' : (d as 'away') }], pageRefIn(t));
  }
  const hide = /\bhide (?:the )?(\d+) ?mm dimension\b/.exec(t);
  if (hide) return pkg([{ op: 'hide_dimension', value: Number(hide[1]) }], pageRefIn(t));
  if (/\b(make|show)\b.*\bimages?\b.*\b(larger|bigger|smaller)\b/.test(t)) return pkg([{ op: 'resize_images', change: /smaller/.test(t) ? 'smaller' : 'larger' }], 'hardware');
  const elev = /\b(create|add|make|generate)\b (?:an|a new|another) elevation\b(?: (?:for|of) (?:the )?(?:(back|left|right|front) wall|wall [a-h]\b))?/.exec(t);
  if (elev) return pkg([{ op: 'add_page', template: 'elevation', ...(elev[2] ? { wall: elev[2] as WallId } : {}) }]);
  if (/\btitle block\b/.test(t) && /\b(add|put|show|every|all)\b/.test(t)) return pkg([{ op: 'title_block' }]);
  const info = /^(?:please\s+)?set (?:the )?(client name|client|site address|address|date|drawn by|approved by|reference by|studio address|studio name|studio|project title|project name|project)(?: field)? to\s+(.+)$/i.exec(raw);
  if (info) return pkg([{ op: 'set_info', field: INFO_FIELD[info[1]!.toLowerCase()]!, value: info[2]!.trim().replace(/[."']$/, '') }]);
  const regen = /\b(regenerate|refresh|update)\b (?:the )?(.+?)(?: (?:using|from|for|with) (?:the )?(?:latest |last )?(approved|current)\b.*)?$/.exec(t);
  if (regen && /\b(regenerate|refresh)\b/.test(t) && !/\b(drawings?|drawing set|pdf|deliverables?)\b/.test(t)) {
    const ref = pageRefIn(regen[2]!);
    if (ref) return pkg([{ op: 'regenerate', revision: regen[3] === 'approved' || /\bapproved\b/.test(t) ? 'approved' : 'current' }], ref);
  }
  const del = /\b(delete|remove)\b (?:the )?(.+?) page\b/.exec(t);
  if (del) return pkg([{ op: 'delete_page' }], pageRefIn(`${del[2]} page`) ?? del[2]);
  const rename = /^(?:please\s+)?rename (?:the )?(.+?) page to\s+(.+)$/i.exec(raw);
  if (rename) return pkg([{ op: 'rename_page', name: rename[2]!.trim().replace(/^["'“]|["'”.]$/g, '') }], pageRefIn(rename[1]!.toLowerCase()) ?? rename[1]);
  const movePage = /\bmove (?:the )?(.+?) page (up|down|to the (?:start|front|beginning)|to the (?:end|back)|first|last|to page (\d+))\b/.exec(t);
  if (movePage) {
    const w = movePage[2]!;
    const to = movePage[3] ? Number(movePage[3]) : /start|front|beginning|first/.test(w) ? 'first' : /end|back|last/.test(w) ? 'last' : (w as 'up' | 'down');
    return pkg([{ op: 'move_page', to }], pageRefIn(`${movePage[1]} page`) ?? (movePage[1] === 'this' ? undefined : movePage[1]));
  }
  return null;
}

// ── Deliverables ───────────────────────────────────────────────────────────

function deliverableRequest(t: string): AssistantResponse | null {
  const approved = /\b(latest |last )?approved (revision|version|design)\b/.test(t);
  const req = (request: Omit<DeliverableRequest, 'revision'> & { revision?: 'current' | 'approved' }): AssistantResponse => ({ kind: 'deliverable', request: { revision: approved ? 'approved' : 'current', ...request } });
  if (/\b(photo ?real\w*|realistic (photo|image|picture|render(ing)?)|render(ing)?|photograph)\b/.test(t) && !/\bdrawings?\b/.test(t)) return req({ action: 'render' });
  if (/\b(regenerate|re-generate|redo|recreate)\b.*\b(drawings?|plans?|set|pdf|deliverables?)\b/.test(t)) return req({ action: 'regenerate', revision: approved ? 'approved' : 'current' });
  if (/\b(what|which)\b.*\b(information|info|data|details?)\b.*\b(missing|needed|need)\b|\b(ready|readiness)\b.*\b(carpenter|workshop|joiner|manufactur\w*|fabricat\w*|production)\b|\bbefore (i|we) (can )?send\b/.test(t)) return req({ action: 'readiness' });
  if (/\bexport\b.*\bpdf\b|\b(pdf|print)\b.*\b(drawings?|set|plan)\b|\bdrawings?\b.*\bpdf\b/.test(t)) return req({ action: 'export-pdf' });
  if (/\b(csv|spreadsheet|excel)\b/.test(t)) return req({ action: 'export-csv', csv: /\b(bom|bill of materials|materials)\b/.test(t) ? 'bom' : /\bcut[- ]?list\b/.test(t) ? 'cutlist' : 'schedule' });
  if (/\b(bom|bill of materials|materials list|cut[- ]?list)\b/.test(t)) return req({ action: 'bom' });
  if (/\bschedule\b/.test(t)) {
    const type = firstTypeWord(t);
    const tt = type ? typeOf(type) : undefined;
    return req({ action: 'schedule', ...(tt && tt !== 'cabinet' ? { filter: { type: tt } } : {}) });
  }
  if (/\belevations?\b/.test(t)) {
    const walls = WALLS.filter((w) => new RegExp(`\\b${w} wall\\b`).test(t));
    return req({ action: 'elevations', ...(walls.length ? { walls } : { kitchenWalls: /\bkitchen\b/.test(t) }) });
  }
  if (/\b(floor plan|dimensioned plan|plan drawing|technical drawings?)\b/.test(t)) return req({ action: 'plan' });
  if (/\b(presentation mode|present (this|the) (design|kitchen)|client presentation)\b/.test(t)) return req({ action: 'present' });
  return null;
}

/** "open the top drawer of the sink unit", "close everything", "walk to the fridge", "show the top view"… */
function sceneRequest(t: string, ctx: Ctx): AssistantResponse | null {
  const act = (explanation: string, ...actions: SceneAction[]): AssistantResponse => ({ kind: 'act', explanation, actions });
  const s = t.replace(/^(?:please |can you |could you |now |let's |lets )+/, '').replace(/ please$/, '');

  const oc = /^(open|close|shut)\s+(?:up\s+)?(.+)$/.exec(s);
  if (oc) {
    const action = oc[1] === 'open' ? 'open' : 'close';
    const rest = oc[2]!.trim();
    if (/^(?:it all|everything|all(?: of)?(?: the)?(?: (?:doors|drawers|doors and drawers|cabinets|units))?)$/.test(rest)) return act(`${action === 'open' ? 'Open' : 'Close'} everything.`, { action, all: true });
    const part = /^(?:the )?((?:(?:top|bottom|middle|upper|lower|left|right)\s+)?(?:drawer|door|flap)s?)\s+(?:of|on|in)\s+(.+)$/.exec(rest);
    const target = targetIn(part ? part[2]! : rest, ctx, null);
    if (!target) return null;
    return act('', { action, target, ...(part ? { part: part[1]! } : {}) });
  }
  if (/^(?:start walking|walk around|walk(?: me)? through(?: the (?:room|kitchen|space))?|let me walk)$/.test(s)) return act('', { action: 'start_walking' });
  if (/^(?:stop walking|exit walk(?:ing)?(?: mode)?|stop|back to orbit)$/.test(s)) return act('', { action: 'stop_walking' });
  const vp = /^(?:go to|take me to|jump to)\s+(?:the\s+)?viewpoint\s+(.+)$/.exec(s);
  if (vp) return act('', { action: 'viewpoint', name: vp[1]! });
  const walk = /^(?:walk|go|take me|stand|step)\s+(?:over\s+)?(?:to|in front of|next to|up to)\s+(.+)$/.exec(s);
  if (walk) {
    const target = targetIn(walk[1]!, ctx, null);
    if (target) return act('', { action: 'walk_to', target });
  }
  const look = /^(?:look at|focus on|zoom (?:in )?(?:on|to)|show me)\s+(.+)$/.exec(s);
  if (look && !/\b(view|plan|dimensions?|sizes?|list|schedule|bom|drawings?)\b/.test(look[1]!)) {
    const target = targetIn(look[1]!, ctx, null);
    if (target) return act('', { action: 'focus', target });
  }
  const view = /^(?:show(?: me)?|switch to|go to|change to)\s+(?:the\s+)?(top|front|left|right|iso(?:metric)?|corner|whole room|plan|3d|split)\s*(?:view)?$/.exec(s);
  if (view) {
    const v = view[1]!;
    if (v === 'plan' || v === '3d' || v === 'split') return act('', { action: 'view', mode: v });
    if (v === 'whole room') return act('', { action: 'look', view: 'fit' });
    return act('', { action: 'look', view: v.startsWith('iso') || v === 'corner' ? 'iso' : (v as 'top' | 'front' | 'left' | 'right') });
  }
  return null;
}
