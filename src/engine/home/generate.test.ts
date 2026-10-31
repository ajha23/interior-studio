import { describe, expect, it } from 'vitest';
import { carpetArea, HomeSchema, validateProject, type Home } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { generateHome, HOME_STYLES, planLevels, programme } from './generate';

const gen = (brief: Parameters<typeof generateHome>[0]) => generateHome(brief, sequentialIds());
const types = (h: Home) => h.rooms.map((r) => r.type);
const count = (h: Home, t: string) => types(h).filter((x) => x === t).length;

/** Two rooms on the same level whose inner floors, grown by their walls, overlap. */
function overlaps(h: Home): string[] {
  const out: string[] = [];
  for (const [i, a] of h.rooms.entries())
    for (const b of h.rooms.slice(i + 1)) {
      if (a.level !== b.level) continue;
      const t = a.design.room.wallThickness;
      const ax = [a.x - t, a.x + a.design.room.width + t];
      const az = [a.z - t, a.z + a.design.room.length + t];
      const bx = [b.x - t, b.x + b.design.room.width + t];
      const bz = [b.z - t, b.z + b.design.room.length + t];
      if (ax[0]! < bx[1]! - 1 && bx[0]! < ax[1]! - 1 && az[0]! < bz[1]! - 1 && bz[0]! < az[1]! - 1) out.push(`${a.name} × ${b.name}`);
    }
  return out;
}

describe('home generator', () => {
  it.each([1, 2, 3, 4])('a %iBHK apartment has the right rooms, no overlaps, and every room is a valid, furnished design', (bhk) => {
    const { home, notes } = gen({ bhk, kind: 'apartment' });
    expect(HomeSchema.safeParse(home).success).toBe(true);
    expect(count(home, 'master-bedroom') + count(home, 'bedroom')).toBe(bhk);
    expect(count(home, 'kitchen')).toBe(1);
    expect(count(home, 'living')).toBe(1);
    expect(count(home, 'bathroom')).toBeGreaterThanOrEqual(bhk >= 3 ? 3 : 2);
    expect(overlaps(home)).toEqual([]);
    expect(notes).toEqual([]);
    for (const r of home.rooms) {
      expect(validateProject(r.design), r.name).toEqual([]);
      expect(r.x + r.design.room.width).toBeLessThanOrEqual(home.plot.width);
      expect(r.z + r.design.room.length).toBeLessThanOrEqual(home.plot.length);
    }
    const bed = home.rooms.find((r) => r.type === 'master-bedroom')!;
    expect(bed.design.furniture.map((f) => f.type)).toEqual(expect.arrayContaining(['bed', 'nightstand', 'wardrobe']));
    expect(bed.design.openings.some((o) => o.kind === 'door')).toBe(true);
    expect(bed.design.openings.some((o) => o.kind === 'window')).toBe(true);
    const bath = home.rooms.find((r) => r.type === 'bathroom')!;
    expect(bath.design.furniture.map((f) => f.type).sort()).toEqual(['basin', 'shower', 'toilet']);
    const kitchen = home.rooms.find((r) => r.type === 'kitchen')!;
    expect(kitchen.design.appliances.map((a) => a.type)).toEqual(expect.arrayContaining(['fridge', 'range']));
    expect(kitchen.design.cabinets.some((c) => c.type === 'sink')).toBe(true);
  });

  it('a villa has two levels with the staircase in the same place on both', () => {
    const { home, notes } = gen({ bhk: 4, kind: 'villa' });
    expect(home.levels).toBe(2);
    expect(notes).toEqual([]);
    const stairs = home.rooms.filter((r) => r.type === 'staircase');
    expect(stairs).toHaveLength(2);
    expect(stairs[0]!.x).toBe(stairs[1]!.x);
    expect(stairs[0]!.z).toBe(stairs[1]!.z);
    expect(stairs.every((s) => s.design.furniture.some((f) => f.type === 'stairs'))).toBe(true);
    expect(count(home, 'master-bedroom') + count(home, 'bedroom')).toBe(4);
    expect(overlaps(home)).toEqual([]);
  });

  it('scales rooms towards a wanted carpet area and applies one style everywhere', () => {
    const small = gen({ bhk: 2, kind: 'apartment', carpetAreaSqft: 700 }).home;
    const large = gen({ bhk: 2, kind: 'apartment', carpetAreaSqft: 1300, style: 'japandi' }).home;
    expect(carpetArea(large).sqft).toBeGreaterThan(carpetArea(small).sqft);
    expect(large.style).toBe(HOME_STYLES.japandi.label);
    for (const r of large.rooms) expect(r.design.materials['style-floor']?.name).toBe('Pale ash planks');
    expect(large.rooms.find((r) => r.type === 'living')!.design.surfaces.floor).toBe('style-floor');
    expect(large.rooms.find((r) => r.type === 'bathroom')!.design.surfaces.floor).toBe('style-bath-floor');
  });

  it('lays out bands that share one footprint', () => {
    const { rooms, plot } = planLevels(programme({ bhk: 3, kind: 'apartment' }));
    const right = (band: string) => Math.max(...rooms.filter((r) => r.band === band).map((r) => r.x + r.width));
    expect(Math.abs(right('private') - right('public'))).toBeLessThan(600);
    expect(plot.width).toBeGreaterThan(right('private'));
  });
});
