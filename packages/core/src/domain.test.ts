import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './domain/commands';
import { DEFAULT_RULE_PACK } from './domain/catalog';
import { newDecor, newTvUnit, newWardrobe, sampleProject, stableStringify } from './domain/factory';
import type { Project, WardrobeParams } from './domain/types';
import { mm, splitExact, toMm } from './domain/units';
import { resolveTvUnit, resolveWardrobe } from './furniture';
import { buildSchedule } from './furniture/schedule';
import { footprint, penetration } from './geometry';
import { validateProject } from './validation';

const base: WardrobeParams = { widthUm: mm(2400), heightUm: mm(2400), depthUm: mm(600), modules: ['hanging', 'drawers', 'shelves'], shelvesPerModule: 4, drawersPerModule: 3, shutterCount: 4 };

describe('units', () => {
  it('stores integer micrometres and round-trips mm', () => {
    expect(mm(2400)).toBe(2_400_000);
    expect(toMm(mm(2399.5))).toBe(2399.5);
  });
  it('splitExact always sums to the total', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 1, max: 12 }), (t, n) => splitExact(t, n).reduce((a, b) => a + b, 0) === t));
  });
});

describe('GEO-01 / GEO-06: exact room dimensions survive save/reload', () => {
  it('3600 × 3200 × 2800 is stored exactly and serializes losslessly', () => {
    const p = sampleProject();
    expect(p.room.widthUm).toBe(mm(3600));
    expect(p.room.depthUm).toBe(mm(3200));
    expect(p.room.ceilingUm).toBe(mm(2800));
    const reloaded = JSON.parse(JSON.stringify(p)) as Project;
    expect(stableStringify(reloaded)).toBe(stableStringify(p));
  });
});

describe('wardrobe template', () => {
  it('FUR-01: overall envelope equals the entered dimensions', () => {
    const r = resolveWardrobe(base, DEFAULT_RULE_PACK);
    expect(r.overall).toMatchObject({ widthUm: mm(2400), heightUm: mm(2400), depthUm: mm(600) });
    const maxX = Math.max(...r.parts.map((p) => p.box.x + p.box.w));
    const maxZ = Math.max(...r.parts.map((p) => p.box.z + p.box.h));
    const maxY = Math.max(...r.parts.map((p) => p.box.y + p.box.d));
    expect([maxX, maxZ, maxY]).toEqual([mm(2400), mm(2400), mm(600)]);
  });

  it('module widths + boards sum exactly to the overall width', () => {
    fc.assert(
      fc.property(fc.integer({ min: 900, max: 2400 }), fc.integer({ min: 1, max: 4 }), (w, m) => {
        const r = resolveWardrobe({ ...base, widthUm: mm(w), modules: Array(m).fill('shelves'), shutterCount: m }, DEFAULT_RULE_PACK);
        const t = DEFAULT_RULE_PACK.carcassThicknessUm;
        const sum = r.modules.reduce((a, x) => a + x.widthUm, 0) + (m + 1) * t;
        return sum === mm(w);
      }),
    );
  });

  it('shutters plus gaps fill the width exactly', () => {
    const r = resolveWardrobe(base, DEFAULT_RULE_PACK);
    const sh = r.parts.filter((p) => p.role === 'shutter');
    expect(sh).toHaveLength(4);
    const total = sh.reduce((a, p) => a + p.box.w, 0) + 5 * DEFAULT_RULE_PACK.shutterGapUm;
    expect(total).toBe(mm(2400));
  });

  it('DOC-03: changing board thickness recalculates dependent parts', () => {
    const a = resolveWardrobe(base, DEFAULT_RULE_PACK);
    const b = resolveWardrobe(base, { ...DEFAULT_RULE_PACK, carcassThicknessUm: mm(25) });
    const topA = a.parts.find((p) => p.key === 'top')!;
    const topB = b.parts.find((p) => p.key === 'top')!;
    expect(topA.lengthUm).toBe(mm(2400 - 36));
    expect(topB.lengthUm).toBe(mm(2400 - 50));
  });

  it('flags parts longer than a 2440 mm board', () => {
    const r = resolveWardrobe({ ...base, heightUm: mm(2700) }, DEFAULT_RULE_PACK);
    expect(r.issues.some((i) => i.code === 'SIDE_TOO_LONG' && i.severity === 'error')).toBe(true);
  });

  it('carcass parts never intersect each other', () => {
    const r = resolveWardrobe(base, DEFAULT_RULE_PACK);
    const solids = r.parts.filter((p) => ['side', 'top', 'bottom', 'partition', 'shelf', 'back', 'shutter'].includes(p.role));
    for (let i = 0; i < solids.length; i++)
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i].box;
        const b = solids[j].box;
        const ov = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d && a.z < b.z + b.h && b.z < a.z + a.h;
        expect(ov, `${solids[i].key} ∩ ${solids[j].key}`).toBe(false);
      }
  });

  it('DOC-02: schedule quantities equal resolved part count', () => {
    const w = newWardrobe();
    const { rows, resolved } = buildSchedule(w, DEFAULT_RULE_PACK);
    expect(rows.reduce((a, r) => a + r.qty, 0)).toBe(resolved.parts.length);
  });
});

