/**
 * Deterministic natural-language → tool-call parser for the common editing requests. It runs in
 * the browser with no network and no cost; anything it can't parse with certainty returns null
 * and is handed to the language-model planner, which produces the same ToolCall shape. Both paths
 * go through `planTool` validation before anything touches the scene.
 */
import type { Dimension, MaterialSlot, ToolCall } from './sceneTools';

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?|in|inch(?:es)?|"|ft|feet|foot|')?`;

/** Value with optional unit → millimetres. */
export function lengthToMm(value: string, unit: string | undefined): number {
  const v = Number(value.replace(',', '.'));
  const u = (unit ?? 'mm').toLowerCase();
  if (u.startsWith('cm') || u.startsWith('centi')) return v * 10;
  if (u === 'm' || u.startsWith('met')) return v * 1000;
  if (u === 'in' || u.startsWith('inch') || u === '"') return Math.round(v * 25.4 * 10) / 10;
  if (u === 'ft' || u === 'feet' || u === 'foot' || u === "'") return Math.round(v * 304.8 * 10) / 10;
  return v;
}

const KIND_WORDS: [RegExp, string][] = [
  [/\b(wall|upper|overhead|hanging)\s+(cabinet|unit|cupboard)s?\b/, 'wallcabinet'],
  [/\btall\s+(unit|cabinet)s?\b|\bpantry\b|\blarder\b/, 'tallcabinet'],
  [/\b(base|kitchen|lower)\s+(cabinet|unit|module)s?\b|\bbase\s*unit\b|\bdrawer\s+(base\s+)?unit\b|\bsink\s+unit\b/, 'basecabinet'],
  [/\bward ?robes?\b|\bclosets?\b/, 'wardrobe'],
  [/\btv\s*(unit|console|cabinet)s?\b/, 'tvunit'],
  [/\bbeds?\b/, 'bed'],
  [/\bsofas?\b|\bcouch(es)?\b/, 'sofa'],
  [/\bside\s*tables?\b|\bbedside\s*tables?\b|\bnightstands?\b/, 'side-table'],
  [/\b(dining\s+)?tables?\b/, 'table'],
];

const DIM_WORDS: [RegExp, Dimension][] = [
  [/\bwidth\b|\bwide[rn]?\b|\bnarrow(er)?\b|\blength\b|\blong\b/, 'width'],
  [/\bdepth\b|\bdeep(er|en)?\b|\bshallow(er)?\b/, 'depth'],
  [/\bplinth\b|\bkick\s*board\b|\btoe\s*kick\b/, 'plinth'],
  [/\bworktop\s+thickness\b|\bcountertop\s+thickness\b|\bworktop\b(?=.*\bthick)/, 'worktop'],
  [/\bmount(ing)?\s+height\b|\bmounted\b/, 'mount_height'],
  [/\belevation\b|\boff the floor\b/, 'elevation'],
  [/\bheight\b|\btall(er)?\b|\bhigh(er)?\b|\bshorter\b|\blower\b/, 'height'],
];

const SLOT_WORDS: [RegExp, MaterialSlot][] = [
  [/\b(doors?|shutters?|fronts?|drawer\s+fronts?|facades?)\b/, 'shutter'],
  [/\b(carcass|carcase|body|box|cabinet\s+body|inside|interior)\b/, 'carcass'],
  [/\b(worktop|countertop|counter\s*top|counter|top\s+slab)\b/, 'worktop'],
  [/\baccent\b/, 'accent'],
];

function kindOf(s: string): string | undefined {
  for (const [re, k] of KIND_WORDS) if (re.test(s)) return k;
  return undefined;
}

/** Name in quotes, or "the X" / "called X" when no selection-word is used. */
function targetOf(s: string): string {
  const q = /["“']([^"”']{2,60})["”']/.exec(s);
  if (q) return q[1];
  return 'selected';
}

