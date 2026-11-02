import { describe, it, expect } from 'vitest';
import { generateWorkshopHtmlReport } from './workshopReport';
import type { NestingResult } from './types';

describe('workshopReport', () => {
  const sampleResult: NestingResult = {
    sheets: [
      {
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
      },
    ],
    sheetsByMaterial: {
      '18mm Plywood (18mm)': [],
    },
    totalSheets: 1,
    totalPartAreaMm2: 403200,
    totalBoardAreaMm2: 2976800,
    netYieldPercentage: 13.54,
    reusableOffcuts: [
      {
        x: 733.2,
        y: 10,
        length: 1696,
        width: 1200,
        areaMm2: 2035200,
        isReusable: true,
      },
    ],
    unplacedPanels: [],
    calculatedAt: '2026-11-02T12:00:00.000Z',
  };

  it('generates a printable HTML report with project header and sheet cut lists', () => {
    const html = generateWorkshopHtmlReport(sampleResult, 'Villa Modular Kitchen');

    expect(html).toContain('Villa Modular Kitchen');
    expect(html).toContain('Sheet 1 of 1');
    expect(html).toContain('18mm Plywood');
    expect(html).toContain('Side');
    expect(html).toContain('720 × 560');
    expect(html).toContain('13.54%');
    expect(html).toContain('@media print');
  });
});
