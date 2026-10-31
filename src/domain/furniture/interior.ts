/**
 * Cabinet interiors: inside dimensions, section widths, fitting rules and presets.
 *
 * The carcass is 18 mm panels with an 8 mm back. Inside the carcass, sections are separated by
 * 18 mm dividers. Fittings sit in a section at `y` above the inside floor. Nothing here moves a
 * fitting by itself: edits that would make the interior invalid are rejected with a message.
 */
import type { CabinetType, Dimensions, Fitting, FittingKind, FrontStyle, Interior, KitchenCabinet, Section } from '../schema';

export const PANEL = 18;
export const BACK_PANEL = 8;
export const FRONT_THICKNESS = 18;
export const SHELF_THICKNESS = 18;
export const GLASS_SHELF_THICKNESS = 8;
export const RAIL_HEIGHT = 30;
export const MIN_SECTION_WIDTH = 100;

export const FITTING_LABEL: Record<FittingKind, string> = {
  shelf: 'Shelf',
  drawer: 'Internal drawer',
  rail: 'Hanging rail',
  'plate-rack': 'Plate rack',
  'bottle-rack': 'Bottle rack',
  basket: 'Pull-out basket',
};

/** Minimum and default heights for fittings that have one. */
export const FITTING_HEIGHT: Partial<Record<FittingKind, { min: number; default: number }>> = {
  drawer: { min: 80, default: 150 },
  'plate-rack': { min: 150, default: 280 },
  'bottle-rack': { min: 200, default: 400 },
  basket: { min: 60, default: 120 },
};

export function insideOf(dims: Dimensions): { width: number; height: number; depth: number } {
  return { width: dims.width - 2 * PANEL, height: dims.height - 2 * PANEL, depth: dims.depth - FRONT_THICKNESS - BACK_PANEL };
}

/** Vertical extent [bottom, top] of a fitting above the inside floor. */
export function fittingSpan(f: Fitting): [number, number] {
  switch (f.kind) {
    case 'shelf':
      return [f.y, f.y + (f.glass ? GLASS_SHELF_THICKNESS : SHELF_THICKNESS)];
    case 'rail':
      return [f.y, f.y + RAIL_HEIGHT];
    default:
      return [f.y, f.y + f.height];
  }
}

export function fittingName(f: Fitting): string {
  return f.kind === 'shelf' && f.glass ? 'Glass shelf' : FITTING_LABEL[f.kind];
}

/** Widths of each section in millimetres, or the reason they do not fit. */
export function sectionWidths(interior: Interior, insideWidth: number): { widths: number[] } | { error: string } {
  const n = interior.sections.length;
  const available = insideWidth - (n - 1) * PANEL;
  const fixed = interior.sections.reduce((s, sec) => s + (sec.width ?? 0), 0);
  const autos = interior.sections.filter((sec) => sec.width === null).length;
  if (autos === 0) {
    if (fixed !== available) return { error: `Section widths add up to ${fixed} mm but the inside is ${available} mm wide (after ${n - 1} divider${n === 2 ? '' : 's'}). Set one section to Auto.` };
    return { widths: interior.sections.map((sec) => sec.width!) };
  }
  const auto = (available - fixed) / autos;
  if (auto < MIN_SECTION_WIDTH) return { error: `Sections are too narrow: ${Math.floor(auto)} mm left for auto sections (minimum ${MIN_SECTION_WIDTH} mm).` };
  return { widths: interior.sections.map((sec) => sec.width ?? auto) };
}

/** Every reason this cabinet's interior and front style are not valid; empty when they are. */
export function interiorErrors(cabinet: Pick<KitchenCabinet, 'type' | 'dimensions' | 'interior' | 'frontStyle'>): string[] {
  const errors: string[] = [];
  if (cabinet.type === 'drawer') {
    if (cabinet.frontStyle !== 'solid') errors.push('A drawer unit always has solid drawer fronts.');
    if (cabinet.interior.sections.some((s) => s.fittings.length)) errors.push('A drawer unit has no interior fittings; its drawers are its fronts.');
    return errors;
  }
  const inside = insideOf(cabinet.dimensions);
  const widths = sectionWidths(cabinet.interior, inside.width);
  if ('error' in widths) errors.push(widths.error);
  else widths.widths.forEach((w, i) => w < MIN_SECTION_WIDTH && errors.push(`Section ${i + 1} is ${Math.round(w)} mm wide (minimum ${MIN_SECTION_WIDTH} mm).`));

  cabinet.interior.sections.forEach((section, si) => {
    const where = cabinet.interior.sections.length > 1 ? ` in section ${si + 1}` : '';
    const spans = section.fittings.map((f) => ({ f, span: fittingSpan(f) })).sort((a, b) => a.span[0] - b.span[0]);
    for (const { f, span } of spans) {
      const min = FITTING_HEIGHT[f.kind]?.min;
      if (min !== undefined && span[1] - span[0] < min) errors.push(`${fittingName(f)}${where} must be at least ${min} mm high.`);
      if (span[1] > inside.height) errors.push(`${fittingName(f)} at ${f.y} mm${where} does not fit inside: its top would be at ${span[1]} mm but the inside is ${inside.height} mm high.`);
    }
    for (let i = 1; i < spans.length; i++) {
      const a = spans[i - 1]!;
      const b = spans[i]!;
      if (b.span[0] < a.span[1]) errors.push(`${fittingName(b.f)} at ${b.f.y} mm overlaps ${fittingName(a.f).toLowerCase()} at ${a.f.y} mm${where}.`);
    }
  });
  return errors;
}

