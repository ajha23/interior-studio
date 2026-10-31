/**
 * The drawing model shared by every technical output. Views hold primitives in model millimetres
 * (the canonical unit; never rounded or converted on the way in). A sheet places views on paper at
 * an explicit scale (paper mm = model mm × scale) with a title block. `renderSheet` turns a sheet
 * into calls on a `Painter`, so SVG and PDF draw the same lines, dimensions and text.
 *
 * Coordinates: x to the right, y down (as on paper). Text and tag sizes are paper millimetres so
 * they stay readable at any scale. Dimension values are millimetres; their text is formatted once,
 * by `formatDimension`, and stored beside the value.
 */
import { formatLength, type LengthUnit } from '../measurement/units';

export interface Pt {
  x: number;
  y: number;
}

export type Stroke = 'thick' | 'medium' | 'thin' | 'hidden' | 'centre' | 'dim';
export type Fill = 'none' | 'wall' | 'unit' | 'appliance' | 'worktop' | 'glass' | 'floor' | 'plinth' | 'handle' | 'front' | 'opening' | 'header';

export type DimensionRole = 'overall' | 'segment' | 'height' | 'thickness' | 'opening';

export interface Dimension {
  t: 'dim';
  /** Measured points on the object (model mm). */
  a: Pt;
  b: Pt;
  /** Signed distance of the dimension line from a→b, in model mm (positive = left of a→b). */
  offset: number;
  /** The measured length in millimetres (|a−b| projected on the dimension direction). */
  value: number;
  text: string;
  role: DimensionRole;
  /** Measure only along x or y (otherwise along a→b). */
  axis?: 'x' | 'y';
}

export type Prim =
  | { t: 'line'; a: Pt; b: Pt; stroke: Stroke }
  | { t: 'rect'; x: number; y: number; w: number; h: number; stroke: Stroke | null; fill: Fill }
  | { t: 'poly'; pts: Pt[]; closed: boolean; stroke: Stroke | null; fill: Fill }
  /** Arc from angle a0 to a1 (radians, y-down so positive = clockwise on paper). */
  | { t: 'arc'; c: Pt; r: number; a0: number; a1: number; stroke: Stroke }
  /** A reference tag: circle with text, radius in paper mm. */
  | { t: 'tag'; at: Pt; text: string; r: number }
  /** Text: size in paper mm, rotation in degrees (counter-clockwise on paper). */
  | { t: 'text'; at: Pt; text: string; size: number; anchor: 'start' | 'middle' | 'end'; rotate?: number; bold?: boolean }
  | Dimension;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface View {
  id: string;
  title: string;
  prims: Prim[];
  /** Extent of everything drawn (model mm), dimensions included. */
  bounds: Bounds;
  notes: string[];
}

export type Paper = 'A3' | 'A4';
export const PAPER: Record<Paper, { w: number; h: number }> = { A3: { w: 420, h: 297 }, A4: { w: 297, h: 210 } };
export const SCALES = [5, 10, 20, 25, 50, 100] as const;
export type ScaleChoice = 'fit' | (typeof SCALES)[number];

export interface TitleBlock {
  project: string;
  projectId: string;
  title: string;
  drawingNo: string;
  revision: string;
  generated: string;
  units: string;
  scale: string;
  status: string;
  sheet: string;
}

export interface TableColumn {
  label: string;
  /** Share of the table width. */
  width: number;
  align?: 'left' | 'right';
}

export interface Sheet {
  id: string;
  paper: Paper;
  title: TitleBlock;
  /** A drawing at a scale, or a table page. */
  body: { kind: 'view'; view: View; scale: number } | { kind: 'table'; heading: string; columns: TableColumn[]; rows: string[][]; notes: string[] };
}

// ── Text metrics (Helvetica, used by both writers so layout is identical) ──────────────────────

/** Helvetica advance widths (1/1000 em) for ASCII 32–126. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const EXTRA: Record<string, number> = { '×': 584, '–': 556, '—': 1000, '’': 222, '‘': 222, '“': 333, '”': 333, '°': 400, '·': 278, '…': 1000, '²': 333, '≈': 584 };

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    w += code >= 32 && code <= 126 ? HELVETICA[code - 32]! : (EXTRA[ch] ?? 556);
  }
  return (w / 1000) * size * (bold ? 1.05 : 1);
}

/** Dimension text: plain whole millimetres (drawing convention) or the chosen unit. */
export function formatDimension(mm: number, unit: LengthUnit): string {
  const v = Math.round(mm);
  return unit === 'mm' ? String(v) : formatLength(v, unit);
}

// ── Dimension geometry ─────────────────────────────────────────────────────────────────────────

