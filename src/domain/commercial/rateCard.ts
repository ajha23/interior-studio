import { z } from 'zod';

export const RateCardSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  effectiveDate: z.string(),
  currency: z.literal('INR').default('INR'),
  carcassRatePerSqMPaise: z.number().int().min(0),
  shutterRatesPerSqMPaise: z.record(z.string(), z.number().int().min(0)),
  edgeBandingRatePerMeterPaise: z.number().int().min(0),
  installationRatePerSqMPaise: z.number().int().min(0),
  standardMarginPercent: z.number().min(0).max(100),
});
export type RateCard = z.infer<typeof RateCardSchema>;

export const DEFAULT_RATE_CARD_V1: RateCard = {
  id: 'ratecard-studio-standard-v1',
  version: '1.0.0',
  name: 'Standard Studio Rate Card 2026',
  effectiveDate: '2026-01-01T00:00:00.000Z',
  currency: 'INR',
  carcassRatePerSqMPaise: 185000, // ₹1,850/sqm
  shutterRatesPerSqMPaise: {
    lam: 120000,      // ₹1,200/sqm (1.0mm Matte Laminate)
    acrylic: 280000,  // ₹2,800/sqm (2.0mm High-Gloss Acrylic)
    pu_matte: 360000, // ₹3,600/sqm (PU Matte Lacquer)
    glass: 500000,    // ₹5,000/sqm (Fluted Glass Profile)
  },
  edgeBandingRatePerMeterPaise: 4500, // ₹45/meter
  installationRatePerSqMPaise: 35000, // ₹350/sqm
  standardMarginPercent: 20,
};

