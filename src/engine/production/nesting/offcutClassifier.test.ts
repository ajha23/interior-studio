import { describe, it, expect } from 'vitest';
import { classifyOffcuts } from './offcutClassifier';
import type { FreeRectangle } from './guillotineBinPacker';

describe('offcutClassifier', () => {
  it('classifies rectangles >= 600x600 mm as reusable salvage offcuts', () => {
    const freeRects: FreeRectangle[] = [
      { x: 10, y: 10, length: 1200, width: 800 }, // 1200x800 >= 600x600 -> Reusable
      { x: 1220, y: 10, length: 600, width: 600 },  // Exactly 600x600 -> Reusable
      { x: 10, y: 820, length: 1200, width: 300 }, // 1200x300: width < 600 -> Scrap
      { x: 10, y: 1130, length: 450, width: 90 },   // Strip kerf -> Scrap
    ];

    const result = classifyOffcuts(freeRects, 600);

    expect(result.reusable).toHaveLength(2);
    expect(result.scrap).toHaveLength(2);

    expect(result.reusable[0]).toMatchObject({
      length: 1200,
      width: 800,
      isReusable: true,
    });
    expect(result.reusable[1]).toMatchObject({
      length: 600,
      width: 600,
      isReusable: true,
    });

    expect(result.scrap[0]).toMatchObject({
      length: 1200,
      width: 300,
      isReusable: false,
    });
    expect(result.scrap[1]).toMatchObject({
      length: 450,
      width: 90,
      isReusable: false,
    });

    expect(result.totalSalvageAreaMm2).toBe(1200 * 800 + 600 * 600);
    expect(result.totalScrapAreaMm2).toBe(1200 * 300 + 450 * 90);
  });
});
