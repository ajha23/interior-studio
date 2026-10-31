/** Display helpers for millimetre values. */
const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function formatMm(value: number): string {
  return `${grouped.format(value)} mm`;
}

export function formatDims(d: { width: number; height: number; depth: number }): string {
  return `${d.width} × ${d.height} × ${d.depth} mm`;
}

/** Parses a user-typed length in millimetres. Returns null unless it is a whole number. */
export function parseMm(text: string): number | null {
  const cleaned = text.trim().replace(/\s*mm$/i, '').replace(/[,_\s]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}
