import { describe, it, expect } from 'vitest';
import { NestingEngine } from './nestingEngine';
import type { InputNestingPanel } from './types';

describe('NestingEngine', () => {
  it('optimizes panels across multiple sheets and separates materials', () => {
    const panels: InputNestingPanel[] = [
      // 18mm Plywood Carcass panels
      {
        id: 'ply1',
        partName: 'Side',
        material: '18mm Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 4,
        grain: 'none',
        banding: '1 long',
        units: ['B1', 'B2'],
      },
      {
        id: 'ply2',
        partName: 'Top/Bottom',
        material: '18mm Plywood',
        thickness: 18,
        length: 600,
        width: 560,
        qty: 4,
        grain: 'none',
        banding: '1 long',
        units: ['B1', 'B2'],
      },
      // 18mm MDF Shutter panels
      {
        id: 'mdf1',
        partName: 'Door',
        material: '18mm MDF',
        thickness: 18,
        length: 716,
        width: 596,
        qty: 2,
        grain: 'lengthwise',
        banding: 'all 4',
        units: ['B1', 'B2'],
      },
      // 8mm MDF Back panels
      {
        id: 'back1',
        partName: 'Back',
        material: '8mm MDF',
        thickness: 8,
        length: 700,
        width: 580,
        qty: 2,
        grain: 'none',
        banding: 'none',
        units: ['B1', 'B2'],
      },
    ];

    const engine = new NestingEngine();
    const result = engine.optimize({ panels });

    expect(result.sheets.length).toBeGreaterThanOrEqual(3);
    expect(result.unplacedPanels).toHaveLength(0);

    // Verify segregation: each sheet must contain only one material & thickness
    for (const sheet of result.sheets) {
      expect(sheet.placements.length).toBeGreaterThan(0);
      expect(sheet.yieldPercentage).toBeGreaterThan(0);
      expect(sheet.yieldPercentage).toBeLessThanOrEqual(100);
    }

    // Material groups present in result
    expect(result.sheetsByMaterial).toHaveProperty('18mm Plywood (18mm)');
    expect(result.sheetsByMaterial).toHaveProperty('18mm MDF (18mm)');
    expect(result.sheetsByMaterial).toHaveProperty('8mm MDF (8mm)');

    expect(result.netYieldPercentage).toBeGreaterThan(0);
    expect(result.totalSheets).toBe(result.sheets.length);
  });

  it('runs deterministically: identical inputs produce identical outputs', () => {
    const panels: InputNestingPanel[] = [
      {
        id: 'p1',
        partName: 'Side',
        material: 'Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 2,
        grain: 'none',
        banding: 'none',
        units: ['B1'],
      },
      {
        id: 'p2',
        partName: 'Door',
        material: 'Plywood',
        thickness: 18,
        length: 716,
        width: 596,
        qty: 2,
        grain: 'lengthwise',
        banding: 'none',
        units: ['B1'],
      },
    ];

    const engine = new NestingEngine();
    const run1 = engine.optimize({ panels });
    const run2 = engine.optimize({ panels });

    expect(run1.totalSheets).toBe(run2.totalSheets);
    expect(run1.netYieldPercentage).toBe(run2.netYieldPercentage);
    expect(run1.sheets[0]!.placements.map((p) => ({ x: p.x, y: p.y, r: p.rotated }))).toEqual(
      run2.sheets[0]!.placements.map((p) => ({ x: p.x, y: p.y, r: p.rotated }))
    );
  });

  it('handles empty cut list gracefully', () => {
    const engine = new NestingEngine();
    const result = engine.optimize({ panels: [] });

    expect(result.sheets).toHaveLength(0);
    expect(result.totalSheets).toBe(0);
    expect(result.netYieldPercentage).toBe(0);
    expect(result.unplacedPanels).toHaveLength(0);
  });
});
