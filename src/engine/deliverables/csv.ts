/**
 * CSV for spreadsheets and workshop software: UTF-8 with a byte-order mark (so Excel reads it as
 * UTF-8), CRLF line ends, every cell quoted when it contains a delimiter, quote or line break, and
 * formula-like cells prefixed so spreadsheets never execute them.
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
  // Cells starting with = + - @ would be formulas in a spreadsheet (CSV injection).
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header first (stable column names), then one line per row; revision goes in a column, not a comment. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
