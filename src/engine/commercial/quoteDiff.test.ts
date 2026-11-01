import { describe, it, expect } from 'vitest';
import { calculateQuotation, type QuotationLineItem } from './gst';
import { diffQuotes, calculateFinishOptionDelta } from './quoteDiff';

describe('Quote Revision Diffing & Option Pricing Engine', () => {
  it('correctly categorizes added, removed, modified, and unchanged items', () => {
    const itemsV1: QuotationLineItem[] = [
      {
        id: 'item_base_carcass',
        description: 'Base Cabinets Carcass',
        code: '9403',
        type: 'goods',
        quantity: 5,
        unit: 'nos',
        unitRatePaise: 500000, // ₹5,000 each = ₹25,000
      },
      {
        id: 'item_wall_carcass',
        description: 'Wall Cabinets Carcass',
        code: '9403',
        type: 'goods',
        quantity: 3,
        unit: 'nos',
        unitRatePaise: 400000, // ₹4,000 each = ₹12,000
      },
      {
        id: 'item_installation',
        description: 'Site Installation & Alignment',
        code: '9954',
        type: 'services',
        quantity: 1,
        unit: 'lump_sum',
        unitRatePaise: 500000, // ₹5,000
      },
    ];

    const itemsV2: QuotationLineItem[] = [
      {
        id: 'item_base_carcass',
        description: 'Base Cabinets Carcass',
        code: '9403',
        type: 'goods',
        quantity: 7, // Modified: Increased from 5 to 7 (+₹10,000)
        unit: 'nos',
        unitRatePaise: 500000,
      },
      // Removed: item_wall_carcass (-₹12,000)
      {
        id: 'item_installation',
        description: 'Site Installation & Alignment',
        code: '9954',
        type: 'services',
        quantity: 1, // Unchanged
        unit: 'lump_sum',
        unitRatePaise: 500000,
      },
      {
        id: 'item_tall_pantry',
        description: 'Tall Pantry Unit',
        code: '9403',
        type: 'goods',
        quantity: 1, // Added: +₹15,000
        unit: 'nos',
        unitRatePaise: 1500000,
      },
    ];

    const quoteV1 = calculateQuotation('QT-REV-01', itemsV1, 'INTRA_STATE');
    const quoteV2 = calculateQuotation('QT-REV-02', itemsV2, 'INTRA_STATE');

    const diff = diffQuotes(quoteV1, quoteV2);

    expect(diff.fromRevision).toBe('QT-REV-01');
    expect(diff.toRevision).toBe('QT-REV-02');

    expect(diff.addedItems.length).toBe(1);
    expect(diff.addedItems[0]?.id).toBe('item_tall_pantry');

    expect(diff.removedItems.length).toBe(1);
    expect(diff.removedItems[0]?.id).toBe('item_wall_carcass');

    expect(diff.modifiedItems.length).toBe(1);
    expect(diff.modifiedItems[0]?.id).toBe('item_base_carcass');
    expect(diff.modifiedItems[0]?.oldQuantity).toBe(5);
    expect(diff.modifiedItems[0]?.newQuantity).toBe(7);
    expect(diff.modifiedItems[0]?.deltaPaise).toBe(1000000); // +₹10,000

    expect(diff.unchangedItems.length).toBe(1);
    expect(diff.unchangedItems[0]?.id).toBe('item_installation');

    // Net taxable change: +15,000 (tall) - 12,000 (wall) + 10,000 (base) = +13,000 (+1,300,000 paise)
    expect(diff.subtotalDeltaPaise).toBe(1300000);
    // GST 18% on +13,000 = +2,340 (+234,000 paise)
    expect(diff.taxDeltaPaise).toBe(234000);
    // Grand total: +15,340 (+1,534,000 paise)
    expect(diff.grandTotalDeltaPaise).toBe(1534000);
    expect(diff.formatted.grandTotalDelta).toContain('+₹15,340.00');
  });

  it('calculates finish option pricing delta accurately', () => {
    // 12 sqm shutters: Laminate @ ₹1,200/sqm vs Acrylic @ ₹2,800/sqm
    const res = calculateFinishOptionDelta(12, 120000, 280000);
    // Cost A = 12 * 120,000 = 1,440,000 paise (₹14,400)
    // Cost B = 12 * 280,000 = 3,360,000 paise (₹33,600)
    // Delta = +1,920,000 paise (+₹19,200)
    expect(res.deltaPaise).toBe(1920000);
    expect(res.formattedDelta).toContain('+₹19,200.00');
  });
});

