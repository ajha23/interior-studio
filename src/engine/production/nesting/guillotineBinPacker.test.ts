import { describe, it, expect } from 'vitest';
import { GuillotineBinPacker } from './guillotineBinPacker';
import type { InputNestingPanel, RawBoardStock } from './types';

describe('GuillotineBinPacker', () => {
  const standardBoard: RawBoardStock = {
    id: 'b1',
    material: '18mm Plywood',
    thickness: 18,
    length: 2440,
    width: 1220,
    trimMargin: 10,
    kerf: 3.2,
  };

  it('packs a single panel inside usable board margins', () => {
    const packer = new GuillotineBinPacker(standardBoard);
    const panel: InputNestingPanel = {
      id: 'p1',
      partName: 'Side',
      material: '18mm Plywood',
      thickness: 18,
      length: 720,
      width: 560,
      qty: 1,
      grain: 'none',
      banding: '1 long',
      units: ['B1'],
    };

    const placement = packer.pack(panel);
    expect(placement).not.toBeNull();
    expect(placement!.x).toBeGreaterThanOrEqual(10);
    expect(placement!.y).toBeGreaterThanOrEqual(10);
    expect(placement!.x + placement!.length).toBeLessThanOrEqual(2440 - 10);
    expect(placement!.y + placement!.width).toBeLessThanOrEqual(1220 - 10);
  });

  it('preserves lengthwise grain lock and forbids rotation', () => {
    const packer = new GuillotineBinPacker(standardBoard);
    const doorPanel: InputNestingPanel = {
      id: 'd1',
      partName: 'Door',
      material: '18mm Plywood',
      thickness: 18,
      length: 716,
      width: 596,
      qty: 1,
      grain: 'lengthwise',
      banding: 'all 4',
      units: ['B1'],
    };

    const placement = packer.pack(doorPanel);
    expect(placement).not.toBeNull();
    expect(placement!.rotated).toBe(false);
    expect(placement!.length).toBe(716);
    expect(placement!.width).toBe(596);
  });

  it('preserves saw kerf spacing between adjacent panels with zero geometric overlap', () => {
    const packer = new GuillotineBinPacker(standardBoard);
    const panels: InputNestingPanel[] = [
      {
        id: 'p1',
        partName: 'Side',
        material: '18mm Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 1,
        grain: 'none',
        banding: 'none',
        units: ['B1'],
      },
      {
        id: 'p2',
        partName: 'Side',
        material: '18mm Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 1,
        grain: 'none',
        banding: 'none',
        units: ['B1'],
      },
      {
        id: 'p3',
        partName: 'Side',
        material: '18mm Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 1,
        grain: 'none',
        banding: 'none',
        units: ['B1'],
      },
    ];

    const placements = [];
    for (const p of panels) {
      const placed = packer.pack(p);
      expect(placed).not.toBeNull();
      placements.push(placed!);
    }

    // Pairwise overlap check
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i]!;
        const b = placements[j]!;

        const separated =
          a.x + a.length + standardBoard.kerf <= b.x + 0.001 ||
          b.x + b.length + standardBoard.kerf <= a.x + 0.001 ||
          a.y + a.width + standardBoard.kerf <= b.y + 0.001 ||
          b.y + b.width + standardBoard.kerf <= a.y + 0.001;

        expect(separated).toBe(true);
      }
    }
  });

  it('rejects panels that exceed usable board area', () => {
    const packer = new GuillotineBinPacker(standardBoard);
    const oversized: InputNestingPanel = {
      id: 'huge',
      partName: 'Giant Panel',
      material: '18mm Plywood',
      thickness: 18,
      length: 2500, // usable length is 2420
      width: 600,
      qty: 1,
      grain: 'none',
      banding: 'none',
      units: ['X'],
    };

    const placed = packer.pack(oversized);
    expect(placed).toBeNull();
  });
});
