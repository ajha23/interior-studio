import { describe, expect, it } from 'vitest';
import { APPLIANCE_SPECS, CABINET_SPECS, createProject, DEFAULT_ROOM, makeCabinet, type ApplianceType, type CabinetType } from '@/domain';
import { makeAppliance } from '@/domain/furniture/factory';
import { buildParts, type Part } from './parts';

function bodyBounds(parts: Part[]) {
  const body = parts.filter((p) => p.body);
  const min = (axis: 'x' | 'y' | 'z') => Math.min(...body.map((p) => p.center[axis] - p.size[axis] / 2));
  const max = (axis: 'x' | 'y' | 'z') => Math.max(...body.map((p) => p.center[axis] + p.size[axis] / 2));
  return { width: max('x') - min('x'), height: max('y') - min('y'), depth: max('z') - min('z'), minY: min('y') };
}

describe('procedural geometry matches domain dimensions', () => {
  it('a 600 × 720 × 560 mm base cabinet builds exactly that body', () => {
    const c = makeCabinet(DEFAULT_ROOM, { id: 'c', type: 'base', wallId: 'back', offset: 0, dimensions: { width: 600, height: 720, depth: 560 }, materialId: 'shutter-oak' });
    const b = bodyBounds(buildParts(c));
    expect([b.width, b.height, b.depth, b.minY]).toEqual([600, 720, 560, 0]);
  });

  it.each(Object.keys(CABINET_SPECS) as CabinetType[])('%s cabinet at every supported width', (type) => {
    const spec = CABINET_SPECS[type];
    for (const width of spec.widths) {
      const dims = { ...spec.defaults, width };
      const b = bodyBounds(buildParts(makeCabinet(DEFAULT_ROOM, { id: 'c', type, wallId: 'back', offset: 0, dimensions: dims, materialId: 'x' })));
      expect(b.width).toBeCloseTo(dims.width, 6);
      expect(b.height).toBeCloseTo(dims.height, 6);
      expect(b.depth).toBeCloseTo(dims.depth, 6);
    }
  });

  it.each(Object.keys(APPLIANCE_SPECS) as ApplianceType[])('%s appliance', (type) => {
    const a = makeAppliance(DEFAULT_ROOM, { id: 'a', type, wallId: 'back', offset: 0 });
    const b = bodyBounds(buildParts(a));
    expect([b.width, b.height, b.depth]).toEqual([a.dimensions.width, a.dimensions.height, a.dimensions.depth]);
  });

  it('only floor units get a plinth, and it reaches exactly to the floor', () => {
    const p = createProject({ name: 'x', room: DEFAULT_ROOM, layout: 'straight' });
    for (const c of p.cabinets) {
      const plinth = buildParts(c).find((part) => part.key === 'plinth');
      if (c.type === 'wall') expect(plinth).toBeUndefined();
      else expect(c.position.y + plinth!.center.y - plinth!.size.y / 2).toBe(0);
    }
  });

  it('every element of a generated kitchen has positive-size parts', () => {
    const p = createProject({ name: 'x', room: DEFAULT_ROOM, layout: 'straight' });
    for (const el of [...p.cabinets, ...p.appliances]) {
      for (const part of buildParts(el)) expect(Math.min(part.size.x, part.size.y, part.size.z)).toBeGreaterThan(0);
    }
  });
});
