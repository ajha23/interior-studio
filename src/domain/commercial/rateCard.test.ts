import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_CARD_V1, RateCardSchema } from './rateCard';
import { calculateQuotation, type QuotationLineItem } from '../../engine/commercial/gst';

describe('COST-01 Rate Card Versioning & Pricing Snapshotting', () => {
  it('parses valid rate card schema with integer paise', () => {
    const parsed = RateCardSchema.parse(DEFAULT_RATE_CARD_V1);
    expect(parsed.id).toBe('ratecard-studio-standard-v1');
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.currency).toBe('INR');
    expect(parsed.carcassRatePerSqMPaise).toBe(185000);
    expect(parsed.shutterRatesPerSqMPaise.acrylic).toBe(280000);
  });

  it('rejects negative rates or invalid margins', () => {
    expect(() =>
      RateCardSchema.parse({
        ...DEFAULT_RATE_CARD_V1,
        carcassRatePerSqMPaise: -100,
      })
    ).toThrow();

    expect(() =>
      RateCardSchema.parse({
        ...DEFAULT_RATE_CARD_V1,
        standardMarginPercent: 120, // >100%
      })
    ).toThrow();
  });

  it('snapshots rate card identity into CommercialQuotation', () => {
    const items: QuotationLineItem[] = [
      {
        id: 'carcass_pkg',
        description: 'Base Cabinets (18mm)',
        code: '9403',
        type: 'goods',
        quantity: 5,
        unit: 'sqm',
        unitRatePaise: DEFAULT_RATE_CARD_V1.carcassRatePerSqMPaise,
      },
    ];

    const quote = calculateQuotation('Q-2026-001', items, 'INTRA_STATE', {
      id: DEFAULT_RATE_CARD_V1.id,
      version: DEFAULT_RATE_CARD_V1.version,
    });

    expect(quote.rateCardId).toBe('ratecard-studio-standard-v1');
    expect(quote.rateCardVersion).toBe('1.0.0');
    expect(quote.grandTotalPaise).toBeGreaterThan(0);
  });
});
