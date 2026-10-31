/**
 * Lengths in any unit, stored in millimetres.
 *
 * Storage policy: the domain stores whole millimetres. Entry is converted exactly first
 * (1 in = 25.4 mm, 1 ft = 304.8 mm), then rounded once to the nearest millimetre, halves away from
 * zero. So 100 cm → 1000 mm, 12 ft → 3657.6 mm → 3658 mm, 12 ft 6 in → 3810 mm.
 *
 * Display: metric values show to their natural precision (cm 0.1, m 0.001); imperial values show to
 * the nearest 1/16". Display never changes the stored value; editing a field rounds what was typed.
 * Bare numbers use the display unit, except in feet-and-inches mode where (as in CAD) they are inches.
 */

export const LENGTH_UNITS = ['mm', 'cm', 'm', 'in', 'ft', 'ft-in'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const UNIT_LABEL: Record<LengthUnit, string> = {
  mm: 'Millimetres (mm)',
  cm: 'Centimetres (cm)',
  m: 'Metres (m)',
  in: 'Inches (in)',
  ft: 'Feet (ft)',
  'ft-in': 'Feet & inches',
};

const MM_PER: Record<Exclude<LengthUnit, 'ft-in'>, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export function toMm(value: number, unit: Exclude<LengthUnit, 'ft-in'>): number {
  return value * MM_PER[unit];
}

/** The storage policy: nearest whole millimetre, halves away from zero. */
export function toStoredMm(exact: number): number {
  return Math.sign(exact) * Math.round(Math.abs(exact));
}

const UNIT_WORDS: [RegExp, Exclude<LengthUnit, 'ft-in'>][] = [
  [/^(mm|millimet(er|re)s?)$/, 'mm'],
  [/^(cm|centimet(er|re)s?)$/, 'cm'],
  [/^(m|met(er|re)s?)$/, 'm'],
  [/^(in|inch|inches|"|'')$/, 'in'],
  [/^(ft|foot|feet|')$/, 'ft'],
];

function unitOf(word: string): Exclude<LengthUnit, 'ft-in'> | null {
  for (const [re, unit] of UNIT_WORDS) if (re.test(word)) return unit;
  return null;
}

export type ParsedLength = { ok: true; exactMm: number; mm: number } | { ok: false; error: string };

/**
 * Parses "1500", "1,500 mm", "381 cm", "3.81 m", "150 in", "12 ft", "12' 6\"", "12'-6 1/2\"",
 * "12 ft 6 in". `allowNegative` is for relative moves only.
 */
export function parseLength(text: string, defaultUnit: LengthUnit, allowNegative = false): ParsedLength {
  let s = text.trim().toLowerCase();
  if (!s) return { ok: false, error: 'Enter a length.' };
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();
  // "1,500" is a thousands separator; "1,5" is a decimal comma.
  s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
  // Feet-inch dash ("12'-6") is a separator, not a minus.
  s = s.replace(/'\s*-\s*/g, "' ");
  // Fractions first, so "6 1/2" and "1/2" are read whole rather than as "6" or "1".
  const term = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(millimet(?:er|re)s?|mm|centimet(?:er|re)s?|cm|met(?:er|re)s?|m|inches|inch|in|''|"|feet|foot|ft|')?\s*/y;
  const terms: { value: number; unit: Exclude<LengthUnit, 'ft-in'> | null }[] = [];
  let at = 0;
  while (at < s.length) {
    term.lastIndex = at;
    const m = term.exec(s);
    if (!m || m[0].length === 0) return { ok: false, error: `“${text.trim()}” is not a length. Try 1500, 381 cm, 3.81 m or 12' 6".` };
    const [whole, frac] = m[1]!.includes('/') ? splitFraction(m[1]!) : [Number(m[1]), 0];
    terms.push({ value: whole + frac, unit: m[2] ? unitOf(m[2]) : null });
    at = term.lastIndex;
  }
  let exact = 0;
  terms.forEach((t, i) => {
    let unit = t.unit;
    if (!unit) {
      // A bare number after feet is inches (12' 6); otherwise it takes the display unit.
      if (i > 0 && terms[i - 1]!.unit === 'ft') unit = 'in';
      else unit = defaultUnit === 'ft-in' ? 'in' : defaultUnit;
    }
    exact += toMm(t.value, unit);
  });
  const feetThenInches = terms.length === 2 && terms[0]!.unit === 'ft' && (terms[1]!.unit === 'in' || terms[1]!.unit === null);
  if (terms.length > 1 && !feetThenInches) {
    return { ok: false, error: 'Combine feet and inches only, e.g. 12\' 6".' };
  }
  exact *= sign;
  if (!Number.isFinite(exact)) return { ok: false, error: 'That length is too large.' };
  if (exact < 0 && !allowNegative) return { ok: false, error: 'Lengths cannot be negative.' };
  return { ok: true, exactMm: exact, mm: toStoredMm(exact) };
}

function splitFraction(token: string): [number, number] {
  const parts = token.trim().split(/\s+/);
  const fraction = parts.pop()!;
  const [n, d] = fraction.split('/').map(Number) as [number, number];
  const whole = parts.length ? Number(parts[0]) : 0;
  return [whole, d ? n / d : NaN];
}

const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));

/** Inches as "w n/d", to the nearest 1/16. */
function inchesText(inches: number): { whole: number; text: string } {
  let sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  sixteenths -= whole * 16;
  if (!sixteenths) return { whole, text: `${whole}` };
  let n = sixteenths;
  let d = 16;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return { whole, text: whole ? `${whole} ${n}/${d}` : `${n}/${d}` };
}

/**
 * A length for display. `bare` omits the unit for metric, inches and feet (for fields that show the
 * unit separately); feet-and-inches always carries its ' and " marks.
 */
export function formatLength(mm: number, unit: LengthUnit, bare = false): string {
  const sign = mm < 0 ? '-' : '';
  const a = Math.abs(mm);
  const suffix = (s: string) => (bare ? '' : s);
  switch (unit) {
    case 'mm':
      return `${sign}${bare ? String(Math.round(a)) : grouped.format(a)}${suffix(' mm')}`;
    case 'cm':
      return `${sign}${trim(a / 10, 1)}${suffix(' cm')}`;
    case 'm':
      return `${sign}${trim(a / 1000, 3)}${suffix(' m')}`;
    case 'in':
      return `${sign}${inchesText(a / 25.4).text}${suffix('"')}`;
    case 'ft':
      return `${sign}${trim(a / 304.8, 2)}${suffix(' ft')}`;
    case 'ft-in': {
      const totalSixteenths = Math.round((a / 25.4) * 16);
      const feet = Math.floor(totalSixteenths / (12 * 16));
      const inches = inchesText((totalSixteenths - feet * 12 * 16) / 16).text;
      return `${sign}${feet ? `${feet}' ` : ''}${inches}"`;
    }
  }
}

export function formatDimsIn(d: { width: number; height: number; depth: number }, unit: LengthUnit): string {
  if (unit === 'mm') return `${d.width} × ${d.height} × ${d.depth}`;
  return [d.width, d.height, d.depth].map((v) => formatLength(v, unit, unit !== 'ft-in')).join(' × ') + (unit === 'ft-in' ? '' : ` ${unit}`);
}

/** The short unit shown beside a field ("" for feet-and-inches, whose values carry ' and "). */
export function unitSuffix(unit: LengthUnit): string {
  return unit === 'ft-in' ? '' : unit === 'in' ? 'in' : unit;
}
