import { z } from 'zod';
import { WallIdSchema, Mm } from '@/domain/schema';

export const SitePhotoSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  wallId: WallIdSchema,
  url: z.string().min(1),
  caption: z.string().optional(),
  compassHeading: z.number().min(0).max(360).optional(),
  capturedAtIso: z.string().datetime(),
});

export type SitePhoto = z.infer<typeof SitePhotoSchema>;

export const WallMeasurementSchema = z.object({
  wallId: WallIdSchema,
  lengthMm: Mm.positive(),
  heightMm: Mm.positive(),
  notes: z.string().optional(),
});

export type WallMeasurement = z.infer<typeof WallMeasurementSchema>;

export interface ClosureResult {
  isClosed: boolean;
  closureErrorMm: number;
  status: 'acceptable' | 'warning';
  message: string;
}
