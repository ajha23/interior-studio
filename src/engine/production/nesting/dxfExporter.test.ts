import { describe, it, expect } from 'vitest';
import { exportSheetToDxf } from './dxfExporter';
import type { NestedSheet } from './types';

describe('dxfExporter', () => {
  const sampleSheet: NestedSheet = {
    sheetIndex: 1,
    material: '18mm Plywood',
    thickness: 18,
    boardLength: 2440,
    boardWidth: 1220,
    trimMargin: 10,
    kerf: 3.2,
    placements: [
      {
        panelId: 'p1',
        partName: 'Side',
        sheetIndex: 1,
        x: 10,
        y: 10,
        length: 720,
        width: 560,
        rotated: false,
        banding: '1 long',
        units: ['B1'],
      },
    ],
    offcuts: [
      {
        x: 733.2,
        y: 10,
        length: 1696,
        width: 1200,
        areaMm2: 2035200,
        isReusable: true,
      },
    ],
    usedAreaMm2: 403200,
    usableAreaMm2: 2904000,
    yieldPercentage: 13.88,
  };

  it('generates a valid AutoCAD R12 DXF string with required sections and layers', () => {
    const dxf = exportSheetToDxf(sampleSheet);

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('TABLES');
    expect(dxf).toContain('BOARD_OUTLINE');
    expect(dxf).toContain('PANEL_CUTS');
    expect(dxf).toContain('PART_LABELS');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('POLYLINE');
    expect(dxf).toContain('Side');
    expect(dxf).toContain('EOF');
  });

  it('includes coordinates for board boundary and panel vertices', () => {
    const dxf = exportSheetToDxf(sampleSheet);

    // Board length 2440 and width 1220
    expect(dxf).toContain('2440');
    expect(dxf).toContain('1220');

    // Panel placement x=10, y=10
    expect(dxf).toContain('10');
    expect(dxf).toContain('730'); // 10 + 720
    expect(dxf).toContain('570'); // 10 + 560
  });
});
