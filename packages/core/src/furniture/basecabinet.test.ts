import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_PACK } from '../domain/catalog';
import { mm } from '../domain/units';
import { newBaseCabinet } from '../domain/factory';
import { buildSchedule } from './schedule';
import { BASE_CABINET_LIMITS, DEFAULT_BASE_CABINET, resolveBaseCabinet } from './basecabinet';
import { envelope } from './index';

const rp = DEFAULT_RULE_PACK;
const errors = (r: ReturnType<typeof resolveBaseCabinet>) => r.issues.filter((i) => i.severity === 'error').map((i) => i.code);

describe('base cabinet template', () => {
  it('default door unit resolves without errors and fills its envelope', () => {
    const r = resolveBaseCabinet(DEFAULT_BASE_CABINET, rp);
    expect(errors(r)).toEqual([]);
    expect(r.overall).toEqual({ widthUm: mm(600), depthUm: mm(580), heightUm: mm(850), zMinUm: 0 });
    for (const p of r.parts) {
      expect(p.box.x).toBeGreaterThanOrEqual(0);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(r.overall.widthUm);
      expect(p.box.z + p.box.h).toBeLessThanOrEqual(r.overall.heightUm);
      expect(p.box.y + p.box.d).toBeLessThanOrEqual(r.overall.depthUm);
    }
    const keys = r.parts.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['side-l', 'side-r', 'bottom', 'rail-front', 'rail-back', 'shelf-1', 'door-1', 'plinth', 'worktop']));
  });

  it('width change regenerates carcass widths exactly', () => {
    const r = resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, widthUm: mm(900), doorCount: 2 }, rp);
    expect(errors(r)).toEqual([]);
    const bottom = r.parts.find((p) => p.key === 'bottom')!;
    expect(bottom.lengthUm).toBe(mm(900) - 2 * rp.carcassThicknessUm);
    const doors = r.parts.filter((p) => p.role === 'shutter');
    expect(doors).toHaveLength(2);
    // Doors plus three gaps span the full width exactly.
    expect(doors.reduce((s, d) => s + d.box.w, 0) + 3 * rp.shutterGapUm).toBe(mm(900));
  });

  it('rejects out-of-range and unbuildable parameters', () => {
    expect(errors(resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, widthUm: mm(1500) }, rp))).toContain('WIDTHUM_RANGE');
    expect(errors(resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, widthUm: mm(100) }, rp))).toContain('WIDTHUM_RANGE');
    expect(errors(resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, widthUm: mm(900), doorCount: 1 }, rp))).toContain('DOOR_WIDE');
    expect(errors(resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, front: 'drawers', widthUm: mm(250) }, rp))).toContain('DRAWER_NARROW');
    expect(errors(resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, front: 'drawers', drawerCount: 5, heightUm: mm(600), plinthUm: mm(150) }, rp))).toContain('DRAWER_LOW');
    expect(errors(resolveBaseCabinet({ ...DEFAULT_BASE_CABINET, shelfCount: 1.5 }, rp))).toContain('SHELFCOUNT_INT');
  });

  it('drawer stack fronts tile the carcass height with uniform gaps', () => {
    const p = { ...DEFAULT_BASE_CABINET, front: 'drawers' as const, drawerCount: 3 };
    const r = resolveBaseCabinet(p, rp);
    expect(errors(r)).toEqual([]);
    const fronts = r.parts.filter((x) => x.role === 'drawer-front');
    expect(fronts.map((f) => f.name)).toEqual(['Drawer 1 front', 'Drawer 2 front', 'Drawer 3 front']);
    const Hc = p.heightUm - p.plinthUm;
    expect(fronts.reduce((s, f) => s + f.box.h, 0) + 4 * rp.shutterGapUm).toBe(Hc);
    expect(r.hardware.find((h) => h.name.startsWith('Drawer runner'))?.qty).toBe(3);
  });

  it('envelope, schedule and limits agree', () => {
    const item = newBaseCabinet(mm(1000), mm(500));
    expect(envelope(item)).toEqual({ widthUm: mm(600), depthUm: mm(580), heightUm: mm(850), zMinUm: 0 });
    const s = buildSchedule(item, rp);
    expect(s.rows.some((r) => r.name === 'Worktop' && r.material.includes('granite'))).toBe(true);
    expect(BASE_CABINET_LIMITS.widthUm.max).toBe(mm(1200));
  });
});
