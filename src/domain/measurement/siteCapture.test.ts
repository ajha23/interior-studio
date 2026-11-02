import { describe, it, expect } from 'vitest';
import { SitePhotoSchema, WallMeasurementSchema } from './siteCapture';

describe('Site Measurement Domain Models (MT-01, MT-03)', () => {
  it('validates a correct site photo payload', () => {
    const valid = {
      id: 'photo_1',
      projectId: 'proj_123',
      wallId: 'back',
      url: 'data:image/jpeg;base64,...',
      caption: 'Sink plumbing rough-in',
      compassHeading: 180,
      capturedAtIso: new Date().toISOString(),
    };

    const parsed = SitePhotoSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid wall id', () => {
    const invalid = {
      id: 'photo_2',
      projectId: 'proj_123',
      wallId: 'ceiling', // invalid
      url: 'https://example.com/photo.jpg',
      capturedAtIso: new Date().toISOString(),
    };

    const parsed = SitePhotoSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('validates wall measurement integers', () => {
    const valid = {
      wallId: 'left',
      lengthMm: 3600,
      heightMm: 2750,
      notes: 'Contains electrical distribution board',
    };

    const parsed = WallMeasurementSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });
});

