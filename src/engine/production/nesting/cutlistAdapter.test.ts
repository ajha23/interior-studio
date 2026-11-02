import { describe, it, expect } from 'vitest';
import { adaptCutListToNestingPanels, expandPanelsForNesting } from './cutlistAdapter';
import type { CutList } from '../cutlist';
import type { InputNestingPanel } from './types';

describe('cutlistAdapter', () => {
  const sampleCutList: CutList = {
    panels: [
      {
        part: 'Side',
        material: '18mm Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 2,
        banding: '1 long',
        units: ['B1'],
      },
      {
        part: 'Door',
        material: '18mm Acrylic',
        thickness: 18,
        length: 716,
        width: 596,
        qty: 1,
        banding: 'all 4',
        units: ['B1'],
      },
    ],
    glass: [],
    worktops: [],
    hardware: [],
    boards: [],
    bandingMetres: 4.8,
  };

  it('adapts PanelRows into InputNestingPanels with grain inference', () => {
    const panels = adaptCutListToNestingPanels(sampleCutList);
    expect(panels).toHaveLength(2);

    expect(panels[0]).toMatchObject({
      partName: 'Side',
      material: '18mm Plywood',
      grain: 'none',
      qty: 2,
    });

    expect(panels[1]).toMatchObject({
      partName: 'Door',
      material: '18mm Acrylic',
      grain: 'lengthwise',
      qty: 1,
    });
  });

  it('expands panel quantities into individual unit panels with deterministic IDs', () => {
    const input: InputNestingPanel[] = [
      {
        id: 'p1',
        partName: 'Side',
        material: 'Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 3,
        grain: 'none',
        banding: '1 long',
        units: ['B1'],
      },
      {
        id: 'p2',
        partName: 'Door',
        material: 'Plywood',
        thickness: 18,
        length: 716,
        width: 596,
        qty: 1,
        grain: 'lengthwise',
        banding: 'all 4',
        units: ['B1'],
      },
    ];

    const expanded = expandPanelsForNesting(input);
    expect(expanded).toHaveLength(4);
    expect(expanded.map((p) => p.id)).toEqual(['p1#1', 'p1#2', 'p1#3', 'p2']);
    expect(expanded.every((p) => p.qty === 1)).toBe(true);
  });
});