function clause(raw: string): ToolCall[] | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (!s) return [];
  const expectKind = kindOf(s);
  const target = targetOf(raw);
  const base = { target, ...(expectKind ? { expectKind } : {}) };
  let m: RegExpExecArray | null;

  // Fill a wall: "fill this wall with base cabinets", "fill wall 2 with wall units, standard sizes".
  if (/^(fill|line|run)\b/.test(s) && /\bwall\b/.test(s)) {
    const type = expectKind === 'wallcabinet' ? 'wall' : expectKind === 'tallcabinet' ? 'tall' : /\b(base|lower|kitchen)\b|\bcabinets?\b|\bunits?\b/.test(s) ? 'base' : null;
    if (!type) return null;
    const args: Record<string, unknown> = { type };
    m = /\bwall\s+(\d+)\b/.exec(s);
    if (m) args.wall = m[1];
    if (/\bstandard\b/.test(s)) args.fit = 'standard';
    if (/\bdrawers?\b/.test(s)) args.front = 'drawers';
    return [{ tool: 'fill_wall', args }];
  }

  // Add a wall or tall unit: "add a wall cabinet above it", "add a 450 tall pantry unit".
  if (/^(add|insert|place|put|hang)\b/.test(s) && (expectKind === 'wallcabinet' || expectKind === 'tallcabinet')) {
    m = new RegExp(`${NUM}${UNIT}`).exec(s);
    const args: Record<string, unknown> = { type: expectKind === 'wallcabinet' ? 'wall' : 'tall' };
    if (m) args.widthMm = lengthToMm(m[1], m[2]);
    if (/\bflap\b|\blift[- ]?up\b/.test(s)) args.front = 'flap';
    if (/\bopen\b/.test(s)) args.front = 'open';
    if (/\bleft\b/.test(s)) args.side = 'left';
    return [{ tool: 'add_cabinet', args }];
  }

  // Add a cabinet: "add a 450 mm drawer base cabinet [to the left]".
  if (/^(add|insert|place|put)\b/.test(s) && expectKind === 'basecabinet') {
    m = new RegExp(`${NUM}${UNIT}`).exec(s);
    const args: Record<string, unknown> = {};
    if (m) args.widthMm = lengthToMm(m[1], m[2]);
    if (/drawer/.test(s)) args.front = 'drawers';
    if (/\bleft\b/.test(s)) args.side = 'left';
    return [{ tool: 'add_base_cabinet', args }];
  }

  // Delete / rename / select.
  if (/^(delete|remove|get rid of)\b/.test(s)) return [{ tool: 'delete', args: base }];
  if ((m = /^(?:rename|call|name)\b.*?\b(?:to|as)\s+["“']?(.+?)["”']?$/.exec(raw.trim()))) return [{ tool: 'rename', args: { target: 'selected', ...(expectKind ? { expectKind } : {}), name: m[1].trim() } }];

  // Rotation: "rotate 90", "rotate it by -90 degrees", "turn left", "rotate to 180".
  if (/^(rotate|turn|spin)\b/.test(s)) {
    if ((m = new RegExp(String.raw`\bto\s+${NUM}`).exec(s))) return [{ tool: 'rotate', args: { ...base, toDeg: Number(m[1]) } }];
    if ((m = new RegExp(NUM).exec(s))) {
      const deg = Number(m[1]) * (/\b(anti|counter)[- ]?clockwise\b|\bleft\b/.test(s) ? -1 : 1);
      return [{ tool: 'rotate', args: { ...base, byDeg: deg } }];
    }
    if (/\bleft\b|\b(anti|counter)[- ]?clockwise\b/.test(s)) return [{ tool: 'rotate', args: { ...base, byDeg: -90 } }];
    if (/\bright\b|\bclockwise\b|\baround\b/.test(s)) return [{ tool: 'rotate', args: { ...base, byDeg: /\baround\b/.test(s) ? 180 : 90 } }];
    return null;
  }

  // Move: "move it 100 mm left", "shift 5 cm north".
  if (/^(move|shift|nudge|slide)\b/.test(s)) {
    m = new RegExp(`${NUM}${UNIT}\\s*(?:to the\\s+)?(left|right|up|down|north|south|east|west|forward|back(?:ward)?s?)\\b`).exec(s);
    if (!m) return null;
    const d = lengthToMm(m[1], m[2]);
    const dir = m[3];
    const v: Record<string, [number, number]> = { left: [-1, 0], west: [-1, 0], right: [1, 0], east: [1, 0], up: [0, -1], north: [0, -1], back: [0, -1], backward: [0, -1], backwards: [0, -1], down: [0, 1], south: [0, 1], forward: [0, 1] };
    const [x, y] = v[dir] ?? [0, 0];
    return [{ tool: 'move', args: { ...base, dxMm: x * d, dyMm: y * d } }];
  }

  // Front type: "make it a drawer unit", "switch to doors", "use drawers".
  if ((m = /\b(?:switch|change|convert|make)\b.*\b(?:to|into|a|an)\s+(doors?|drawers?)(?:\s+(?:front|unit))?\b/.exec(s)) && !/\d/.test(s)) {
    return [{ tool: 'set_parameter', args: { ...base, parameter: 'front', value: m[1] } }];
  }
  // Counts: "2 doors", "set shelves to 3", "use 4 drawers".
  if ((m = /\b(\d+)\s+(doors?|drawers?|shelves|shelf)\b/.exec(s)) || (m = /\b(doors?|drawers?|shelves|shelf)\b.*?\bto\s+(\d+)\b/.exec(s))) {
    const [n, word] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const parameter = word.startsWith('door') ? 'doorCount' : word.startsWith('drawer') ? 'drawerCount' : 'shelfCount';
    // "2 drawers" on a door unit means switching the front too.
    const calls: ToolCall[] = [];
    if (parameter === 'drawerCount' && /\b(drawer unit|switch|make it|use)\b/.test(s)) calls.push({ tool: 'set_parameter', args: { ...base, parameter: 'front', value: 'drawers' } });
    calls.push({ tool: 'set_parameter', args: { ...base, parameter, value: Number(n) } });
    return calls;
  }

  // Dimensions: "change the selected base cabinet width to 900 mm", "make it 45 cm deep", "height 870".
  const dimension = DIM_WORDS.find(([re]) => re.test(s))?.[1];
  if (dimension) {
    m = new RegExp(String.raw`\b(?:to|=|:|at|as)\s*${NUM}${UNIT}`).exec(s) ?? new RegExp(`${NUM}${UNIT}`).exec(s);
    if (!m) return null;
    let mmVal = lengthToMm(m[1], m[2]);
    if (/\b(increase|widen|extend|grow|add)\b.*\bby\b/.test(s) || /\bwider by\b|\btaller by\b|\bdeeper by\b/.test(s)) return [{ tool: 'set_dimension', args: { ...base, dimension, deltaMm: mmVal } }];
    if (/\b(decrease|reduce|shrink|narrow|cut)\b.*\bby\b/.test(s) || /\bnarrower by\b|\bshorter by\b|\bshallower by\b/.test(s)) return [{ tool: 'set_dimension', args: { ...base, dimension, deltaMm: -mmVal } }];
    if (dimension === 'worktop' && !/\bthick/.test(s)) return null;
    mmVal = Math.round(mmVal * 10) / 10;
    return [{ tool: 'set_dimension', args: { ...base, dimension, valueMm: mmVal } }];
  }

  // Whole-design style: "make all units walnut", "change every door to white", "paint the whole kitchen ivory".
  if ((m = /\b(?:all|every|each|whole|entire)\b.*?\b(?:units?|cabinets?|doors?|shutters?|fronts?|carcass|worktops?|kitchen|wardrobes?)\b\s+(?:(?:to|in|with|as|into)\s+)?(?:(?:a|an|the)\s+)?(.+?)(?:\s+(?:finish|laminate|colour|color))?$/.exec(s)) && !/\d/.test(m[1])) {
    const slotAll = SLOT_WORDS.find(([re]) => re.test(s))?.[1] ?? 'shutter';
    return [{ tool: 'apply_style', args: { [slotAll]: m[1].replace(/^(the|a|an)\s+/, '').trim() } }];
  }

  // Materials: "change the doors to walnut", "make the worktop white quartz", "paint the carcass ivory".
  const slot = SLOT_WORDS.find(([re]) => re.test(s))?.[1];
  if ((m = /\b(?:to|in|with|as|into)\s+(?:a\s+|an\s+)?(.+?)(?:\s+(?:finish|laminate|colour|color))?$/.exec(s)) || (m = /^(?:paint|make|use|finish)\s+(?:the\s+)?(?:\w+\s+){0,3}?(?:doors?|shutters?|fronts?|carcass|body|worktop|countertop)\s+(.+)$/.exec(s))) {
    if (!slot && !/\b(colou?r|finish|material|laminate|paint)\b/.test(s)) return null;
    const material = m[1].replace(/^(the|a|an)\s+/, '').trim();
    if (!material || /\d/.test(material)) return null;
    return [{ tool: 'set_material', args: { ...base, slot: slot ?? 'shutter', material } }];
  }
  return null;
}

/**
 * Parse a request into tool calls, or null when any part is not understood with certainty.
 * Clauses split on "and", "then" and commas: "make it 900 wide and change the doors to walnut".
 */
export function parseCommand(text: string): ToolCall[] | null {
  const t = text.trim();
  if (!t || t.length > 400) return null;
  const parts = t.split(/\s*(?:,|;|\bthen\b|\band then\b|\band\b(?=\s+(?:make|change|set|rotate|turn|move|shift|rename|delete|remove|use|paint|switch|add|put|place|increase|reduce|widen)\b))\s*/i).filter(Boolean);
  const calls: ToolCall[] = [];
  let lastKind: string | undefined;
  for (const p of parts) {
    const c = clause(p);
    if (!c) return null;
    for (const call of c) {
      // A kind named once ("the base cabinet ... and make the doors walnut") carries to later clauses.
      if (call.args.expectKind) lastKind = call.args.expectKind as string;
      else if (lastKind && call.tool !== 'add_base_cabinet') call.args.expectKind = lastKind;
      calls.push(call);
    }
  }
  return calls.length ? calls : null;
}