export interface DimensionGeometry {
  /** Extension lines (model mm). */
  ext: [Pt, Pt][];
  /** The dimension line (model mm). */
  line: [Pt, Pt];
  /** Tick marks at both ends (model mm). */
  ticks: [Pt, Pt][];
  /** Text anchor (model mm) and rotation (deg, counter-clockwise). */
  text: Pt;
  rotate: number;
  /** True when the text did not fit between the ticks and was moved outside. */
  outside: boolean;
}

const EXT_GAP = 1.5; // paper mm between object and extension line
const EXT_OVER = 1.5; // paper mm the extension line passes the dimension line
const TICK = 1.2; // paper mm, half-length of the oblique tick
const TEXT_SIZE = 2.5; // paper mm
const TEXT_LIFT = 0.8; // paper mm above the dimension line

/** Where everything of a dimension goes at a given scale (paper mm per model mm). */
export function dimensionGeometry(d: Dimension, scale: number): DimensionGeometry {
  const toModel = (paper: number) => paper / scale;
  const a = d.a;
  let b = d.b;
  if (d.axis === 'x') b = { x: b.x, y: a.y };
  if (d.axis === 'y') b = { x: a.x, y: b.y };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  const n = { x: u.y, y: -u.x }; // left of a→b on y-down paper
  const off = d.offset;
  const la = { x: a.x + n.x * off, y: a.y + n.y * off };
  const lb = { x: b.x + n.x * off, y: b.y + n.y * off };
  const sign = Math.sign(off) || 1;
  const gap = toModel(EXT_GAP) * sign;
  const over = toModel(EXT_OVER) * sign;
  const ext: [Pt, Pt][] = Math.abs(off) > toModel(EXT_GAP)
    ? [
        [{ x: a.x + n.x * gap, y: a.y + n.y * gap }, { x: la.x + n.x * over, y: la.y + n.y * over }],
        [{ x: b.x + n.x * gap, y: b.y + n.y * gap }, { x: lb.x + n.x * over, y: lb.y + n.y * over }],
      ]
    : [];
  const t = toModel(TICK);
  const diag = { x: (u.x + n.x) * t * Math.SQRT1_2, y: (u.y + n.y) * t * Math.SQRT1_2 };
  const ticks: [Pt, Pt][] = [la, lb].map((p) => [{ x: p.x - diag.x, y: p.y - diag.y }, { x: p.x + diag.x, y: p.y + diag.y }] as [Pt, Pt]);
  // Text reads left-to-right or bottom-to-top.
  let rotate = (-Math.atan2(dy, dx) * 180) / Math.PI;
  if (rotate <= -90 || rotate > 90) rotate += rotate <= -90 ? 180 : -180;
  const textLen = toModel(textWidth(d.text, TEXT_SIZE));
  const fits = textLen + toModel(2 * TICK + 1) < len;
  const rad = (rotate * Math.PI) / 180;
  const reading = { x: Math.cos(rad), y: -Math.sin(rad) };
  const up = { x: -Math.sin(rad), y: -Math.cos(rad) };
  const lift = toModel(TEXT_LIFT);
  const mid = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
  let text = { x: mid.x + up.x * lift, y: mid.y + up.y * lift };
  let outside = false;
  if (!fits) {
    // Too short: put the text beyond the end of the line, in reading direction.
    outside = true;
    const along = (q: Pt) => q.x * reading.x + q.y * reading.y;
    const end = along(lb) >= along(la) ? lb : la;
    const push = toModel(TICK + 1) + textLen / 2;
    text = { x: end.x + reading.x * push + up.x * lift, y: end.y + reading.y * push + up.y * lift };
  }
  return { ext, line: [la, lb], ticks, text, rotate, outside };
}

export function dimensionTextSize(): number {
  return TEXT_SIZE;
}

// ── Bounds and scale ───────────────────────────────────────────────────────────────────────────

export function boundsOf(prims: Prim[], marginPaper = 0, scale = 1 / 25): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (p: Pt) => {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  };
  for (const p of prims) {
    if (p.t === 'line') [p.a, p.b].forEach(add);
    else if (p.t === 'rect') [{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y + p.h }].forEach(add);
    else if (p.t === 'poly') p.pts.forEach(add);
    else if (p.t === 'arc') [{ x: p.c.x - p.r, y: p.c.y - p.r }, { x: p.c.x + p.r, y: p.c.y + p.r }].forEach(add);
    else if (p.t === 'tag' || p.t === 'text') add(p.at);
    else {
      const g = dimensionGeometry(p, scale);
      [...g.line, g.text, ...g.ext.flat()].forEach(add);
    }
  }
  const m = marginPaper / scale;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** The drawing area of a sheet (paper mm), inside the border and above the title block. */
export function drawingArea(paper: Paper): { x: number; y: number; w: number; h: number } {
  const { w, h } = PAPER[paper];
  return { x: 15, y: 10, w: w - 25, h: h - 10 - 10 - TITLE_H };
}

