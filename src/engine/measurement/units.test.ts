import { describe, expect, it } from 'vitest';
import { formatLength, parseLength, toMm, toStoredMm } from './units';

const mm = (text: string, unit: Parameters<typeof parseLength>[1] = 'mm') => {
  const r = parseLength(text, unit);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('unit conversion and storage policy', () => {
  it('converts exactly, then stores whole millimetres (halves away from zero)', () => {
    expect(toMm(100, 'cm')).toBe(1000);
    expect(toMm(12, 'ft')).toBeCloseTo(3657.6, 9);
    expect(toStoredMm(3657.6)).toBe(3658);
    expect(toStoredMm(2.5)).toBe(3);
    expect(toStoredMm(-2.5)).toBe(-3);
  });

  it('parses the examples from the brief', () => {
    expect(mm('100 cm')).toEqual({ ok: true, exactMm: 1000, mm: 1000 });
    expect(mm('12 ft').exactMm).toBeCloseTo(3657.6, 9);
    expect(mm('12 ft').mm).toBe(3658);
    expect(mm('12 ft 6 in').mm).toBe(3810);
  });

  it('accepts the usual ways of writing feet and inches', () => {
    for (const text of [`12' 6"`, `12'6"`, `12'-6"`, `12' 6`, '12 feet 6 inches', '150 in', '150"']) expect(mm(text).mm).toBe(3810);
    expect(mm(`6 1/2"`).exactMm).toBeCloseTo(165.1, 9);
    expect(mm(`1/2"`).exactMm).toBeCloseTo(12.7, 9);
  });

  it('uses the display unit for bare numbers (inches in feet-and-inches mode)', () => {
    expect(mm('1500').mm).toBe(1500);
    expect(mm('381', 'cm').mm).toBe(3810);
    expect(mm('3.81', 'm').mm).toBe(3810);
    expect(mm('12', 'ft').mm).toBe(3658);
    expect(mm('150', 'ft-in').mm).toBe(3810);
    expect(mm('1,500 mm').mm).toBe(1500);
    expect(mm('3,81', 'm').mm).toBe(3810);
  });

  it('rejects invalid, negative and mixed-up input', () => {
    for (const text of ['', 'wide', '12 parsecs', '-5', '3 m 6 in']) expect(parseLength(text, 'mm').ok).toBe(false);
    expect(parseLength('-50', 'mm', true)).toEqual({ ok: true, exactMm: -50, mm: -50 });
  });

  it('formats for display without changing the value', () => {
    expect(formatLength(3658, 'ft-in')).toBe(`12' 0"`);
    expect(formatLength(3810, 'ft-in')).toBe(`12' 6"`);
    expect(formatLength(600, 'ft-in')).toBe(`1' 11 5/8"`);
    expect(formatLength(3810, 'cm')).toBe('381 cm');
    expect(formatLength(3810, 'm')).toBe('3.81 m');
    expect(formatLength(3810, 'in')).toBe('150"');
    expect(formatLength(3810, 'ft')).toBe('12.5 ft');
    expect(formatLength(1500, 'mm')).toBe('1,500 mm');
    expect(formatLength(605, 'cm', true)).toBe('60.5');
  });

  it('round-trips metric exactly and imperial to within the 1/16" display precision', () => {
    for (const v of [1, 600, 1234, 3810, 12000]) {
      for (const unit of ['mm', 'cm', 'm'] as const) expect(mm(formatLength(v, unit), unit).mm).toBe(v);
      for (const unit of ['in', 'ft-in'] as const) expect(Math.abs(mm(formatLength(v, unit), unit).mm - v)).toBeLessThanOrEqual(1);
    }
  });
});
