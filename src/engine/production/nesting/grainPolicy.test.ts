import { describe, it, expect } from 'vitest';
import { inferGrainFromPart, canRotate, getOrientedDimensions } from './grainPolicy';
import type { InputNestingPanel } from './types';

describe('grainPolicy', () => {
  describe('inferGrainFromPart', () => {
    it('infers lengthwise grain for doors, drawer fronts, and shutters', () => {
      expect(inferGrainFromPart('Door')).toBe('lengthwise');
      expect(inferGrainFromPart('Drawer front')).toBe('lengthwise');
      expect(inferGrainFromPart('Tall unit shutter')).toBe('lengthwise');
      expect(inferGrainFromPart('Glass door frame')).toBe('lengthwise');
      expect(inferGrainFromPart('Blind panel')).toBe('lengthwise');
    });

    it('infers lengthwise grain when group is front regardless of name', () => {
      expect(inferGrainFromPart('Custom Panel', 'front')).toBe('lengthwise');
    });

    it('infers none for internal carcass components', () => {
      expect(inferGrainFromPart('Side')).toBe('none');
      expect(inferGrainFromPart('Top')).toBe('none');
      expect(inferGrainFromPart('Bottom')).toBe('none');
      expect(inferGrainFromPart('Shelf')).toBe('none');
      expect(inferGrainFromPart('Divider')).toBe('none');
      expect(inferGrainFromPart('Back')).toBe('none');
      expect(inferGrainFromPart('Plinth')).toBe('none');
    });
  });

  describe('canRotate', () => {
    it('allows 90° rotation when grain is none', () => {
      const panel: InputNestingPanel = {
        id: 'p1',
        partName: 'Side',
        material: 'Plywood',
        thickness: 18,
        length: 720,
        width: 560,
        qty: 1,
        grain: 'none',
        banding: '1 long',
        units: ['B1'],
      };
      expect(canRotate(panel)).toBe(true);
    });

    it('forbids rotation when grain is lengthwise or crosswise', () => {
      const panelLengthwise: InputNestingPanel = {
        id: 'p2',
        partName: 'Door',
        material: 'MDF',
        thickness: 18,
        length: 716,
        width: 596,
        qty: 1,
        grain: 'lengthwise',
        banding: 'all 4',
        units: ['B1'],
      };
      expect(canRotate(panelLengthwise)).toBe(false);

      const panelCrosswise: InputNestingPanel = {
        ...panelLengthwise,
        grain: 'crosswise',
      };
      expect(canRotate(panelCrosswise)).toBe(false);
    });
  });

  describe('getOrientedDimensions', () => {
    it('returns original dimensions when not rotated', () => {
      expect(getOrientedDimensions(720, 560, false)).toEqual({ length: 720, width: 560 });
    });

    it('swaps length and width when rotated', () => {
      expect(getOrientedDimensions(720, 560, true)).toEqual({ length: 560, width: 720 });
    });
  });
});
