import { describe, it, expect } from 'vitest';
import { evaluateRoomClosure } from './closureSolver';
import type { WallMeasurement } from '@/domain/measurement/siteCapture';

describe('Room Closure Solver (MT-04)', () => {
  it('returns acceptable status when closure error is <= 10mm', () => {
    const measurements: WallMeasurement[] = [
      { wallId: 'back', lengthMm: 4000, heightMm: 2800 },
      { wallId: 'front', lengthMm: 4005, heightMm: 2800 }, // 5mm diff
      { wallId: 'left', lengthMm: 3000, heightMm: 2800 },
      { wallId: 'right', lengthMm: 3002, heightMm: 2800 }, // 2mm diff
    ];

    const result = evaluateRoomClosure(measurements);
    expect(result.isClosed).toBe(true);
    expect(result.status).toBe('acceptable');
    expect(result.closureErrorMm).toBe(5); // sqrt(5^2 + 2^2) = ~5.38 -> 5mm
    expect(result.message).toContain('tolerance');
  });

  it('returns warning status when closure error exceeds 10mm', () => {
    const measurements: WallMeasurement[] = [
      { wallId: 'back', lengthMm: 4000, heightMm: 2800 },
      { wallId: 'front', lengthMm: 4025, heightMm: 2800 }, // 25mm diff
      { wallId: 'left', lengthMm: 3000, heightMm: 2800 },
      { wallId: 'right', lengthMm: 3000, heightMm: 2800 },
    ];

    const result = evaluateRoomClosure(measurements);
    expect(result.isClosed).toBe(false);
    expect(result.status).toBe('warning');
    expect(result.closureErrorMm).toBe(25);
    expect(result.message).toContain('exceeds 10mm limit');
  });

  it('flags warning when some walls are missing', () => {
    const measurements: WallMeasurement[] = [
      { wallId: 'back', lengthMm: 4000, heightMm: 2800 },
      { wallId: 'left', lengthMm: 3000, heightMm: 2800 },
    ];

    const result = evaluateRoomClosure(measurements);
    expect(result.isClosed).toBe(false);
    expect(result.message).toContain('Incomplete measurements');
  });
});
