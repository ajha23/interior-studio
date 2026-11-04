import { z } from 'zod';

const Mm = z.number().int('must be a whole number of millimetres').finite();
const WallIdSchema = z.enum(['back', 'left', 'right', 'front']);

export const MepKindSchema = z.enum([
  'electrical_16a',     // 16 Amp high power (hob, oven, dishwasher, microwave)
  'electrical_6a',      // 6 Amp standard countertop appliances (mixer, toaster, kettle)
  'water_inlet',        // Fresh water supply (hot/cold)
  'water_drain',        // Waste water outlet (40mm / 50mm pipe)
  'gas_point',          // LPG cylinder or piped natural gas (PNG)
  'chimney_duct',       // 150mm exhaust duct cutout
]);

export type MepKind = z.infer<typeof MepKindSchema>;

export const MepPointSchema = z.object({
  id: z.string().min(1).max(64),
  kind: MepKindSchema,
  wallId: WallIdSchema,
  /** Distance along the wall in integer mm from the wall start. */
  offset: Mm.nonnegative(),
  /** Elevation above finished floor level (AFFL) in integer mm. */
  elevation: Mm.nonnegative(),
  label: z.string().trim().max(60).optional(),
  elementId: z.string().optional(),
});

export type MepPoint = z.infer<typeof MepPointSchema>;