export const TITLE_H = 24;

/** The largest standard scale (1:n) at which the view fits the drawing area, or the chosen one. */
export function chooseScale(view: View, paper: Paper, choice: ScaleChoice): { scale: number; label: string; fits: boolean } {
  const area = drawingArea(paper);
  const fitsAt = (n: number) => {
    const s = 1 / n;
    const b = boundsOf(view.prims, 3, s);
    return (b.maxX - b.minX) * s <= area.w && (b.maxY - b.minY) * s <= area.h;
  };
  if (choice !== 'fit') return { scale: 1 / choice, label: `1:${choice}`, fits: fitsAt(choice) };
  const n = SCALES.find(fitsAt) ?? SCALES[SCALES.length - 1]!;
  return { scale: 1 / n, label: `1:${n}`, fits: fitsAt(n) };
}

// ── Rendering through a painter ────────────────────────────────────────────────────────────────

export interface Painter {
  line(a: Pt, b: Pt, width: number, dash?: number[]): void;
  rect(x: number, y: number, w: number, h: number, stroke: { width: number; dash?: number[] } | null, fill: string | null): void;
  poly(pts: Pt[], closed: boolean, stroke: { width: number; dash?: number[] } | null, fill: string | null): void;
  arc(c: Pt, r: number, a0: number, a1: number, width: number, dash?: number[]): void;
  circle(c: Pt, r: number, width: number, fill: string | null): void;
  text(at: Pt, text: string, size: number, anchor: 'start' | 'middle' | 'end', rotate?: number, bold?: boolean): void;
}

/** Line weights and dashes on paper (mm). */
export const STROKES: Record<Stroke, { width: number; dash?: number[] }> = {
  thick: { width: 0.5 },
  medium: { width: 0.35 },
  thin: { width: 0.18 },
  hidden: { width: 0.18, dash: [1.5, 1] },
  centre: { width: 0.13, dash: [4, 1, 1, 1] },
  dim: { width: 0.13 },
};

export const FILLS: Record<Fill, string | null> = {
  none: null,
  wall: '#3a3a3a',
  unit: '#ffffff',
  appliance: '#eef0f2',
  worktop: '#efe7da',
  glass: '#dcedf2',
  floor: '#ffffff',
  plinth: '#d9d9d9',
  handle: '#444444',
  front: '#fbfbfb',
  opening: '#ffffff',
  header: '#eeeeee',
};

/** Draws a sheet: border, view (or table) and title block, all in paper millimetres. */
export function renderSheet(sheet: Sheet, p: Painter): void {
  const { w, h } = PAPER[sheet.paper];
  p.rect(10, 5, w - 15, h - 10, { width: 0.5 }, null);
  const area = drawingArea(sheet.paper);
  if (sheet.body.kind === 'view') renderView(sheet.body.view, sheet.body.scale, area, p);
  else renderTable(sheet.body, area, p);
  renderTitle(sheet, p);
}

function renderView(view: View, scale: number, area: { x: number; y: number; w: number; h: number }, p: Painter) {
  const b = view.bounds;
  // Centre the view in the drawing area.
  const ox = area.x + (area.w - (b.maxX - b.minX) * scale) / 2 - b.minX * scale;
  const oy = area.y + (area.h - (b.maxY - b.minY) * scale) / 2 - b.minY * scale;
  const P = (q: Pt): Pt => ({ x: round(ox + q.x * scale), y: round(oy + q.y * scale) });
  const S = (s: Stroke | null) => (s ? STROKES[s] : null);
  for (const prim of view.prims) {
    switch (prim.t) {
      case 'line':
        p.line(P(prim.a), P(prim.b), STROKES[prim.stroke].width, STROKES[prim.stroke].dash);
        break;
      case 'rect': {
        const a = P({ x: prim.x, y: prim.y });
        p.rect(a.x, a.y, round(prim.w * scale), round(prim.h * scale), S(prim.stroke), FILLS[prim.fill]);
        break;
      }
      case 'poly':
        p.poly(prim.pts.map(P), prim.closed, S(prim.stroke), FILLS[prim.fill]);
        break;
      case 'arc':
        p.arc(P(prim.c), round(prim.r * scale), prim.a0, prim.a1, STROKES[prim.stroke].width, STROKES[prim.stroke].dash);
        break;
      case 'tag':
        p.circle(P(prim.at), prim.r, 0.25, '#ffffff');
        p.text({ x: P(prim.at).x, y: round(P(prim.at).y + prim.r * 0.36) }, prim.text, prim.r * 1.0, 'middle', 0, true);
        break;
      case 'text':
        p.text(P(prim.at), prim.text, prim.size, prim.anchor, prim.rotate, prim.bold);
        break;
      case 'dim': {
        const g = dimensionGeometry(prim, scale);
        for (const [a, c] of g.ext) p.line(P(a), P(c), STROKES.dim.width);
        p.line(P(g.line[0]), P(g.line[1]), STROKES.dim.width);
        for (const [a, c] of g.ticks) p.line(P(a), P(c), 0.35);
        p.text(P(g.text), prim.text, TEXT_SIZE, 'middle', g.rotate);
        break;
      }
    }
  }
  if (view.notes.length) {
    let y = area.y + area.h - 2 - (view.notes.length - 1) * 3.2;
    for (const n of view.notes) {
      p.text({ x: area.x + 2, y }, n, 2.2, 'start');
      y += 3.2;
    }
  }
}

