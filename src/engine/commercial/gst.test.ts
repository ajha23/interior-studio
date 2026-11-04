import { describe, it, expect } from 'vitest';
import { calculateQuotation, type QuotationLineItem } from './gst';

describe('Indian GST Commercial Engine (Step C)', () => {
  const sampleItems: QuotationLineItem[] = [
    {
      id: 'item_1',
      description: 'Modular Base & Wall Carcass (BWP Marine Ply 18mm)',
      code: '9403.40.00', // HSN Kitchen Furniture
      type: 'goods',
      quantity: 12.5, // 12.5 sq meters
      unit: 'sqm',
      unitRatePaise: 240000, // ₹2,400 per sqm = 30,000 INR = 3,000,000 paise
    },
    {
      id: 'item_2',
      description: 'Acrylic High-Gloss Shutters & Drawer Fronts',
      code: '9403.40.00',
      type: 'goods',
      quantity: 8.0,
      unit: 'sqm',
      unitRatePaise: 350000, // ₹3,500 per sqm = 28,000 INR = 2,800,000 paise
    },
    {
      id: 'item_3',
      description: 'Factory Hardware & German Soft-Close Hinges',
      code: '9403.90.00',
      type: 'goods',
      quantity: 1,
      unit: 'lump_sum',
      unitRatePaise: 1500000, // ₹15,000 = 1,500,000 paise
    },
    {
      id: 'item_4',
      description: 'On-Site Installation, Precision Alignment & Testing',
      code: '9954.79', // SAC Interior Fitting Services
      type: 'services',
      quantity: 1,
      unit: 'lump_sum',
      unitRatePaise: 1000000, // ₹10,000 = 1,000,000 paise
    },
  ];

  it('calculates intra-state tax split (CGST 9% + SGST 9%) correctly', () => {
    const quote = calculateQuotation('QT-2026-001', sampleItems, 'INTRA_STATE');

    // Total taxable: 30,000 + 28,000 + 15,000 + 10,000 = 83,000 INR = 8,300,000 paise
    expect(quote.totalTaxablePaise).toBe(8300000);

    // 18% GST on 8,300,000 = 1,494,000 paise (CGST: 747,000, SGST: 747,000)
    expect(quote.totalCgstPaise).toBe(747000);
    expect(quote.totalSgstPaise).toBe(747000);
    expect(quote.totalIgstPaise).toBe(0);
    expect(quote.totalTaxPaise).toBe(1494000);

    // Grand total: 8,300,000 + 1,494,000 = 9,794,000 paise = ₹97,940.00
    expect(quote.grandTotalPaise).toBe(9794000);

    // Verify HSN Summary split
    expect(quote.hsnSummary['9403.40.00']).toBeDefined();
    expect(quote.hsnSummary['9954.79']).toBeDefined();
    expect(quote.hsnSummary['9954.79']?.cgstPaise).toBe(90000); // 9% of ₹10,000
    expect(quote.hsnSummary['9954.79']?.sgstPaise).toBe(90000);
  });

  it('calculates inter-state IGST 18% correctly', () => {
    const quote = calculateQuotation('QT-2026-002', sampleItems, 'INTER_STATE');

    expect(quote.totalCgstPaise).toBe(0);
    expect(quote.totalSgstPaise).toBe(0);
    expect(quote.totalIgstPaise).toBe(1494000);
    expect(quote.grandTotalPaise).toBe(9794000);
  });
});
