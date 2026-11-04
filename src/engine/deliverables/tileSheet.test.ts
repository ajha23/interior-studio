import { describe, it, expect } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { calculateTileLayout, buildTileScheduleSheet } from './tileSheet';

describe('Tile Layout & Quantity Calculator Engine', () => {
  it('calculates net backsplash area, tile counts, and boxes needed', () => {
    const project = createProject({
      name: 'Tile Test Kitchen',
      room: { width: 3000, length: 2400, height: 2800, wallThickness: 150 },
      layout: 'empty',
    });

    // Place a base cabinet on back wall (3000mm length)
    project.cabinets = [
      {
        id: 'c1',
        type: 'base',
        wallId: 'back',
        dimensions: { width: 600, height: 720, depth: 560 },
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        materialId: 'mat_1',
        frontStyle: 'solid',
        interior: { sections: [] },
      },
    ];

    // No window openings
    const result = calculateTileLayout(project, {
      tileWidthMm: 300,
      tileHeightMm: 600,
      wastagePct: 10,
      tilesPerBox: 8,
      dadoHeightMm: 600,
    });

    // Back wall: 3000mm length * 600mm dado height = 1.80 m²
    expect(result.totalGrossAreaSqM).toBe(1.8);
    expect(result.totalDeductionsSqM).toBe(0);
    expect(result.totalNetAreaSqM).toBe(1.8);

    // Tile area: 0.3 * 0.6 = 0.18 m²
    expect(result.tileAreaSqM).toBe(0.18);
    // Raw count: 1.8 / 0.18 = 10 tiles
    expect(result.rawTileCount).toBe(10);
    // With 10% wastage: ceil(10 * 1.10) = 11 tiles
    expect(result.totalTileCountWithWastage).toBe(11);
    // Boxes needed: ceil(11 / 8) = 2 boxes
    expect(result.totalBoxesNeeded).toBe(2);
  });

  it('deducts window openings within the backsplash vertical dado band', () => {
    const project = createProject({
      name: 'Window Deduction Kitchen',
      room: { width: 3000, length: 2400, height: 2800, wallThickness: 150 },
      layout: 'empty',
    });

    project.cabinets = [
      {
        id: 'c1',
        type: 'base',
        wallId: 'back',
        dimensions: { width: 600, height: 720, depth: 560 },
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        materialId: 'mat_1',
        frontStyle: 'solid',
        interior: { sections: [] },
      },
    ];

    // Window on back wall: width 1000mm, sill 1000mm (which falls within 860..1460mm dado band), height 1200mm
    // Overlap: bottom 1000mm to top 1460mm = 460mm height
    // Deduction = 1000 * 460 / 1_000_000 = 0.46 m²
    project.openings = [
      {
        id: 'win_1',
        kind: 'window',
        wallId: 'back',
        offset: 500,
        width: 1000,
        height: 1200,
        sill: 1000,
        swing: 'none',
        hinge: 'left',
      },
    ];

    const result = calculateTileLayout(project, { dadoHeightMm: 600 });
    expect(result.totalGrossAreaSqM).toBe(1.8);
    expect(result.totalDeductionsSqM).toBe(0.46);
    expect(result.totalNetAreaSqM).toBe(1.34);
  });

  it('builds a printable tile schedule sheet', () => {
    const project = createProject({
      name: 'Tile Printable Kitchen',
      room: DEFAULT_ROOM,
      layout: 'empty',
    });

    const sheet = buildTileScheduleSheet(project, 'REV_TILE_01');
    expect(sheet.id).toBe('tile-schedule');
    expect(sheet.body.kind).toBe('table');
    if (sheet.body.kind === 'table') {
      expect(sheet.body.rows.length).toBeGreaterThan(0);
      expect(sheet.body.notes.length).toBeGreaterThan(0);
    }
  });
});
