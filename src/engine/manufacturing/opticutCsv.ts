/**
 * OptiCut & Cut Rite Industrial 16-Column CSV Exporter.
 * Generates panel saw optimization files directly from a ManufacturingPackage.
 */

import { type ManufacturingPackage, type ManufacturingPart } from './explode';

export const OPTICUT_CSV_HEADERS = [
  'Module',
  'Part',
  'Material',
  'CuttingLength',
  'CuttingWidth',
  'Thickness',
  'Qty',
  'Grain',
  'EB_L1',
  'EB_L2',
  'EB_W1',
  'EB_W2',
  'Barcode',
  'DrillPattern',
  'Comments',
  'Project',
] as const;

function sanitizeCsv(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function determineDrillPattern(part: ManufacturingPart): string {
  if (part.holes.length === 0) return 'NONE';
  const hasHingeCup = part.holes.some((h) => h.diameter === 35);
  if (hasHingeCup) return 'HINGE-35MM';
  const hasSystem32 = part.holes.some((h) => h.diameter === 5);
  if (hasSystem32) return 'SYS32-LINE';
  return 'CUSTOM';
}

/**
 * Converts a ManufacturingPackage into a factory-standard 16-column CSV string.
 */
export function exportOptiCutCsv(pkg: ManufacturingPackage): string {
  const lines: string[] = [];

  // Header line
  lines.push(OPTICUT_CSV_HEADERS.join(','));

  for (const part of pkg.parts) {
    const drillPattern = determineDrillPattern(part);
    const barcode = `${pkg.projectCode}_${part.partId}`;
    const comment = `${part.name} [Fin: ${part.finishedLength}x${part.finishedWidth}]`;

    const row = [
      sanitizeCsv(part.moduleCode),
      sanitizeCsv(part.name),
      sanitizeCsv(part.material),
      part.cuttingLength.toString(),
      part.cuttingWidth.toString(),
      part.thickness.toString(),
      part.quantity.toString(),
      part.grain,
      sanitizeCsv(part.edgeBanding.l1 || ''),
      sanitizeCsv(part.edgeBanding.l2 || ''),
      sanitizeCsv(part.edgeBanding.w1 || ''),
      sanitizeCsv(part.edgeBanding.w2 || ''),
      sanitizeCsv(barcode),
      sanitizeCsv(drillPattern),
      sanitizeCsv(comment),
      sanitizeCsv(pkg.projectCode),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

