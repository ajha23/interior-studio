/**
 * Canonical length unit: integer micrometres (µm).
 * The UI speaks millimetres; storage and geometry speak µm so that
 * repeated edits, sums and exports never accumulate float drift.
 */
export type Um = number;

export const UM_PER_MM = 1000;

/** Convert a user-entered millimetre value to canonical µm (rounded to 1 µm). */
export function mm(value: number): Um {
  if (!Number.isFinite(value)) throw new Error(`Invalid length: ${value}`);
  return Math.round(value * UM_PER_MM);
}

/** Convert canonical µm to millimetres for display. */
export function toMm(value: Um): number {
  return value / UM_PER_MM;
}

/** µm → metres, used only at the 3D rendering boundary. */
export function toM(value: Um): number {
  return value / 1_000_000;
}

/** Format µm as a millimetre string, e.g. 2400 or 2399.5 — never silently rounded beyond 0.1 mm. */
export function fmtMm(value: Um, withUnit = false): string {
  const v = Math.round(value / 100) / 10;
  const s = Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return withUnit ? `${s} mm` : s;
}

/** Plain mm number string without grouping (for inputs and CSV). */
export function plainMm(value: Um): string {
  const v = Math.round(value / 100) / 10;
  return String(v);
}

export function areaM2(a: Um, b: Um): number {
  return (a / 1_000_000) * (b / 1_000_000);
}

/** Split `total` into `n` integer parts that sum exactly to `total`; remainder goes to the last part. */
export function splitExact(total: Um, n: number): Um[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const parts = Array.from({ length: n }, () => base);
  parts[n - 1] += total - base * n;
  return parts;
}
