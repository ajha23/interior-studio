import { describe, expect, it } from 'vitest';
import { parseHomeBrief } from './brief';

describe('home briefs from plain words', () => {
  it('reads BHK, apartment or villa, area and style', () => {
    expect(parseHomeBrief('Design a 3BHK apartment')).toEqual({ bhk: 3, kind: 'apartment' });
    expect(parseHomeBrief('2 bhk flat, 950 sq ft, japandi')).toEqual({ bhk: 2, kind: 'apartment', carpetAreaSqft: 950, style: 'japandi' });
    expect(parseHomeBrief('a four bedroom villa of 2,400 sqft in warm wood')).toEqual({ bhk: 4, kind: 'villa', carpetAreaSqft: 2400, style: 'warm' });
    expect(parseHomeBrief('design a villa, 220 m2')).toEqual({ bhk: 4, kind: 'villa', carpetAreaSqft: 2368 });
    expect(parseHomeBrief('plan my whole home, industrial')).toEqual({ bhk: 2, kind: 'apartment', style: 'industrial' });
  });

  it('leaves ordinary requests alone', () => {
    for (const t of ['design a kitchen for my house', 'make the bedroom bigger', 'add a 600 mm base cabinet', 'open the fridge', 'move the bed to the left wall', 'show the plan'])
      expect(parseHomeBrief(t), t).toBeNull();
  });
});