describe('TV unit template', () => {
  it('overall height includes mount and wall panel', () => {
    const tv = newTvUnit();
    const r = resolveTvUnit(tv.params, DEFAULT_RULE_PACK);
    expect(r.overall.heightUm).toBe(mm(250 + 400 + 1200));
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('validation', () => {
  it('sample project has no errors', () => {
    const errs = validateProject(sampleProject()).filter((v) => v.severity === 'error');
    expect(errs).toEqual([]);
  });

  it('FUR-05: furniture outside the room is reported', () => {
    const p = sampleProject();
    const w = { ...p.furniture[0], xUm: mm(3500) };
    const res = validateProject({ ...p, furniture: [w, ...p.furniture.slice(1)] });
    expect(res.some((r) => r.code === 'OUT_OF_ROOM')).toBe(true);
  });

  it('FUR-06: overlapping pieces are reported', () => {
    const p = sampleProject();
    const a = newDecor('box', mm(1000), mm(1500));
    const b = newDecor('box', mm(1200), mm(1500));
    const res = validateProject({ ...p, furniture: [a, b] });
    expect(res.some((r) => r.code === 'OVERLAP')).toBe(true);
  });

  it('touching pieces are not overlaps', () => {
    const a = newDecor('box', mm(1000), mm(1500));
    const b = newDecor('box', mm(1600), mm(1500));
    expect(penetration(footprint(a), footprint(b))).toBe(0);
  });

  it('wardrobe taller than ceiling is an error', () => {
    const p = sampleProject();
    const res = validateProject({ ...p, room: { ...p.room, ceilingUm: mm(2300) } });
    expect(res.some((r) => r.code === 'ABOVE_CEILING')).toBe(true);
  });
});

describe('GEO-07: commands are exactly reversible', () => {
  it('random edit sequences undo back to the initial state', () => {
    const start = sampleProject();
    const wid = start.furniture[0].id;
    const cmdArb = fc.oneof(
      fc.integer({ min: 1000, max: 3000 }).map((w): Command => ({ type: 'furniture.params', id: wid, params: { widthUm: mm(w) } })),
      fc.record({ x: fc.integer({ min: 0, max: 3600 }), y: fc.integer({ min: 0, max: 3200 }) }).map(({ x, y }): Command => ({ type: 'furniture.update', id: wid, patch: { xUm: mm(x), yUm: mm(y) } })),
      fc.integer({ min: 2000, max: 4000 }).map((h): Command => ({ type: 'room.update', patch: { ceilingUm: mm(h) } })),
      fc.integer({ min: 12, max: 25 }).map((t): Command => ({ type: 'rulepack.update', patch: { carcassThicknessUm: mm(t) } })),
      fc.nat().map((n): Command => ({ type: 'furniture.add', item: { ...newDecor('box', mm(500), mm(500)), id: `box-${n}` } })),
    );
    fc.assert(
      fc.property(fc.array(cmdArb, { minLength: 1, maxLength: 40 }), (cmds) => {
        let p = start;
        const inverses: Command[] = [];
        for (const c of cmds) {
          const [next, inv] = applyCommand(p, c);
          p = next;
          inverses.unshift(inv);
        }
        for (const inv of inverses) p = applyCommand(p, inv)[0];
        return stableStringify(p) === stableStringify(start);
      }),
      { numRuns: 200 },
    );
  });
});
