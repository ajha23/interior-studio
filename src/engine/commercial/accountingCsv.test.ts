import { describe, it, expect } from 'vitest';
import { calculateQuotation, type QuotationLineItem } from './gst';
import { generateAccountingCsv } from './accountingCsv';

describe('Accounting CSV Export (Tally / Zoho Books)', () => {
  const items: QuotationLineItem[] = [
    {
      id: 'it_base',
      description: 'Base Cabinets (18mm Carcass)',
      code: '9403',
      type: 'goods',
      quantity: 5,
      unit: 'nos',
      unitRatePaise: 1000000, // ₹10,000 each = ₹50,000
    },
    {
      id: 'it_install',
      description: 'Site Installation & Precision Alignment',
      code: '9954',
      type: 'services',
      quantity: 1,
      unit: 'lump_sum',
      unitRatePaise: 1250000, // ₹12,500
    },
  ];

  it('generates an Intra-State accounting CSV with CGST and SGST splits', () => {
    const quote = calculateQuotation('QT-ACC-01', items, 'INTRA_STATE');
    const csv = generateAccountingCsv(quote, {
      voucherNumber: 'INV-2026-0042',
      customerName: 'Rohit Sen',
      customerGstin: '29ABCDE1234F1Z5',
      placeOfSupply: '29-Karnataka',
    });

    expect(csv).toContain('Voucher Date,Voucher Type,Voucher Number,Customer Name');
    expect(csv).toContain('"INV-2026-0042"');
    expect(csv).toContain('"Rohit Sen"');
    expect(csv).toContain('"29ABCDE1234F1Z5"');
    expect(csv).toContain('"9403"');
    expect(csv).toContain('"9954"');

    // Taxable goods: ₹50,000.00 -> CGST 9% = 4500.00, SGST 9% = 4500.00, IGST = 0.00
    expect(csv).toContain('50000.00');
    expect(csv).toContain('4500.00');

    // Consolidated total
    expect(csv).toContain('"Consolidated Invoice Total"');
    expect(csv).toContain('62500.00'); // 50000 + 12500
    expect(csv).toContain('73750.00'); // 62500 + 18% tax (11250)
  });

  it('generates an Inter-State accounting CSV with IGST allocation', () => {
    const quote = calculateQuotation('QT-ACC-02', items, 'INTER_STATE');
    const csv = generateAccountingCsv(quote, {
      voucherNumber: 'INV-2026-0043',
      customerName: 'Kavita Menon',
      customerGstin: '33ABCDE1234F1Z5',
      placeOfSupply: '33-Tamil Nadu',
    });

    expect(csv).toContain('"33-Tamil Nadu"');
    // IGST 18% on ₹50,000 = 9000.00
    expect(csv).toContain('9000.00');
  });
});

