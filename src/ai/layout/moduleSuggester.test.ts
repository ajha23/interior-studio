import { describe, it, expect } from 'vitest';
import { suggestModuleSequence } from './moduleSuggester';

describe('Standard Module Catalog Layout Suggester (AI-01)', () => {
  it('generates a kitchen sequence for a 3000mm wall including sink, drawers, and bases', () => {
    const res = suggestModuleSequence({
      wallLengthMm: 3000,
      categoryPreference: 'kitchen',
      includeSink: true,
      includeDrawers: true,
    });

    expect(res.modules.length).toBeGreaterThan(2);
    // 900 (sink) + 600 (drawer) + 600 (base) + 600 (base) + 300 (base) = 3000
    expect(res.totalOccupiedWidthMm).toBe(3000);
    expect(res.remainingFillerMm).toBe(0);
    expect(res.modules[0]?.moduleCode).toBe('SINK-BASE');
    expect(res.modules[1]?.moduleCode).toBe('DRAWER-3B');
  });

  it('calculates remaining filler when wall length is not an exact multiple', () => {
    const res = suggestModuleSequence({
      wallLengthMm: 2850,
      categoryPreference: 'kitchen',
    });

    // 900 + 600 + 600 + 600 = 2700, remaining filler = 150mm
    expect(res.totalOccupiedWidthMm).toBe(2700);
    expect(res.remainingFillerMm).toBe(150);
  });

  it('generates wardrobe modules for wardrobe requests', () => {
    const res = suggestModuleSequence({
      wallLengthMm: 3000,
      categoryPreference: 'wardrobe',
    });

    // 2x 1500mm sliding wardrobes = 3000mm
    expect(res.modules.length).toBe(2);
    expect(res.modules[0]?.moduleCode).toBe('WARDROBE-SLIDE');
    expect(res.totalOccupiedWidthMm).toBe(3000);
    expect(res.remainingFillerMm).toBe(0);
  });
});