/** `count` shelves spaced evenly over the inside height (equal gaps above, between and below). */
export function evenShelves(insideHeight: number, count: number, glass = false): Fitting[] {
  const t = glass ? GLASS_SHELF_THICKNESS : SHELF_THICKNESS;
  const gap = (insideHeight - count * t) / (count + 1);
  return Array.from({ length: count }, (_, i) => ({ kind: 'shelf' as const, y: Math.round(((i + 1) * gap + i * t) / 5) * 5, glass }));
}

export const INTERIOR_PRESETS = ['shelves', 'crockery', 'drawers', 'wardrobe', 'pantry', 'bottles', 'split', 'empty'] as const;
export type InteriorPreset = (typeof INTERIOR_PRESETS)[number];

export const PRESET_LABEL: Record<InteriorPreset, string> = {
  shelves: 'Shelves',
  crockery: 'Crockery unit',
  drawers: 'Internal drawers',
  wardrobe: 'Wardrobe',
  pantry: 'Pantry baskets',
  bottles: 'Bottle rack',
  split: 'Split + shelves',
  empty: 'Empty',
};

const single = (fittings: Fitting[]): Interior => ({ sections: [{ width: null, fittings }] });

/**
 * Builds a preset interior sized for these dimensions. `count` is the number of shelves for
 * `shelves`. Returns the interior and the front style the preset implies (crockery → glass).
 */
export function interiorPreset(type: CabinetType, dims: Dimensions, preset: InteriorPreset, count = 2): { interior: Interior; frontStyle?: FrontStyle } {
  if (type === 'drawer') return { interior: single([]) };
  const h = insideOf(dims).height;
  const above = (from: number, n: number, glass = false) => evenShelves(h - from, n, glass).map((s) => ({ ...s, y: s.y + from }));
  switch (preset) {
    case 'empty':
      return { interior: single([]) };
    case 'shelves':
      return { interior: single(evenShelves(h, Math.max(1, Math.min(12, count)))) };
    case 'crockery': {
      const rack = Math.min(FITTING_HEIGHT['plate-rack']!.default, Math.max(150, Math.round(h * 0.4)));
      const glassShelves = h - rack > 250 ? above(rack, h - rack > 600 ? 2 : 1, true) : [];
      return { interior: single([{ kind: 'plate-rack', y: 0, height: rack }, ...glassShelves]), frontStyle: 'glass' };
    }
    case 'drawers': {
      const n = Math.max(1, Math.min(4, Math.floor((h * 0.6) / 160)));
      const drawers: Fitting[] = Array.from({ length: n }, (_, i) => ({ kind: 'drawer', y: i * 160, height: 150 }));
      const top = n * 160;
      return { interior: single(h - top > 250 ? [...drawers, ...above(top, 1)] : drawers) };
    }
    case 'wardrobe': {
      if (h < 1000) return { interior: single(evenShelves(h, 1)) };
      const shelfY = h - 320;
      return { interior: single([{ kind: 'shelf', y: shelfY, glass: false }, { kind: 'rail', y: shelfY - 70 }]) };
    }
    case 'pantry': {
      const n = Math.max(1, Math.min(8, Math.floor(h / 260)));
      const pitch = h / n;
      return { interior: single(Array.from({ length: n }, (_, i) => ({ kind: 'basket' as const, y: Math.round((i * pitch + 20) / 5) * 5, height: 120 }))) };
    }
    case 'bottles': {
      const rack = Math.min(h, Math.max(200, Math.min(600, Math.round(h * 0.6))));
      return { interior: single(h - rack > 250 ? [{ kind: 'bottle-rack', y: 0, height: rack }, ...above(rack, 1)] : [{ kind: 'bottle-rack', y: 0, height: rack }]) };
    }
    case 'split': {
      const n = h > 1200 ? 4 : h > 500 ? 2 : 1;
      return { interior: { sections: [{ width: null, fittings: evenShelves(h, n) }, { width: null, fittings: evenShelves(h, n) }] } };
    }
  }
}

/** Interior a new cabinet of this type starts with. */
export function defaultInterior(type: CabinetType, dims: Dimensions): Interior {
  switch (type) {
    case 'sink':
    case 'drawer':
      return single([]);
    case 'wall':
      return interiorPreset(type, dims, 'shelves', 2).interior;
    case 'tall':
      return interiorPreset(type, dims, 'shelves', 4).interior;
    default:
      return interiorPreset(type, dims, 'shelves', 1).interior;
  }
}

/** Vertical size a new fitting of this kind takes. */
export function newFittingHeight(kind: FittingKind, glass = false): number {
  if (kind === 'shelf') return glass ? GLASS_SHELF_THICKNESS : SHELF_THICKNESS;
  if (kind === 'rail') return RAIL_HEIGHT;
  return FITTING_HEIGHT[kind]!.default;
}

/**
 * A new fitting placed in the largest free gap of a section: shelves and rails in the middle of
 * the gap, everything else on the gap's floor. Null when nothing that size fits.
 */
export function newFitting(section: Section, kind: FittingKind, insideHeight: number, glass = false): Fitting | null {
  const size = newFittingHeight(kind, glass);
  const spans = section.fittings.map(fittingSpan).sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let floor = 0;
  for (const [lo, hi] of spans) {
    if (lo > floor) gaps.push([floor, lo]);
    floor = Math.max(floor, hi);
  }
  if (insideHeight > floor) gaps.push([floor, insideHeight]);
  const gap = gaps.filter(([lo, hi]) => hi - lo >= size).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (!gap) return null;
  const middle = Math.round((gap[0] + (gap[1] - gap[0] - size) / 2) / 5) * 5;
  switch (kind) {
    case 'shelf':
      return { kind, y: middle, glass };
    case 'rail':
      return { kind, y: middle };
    default:
      return { kind, y: gap[0], height: size };
  }
}
