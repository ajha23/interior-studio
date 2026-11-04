import { describe, it, expect } from 'vitest';
import { exportOptiCutCsv, OPTICUT_CSV_HEADERS } from './opticutCsv';
import { explodeScene } from './explode';
import { SEED_RULE_PACK_V1 } from '../../domain/manufacturing/rulePack';

describe('OptiCut 16-Column CSV Exporter (Step B)', () => {
  it('generates a valid 16-column CSV from an exploded manufacturing package', () => {
    const scene = [
      { id: 'cab_01', type: 'base', dimensions: { width: 600, height: 720, depth: 560 } },
    ];
    const pkg = explodeScene(scene, SEED_RULE_PACK_V1, 'DR_RAHUL_KITCHEN');
    const csv = exportOptiCutCsv(pkg);

    const rows = csv.split('\r\n');
    expect(rows.length).toBeGreaterThan(1);

    // Verify Header
    const headerCols = (rows[0] ?? '').split(',');
    expect(headerCols.length).toBe(16);
    expect(headerCols).toEqual(OPTICUT_CSV_HEADERS);

    // Verify Row 1
    const row1Cols = (rows[1] ?? '').split(',');
    expect(row1Cols.length).toBe(16);
    expect(row1Cols[15]).toBe('DR_RAHUL_KITCHEN'); // Project name
  });
});
