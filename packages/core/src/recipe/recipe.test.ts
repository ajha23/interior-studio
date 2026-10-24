import { describe, expect, it } from 'vitest';
import { recipeInstanceCount, resizeRecipe, sanitizeRecipe, RecipeError } from './recipe';

const chair = {
  name: 'Cane dining chair',
  category: 'dining',
  size: { w: 460, d: 520, h: 880 },
  materials: { wood: 'teak', seat: 'cane', bogus: 'not-a-material' },
  parts: [
    { id: 'seat', shape: 'roundedBox', material: 'seat', position: [0, 450, 0], size: [440, 30, 440], radius: 10 },
    { id: 'leg', shape: 'lathe', material: 'wood', position: [-190, 0, -190], profile: [[18, 0], [22, 200], [15, 435]], repeat: { count: 2, offset: [380, 0, 0] } },
    { id: 'back', shape: 'extrude', material: 'wood', position: [0, 660, -230], outline: [[-210, 0], [210, 0], [200, 200], [-200, 200]], depth: 20, bevel: 3 },
    { id: 'evil', shape: 'script', material: 'wood', position: [0, 0, 0] },
    { id: 'rail', shape: 'tube', material: 'wood', position: [0, 0, 0], path: [[-200, 300, 200], [0, 280, 220], [200, 300, 200]], radius: 9 },
  ],
};

describe('recipes', () => {
  it('keeps valid parts, drops unknown shapes and materials', () => {
    const r = sanitizeRecipe(chair);
    expect(r.parts.map((p) => p.id)).toEqual(['seat', 'leg', 'back', 'rail']);
    expect(r.materials.bogus).toBe('white-matte');
    expect(r.materials.seat).toBe('cane');
    expect(recipeInstanceCount(r)).toBe(5);
  });

  it('clamps absurd numbers and caps repeats', () => {
    const r = sanitizeRecipe({ ...chair, parts: [{ id: 'x', shape: 'box', material: 'wood', position: [1e9, NaN, 0], size: [-5, 1e9, 10], repeat: { count: 9999, offset: [10, 0, 0] } }] });
    const p = r.parts[0] as { position: number[]; size: number[]; repeat?: { count: number } };
    expect(p.position[0]).toBeLessThanOrEqual(8000);
    expect(p.position[1]).toBe(0);
    expect(p.size[0]).toBeGreaterThan(0);
    expect(p.repeat?.count).toBe(60);
  });

  it('rejects recipes with nothing buildable', () => {
    expect(() => sanitizeRecipe({ parts: [{ shape: 'nope' }] })).toThrow(RecipeError);
  });

  it('resizes proportionally', () => {
    const r = resizeRecipe(sanitizeRecipe(chair), { w: 920, d: 520, h: 880 });
    const seat = r.parts[0] as { size: number[] };
    expect(seat.size[0]).toBeCloseTo(880);
    expect(r.size.w).toBe(920);
  });
});
