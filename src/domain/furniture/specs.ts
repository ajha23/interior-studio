/**
 * Supported sizes. Cabinets accept any whole-millimetre width inside their type's range, with
 * `widths` as the standard module sizes that drags and the catalogue snap to (see DECISIONS D-008).
 * Appliances only come in their listed widths. Heights and depths are bounded ranges. Anything
 * else is rejected with a message naming what is supported, never silently adjusted.
 */
import type { ApplianceType, CabinetType, Dimensions, Millimeters } from '../schema';

export interface Range {
  min: Millimeters;
  max: Millimeters;
}

export interface ElementSpec {
  label: string;
  /** Floor units stand on a plinth or the floor; wall units hang at an elevation. */
  mount: 'floor' | 'wall';
  /** Standard sizes: the only widths for appliances; snap points for cabinets. */
  widths: readonly Millimeters[];
  /** Any width in this range is allowed (cabinets). Absent: only `widths` are allowed. */
  widthRange?: Range;
  height: Range;
  depth: Range;
  defaults: Dimensions;
  /** Default height of the element's bottom face above the floor. */
  elevation: Millimeters;
  /** Whether a worktop runs over this element. */
  supportsCountertop: boolean;
}

/** Height of the plinth (toe-kick) under floor-standing cabinets. */
export const PLINTH_HEIGHT = 100;
export const COUNTERTOP_THICKNESS = 40;
export const COUNTERTOP_OVERHANG = 20;
/** Top of a standard worktop: plinth + 720 mm carcass + 40 mm worktop. */
export const WORKTOP_TOP = PLINTH_HEIGHT + 720 + COUNTERTOP_THICKNESS;

const STANDARD_WIDTHS = [300, 400, 450, 500, 600, 800, 900, 1000, 1200] as const;

export const CABINET_SPECS: Record<CabinetType, ElementSpec> = {
  base: {
    label: 'Base cabinet',
    mount: 'floor',
    widths: STANDARD_WIDTHS,
    widthRange: { min: 150, max: 1200 },
    height: { min: 600, max: 900 },
    depth: { min: 300, max: 700 },
    defaults: { width: 600, height: 720, depth: 560 },
    elevation: PLINTH_HEIGHT,
    supportsCountertop: true,
  },
  drawer: {
    label: 'Drawer unit',
    mount: 'floor',
    widths: STANDARD_WIDTHS,
    widthRange: { min: 300, max: 1200 },
    height: { min: 600, max: 900 },
    depth: { min: 300, max: 700 },
    defaults: { width: 600, height: 720, depth: 560 },
    elevation: PLINTH_HEIGHT,
    supportsCountertop: true,
  },
  sink: {
    label: 'Sink unit',
    mount: 'floor',
    widths: [600, 800, 900, 1000, 1200],
    widthRange: { min: 600, max: 1200 },
    height: { min: 600, max: 900 },
    depth: { min: 500, max: 700 },
    defaults: { width: 800, height: 720, depth: 560 },
    elevation: PLINTH_HEIGHT,
    supportsCountertop: true,
  },
  corner: {
    label: 'Blind corner unit',
    mount: 'floor',
    widths: [900, 1000, 1200],
    widthRange: { min: 900, max: 1200 },
    height: { min: 600, max: 900 },
    depth: { min: 500, max: 700 },
    defaults: { width: 900, height: 720, depth: 560 },
    elevation: PLINTH_HEIGHT,
    supportsCountertop: true,
  },
  wall: {
    label: 'Wall cabinet',
    mount: 'wall',
    widths: STANDARD_WIDTHS,
    widthRange: { min: 150, max: 1200 },
    height: { min: 300, max: 1000 },
    depth: { min: 250, max: 450 },
    defaults: { width: 600, height: 720, depth: 350 },
    elevation: 1480,
    supportsCountertop: false,
  },
  tall: {
    label: 'Tall unit',
    mount: 'floor',
    widths: [400, 450, 500, 600, 800, 900],
    widthRange: { min: 300, max: 900 },
    height: { min: 1800, max: 2400 },
    depth: { min: 300, max: 700 },
    defaults: { width: 600, height: 2100, depth: 560 },
    elevation: PLINTH_HEIGHT,
    supportsCountertop: false,
  },
};

/** Appliances are placeholders with fixed heights and depths; only listed widths are offered. */
export const APPLIANCE_SPECS: Record<ApplianceType, ElementSpec> = {
  fridge: {
    label: 'Refrigerator',
    mount: 'floor',
    widths: [600, 700, 900],
    height: { min: 1800, max: 1800 },
    depth: { min: 650, max: 650 },
    defaults: { width: 700, height: 1800, depth: 650 },
    elevation: 0,
    supportsCountertop: false,
  },
  range: {
    label: 'Range cooker',
    mount: 'floor',
    widths: [600, 900],
    height: { min: WORKTOP_TOP, max: WORKTOP_TOP },
    depth: { min: 600, max: 600 },
    defaults: { width: 600, height: WORKTOP_TOP, depth: 600 },
    elevation: 0,
    supportsCountertop: false,
  },
  dishwasher: {
    label: 'Dishwasher',
    mount: 'floor',
    widths: [450, 600],
    height: { min: WORKTOP_TOP - COUNTERTOP_THICKNESS, max: WORKTOP_TOP - COUNTERTOP_THICKNESS },
    depth: { min: 560, max: 560 },
    defaults: { width: 600, height: WORKTOP_TOP - COUNTERTOP_THICKNESS, depth: 560 },
    elevation: 0,
    supportsCountertop: true,
  },
  hood: {
    label: 'Cooker hood',
    mount: 'wall',
    widths: [600, 900],
    height: { min: 690, max: 690 },
    depth: { min: 500, max: 500 },
    defaults: { width: 600, height: 690, depth: 500 },
    elevation: 1510,
    supportsCountertop: false,
  },
};

export function specFor(kind: 'cabinet', type: CabinetType): ElementSpec;
export function specFor(kind: 'appliance', type: ApplianceType): ElementSpec;
export function specFor(kind: 'cabinet' | 'appliance', type: CabinetType | ApplianceType): ElementSpec;
export function specFor(kind: 'cabinet' | 'appliance', type: CabinetType | ApplianceType): ElementSpec {
  return kind === 'cabinet' ? CABINET_SPECS[type as CabinetType] : APPLIANCE_SPECS[type as ApplianceType];
}

/** Every reason these dimensions are not a supported module; empty when they are. */
export function dimensionErrors(spec: ElementSpec, dims: Dimensions): string[] {
  const errors: string[] = [];
  const name = spec.label.toLowerCase();
  if (spec.widthRange) {
    if (dims.width < spec.widthRange.min || dims.width > spec.widthRange.max) {
      errors.push(`Width ${dims.width} mm is outside the ${name} range ${spec.widthRange.min}–${spec.widthRange.max} mm.`);
    }
  } else if (!spec.widths.includes(dims.width)) {
    errors.push(`Width ${dims.width} mm is not a supported ${name} size. Supported widths: ${spec.widths.join(', ')} mm.`);
  }
  const range = (label: string, value: number, r: Range) => {
    if (value < r.min || value > r.max) {
      errors.push(
        r.min === r.max
          ? `${label} of a ${name} is fixed at ${r.min} mm (got ${value} mm).`
          : `${label} ${value} mm is outside the ${name} range ${r.min}–${r.max} mm.`,
      );
    }
  };
  range('Height', dims.height, spec.height);
  range('Depth', dims.depth, spec.depth);
  return errors;
}