const ROW_H = 5;

/** How many table rows fit on one sheet. */
export function rowsPerSheet(paper: Paper, notes: number): number {
  const area = drawingArea(paper);
  return Math.max(1, Math.floor((area.h - 8 - ROW_H - notes * 3.2) / ROW_H));
}

function renderTable(t: Extract<Sheet['body'], { kind: 'table' }>, area: { x: number; y: number; w: number; h: number }, p: Painter) {
  p.text({ x: area.x, y: area.y + 4 }, t.heading, 3.5, 'start', 0, true);
  const total = t.columns.reduce((s, c) => s + c.width, 0);
  const xs: number[] = [area.x];
  for (const c of t.columns) xs.push(xs.at(-1)! + (c.width / total) * area.w);
  let y = area.y + 8;
  const row = (cells: string[], header: boolean) => {
    if (header) p.rect(area.x, y, area.w, ROW_H, null, FILLS.header);
    cells.forEach((cell, i) => {
      const col = t.columns[i]!;
      const room = xs[i + 1]! - xs[i]! - 2;
      const size = header ? 2.2 : 2.3;
      const text = fitText(cell, size, room, header);
      if (col.align === 'right') p.text({ x: xs[i + 1]! - 1, y: y + ROW_H - 1.5 }, text, size, 'end', 0, header);
      else p.text({ x: xs[i]! + 1, y: y + ROW_H - 1.5 }, text, size, 'start', 0, header);
    });
    p.line({ x: area.x, y: y + ROW_H }, { x: area.x + area.w, y: y + ROW_H }, header ? 0.3 : 0.1);
    y += ROW_H;
  };
  p.line({ x: area.x, y }, { x: area.x + area.w, y }, 0.3);
  row(t.columns.map((c) => c.label), true);
  for (const r of t.rows) row(r, false);
  for (const x of xs) p.line({ x, y: area.y + 8 }, { x, y }, 0.1);
  y += 4;
  for (const n of t.notes) {
    p.text({ x: area.x, y }, n, 2.2, 'start');
    y += 3.2;
  }
}

/** Shortens text with an ellipsis to fit a width (paper mm). */
export function fitText(text: string, size: number, width: number, bold = false): string {
  if (textWidth(text, size, bold) <= width) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, size, bold) > width) s = s.slice(0, -1);
  return `${s}…`;
}

function renderTitle(sheet: Sheet, p: Painter) {
  const { w, h } = PAPER[sheet.paper];
  const t = sheet.title;
  const y0 = h - 5 - TITLE_H;
  p.line({ x: 10, y: y0 }, { x: w - 5, y: y0 }, 0.35);
  const cells: [string, string, number][] = [
    ['Project', `${t.project}`, 0.26],
    ['Drawing', t.title, 0.26],
    ['Drawing no. · revision', `${t.drawingNo} · ${t.revision}`, 0.18],
    ['Scale · units', `${t.scale} · ${t.units}`, 0.12],
    ['Sheet · generated', `${t.sheet} · ${t.generated}`, 0.18],
  ];
  let x = 10;
  const width = w - 15;
  for (const [label, value, share] of cells) {
    const cw = share * width;
    if (x > 10) p.line({ x, y: y0 }, { x, y: h - 5 }, 0.18);
    p.text({ x: x + 2, y: y0 + 4.5 }, label.toUpperCase(), 1.8, 'start');
    p.text({ x: x + 2, y: y0 + 10.5 }, fitText(value, 3, cw - 4, true), 3, 'start', 0, true);
    x += cw;
  }
  p.line({ x: 10, y: y0 + 14 }, { x: w - 5, y: y0 + 14 }, 0.13);
  p.text({ x: 12, y: y0 + 19.5 }, fitText(`Status: ${t.status}`, 2.3, width * 0.6), 2.3, 'start');
  p.text({ x: w - 7, y: y0 + 19.5 }, fitText(`Project ID ${t.projectId} · from the canonical model; dimensions in ${t.units}`, 2, width * 0.4), 2, 'end');
}

export const round = (v: number) => Math.round(v * 100) / 100;
