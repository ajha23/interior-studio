import { describe, expect, it } from 'vitest';
import { newBaseCabinet, newWallCabinet, sampleProject } from '../domain/factory';
import { mm } from '../domain/units';
import { resolveBaseCabinet, DEFAULT_BASE_CABINET } from '../furniture/basecabinet';
import { DEFAULT_RULE_PACK } from '../domain/catalog';
import { buildBom, buildQuote, DEFAULT_PRICE_LIST, edgeBandM, formatInr, sanitizePriceList } from './pricing';

function kitchenProject() {
  const p = sampleProject();
  const base = newBaseCabinet(mm(900), mm(2300));
  base.name = 'Base B1';
  const wall = newWallCabinet(mm(900), mm(2300) - mm(115));
  wall.name = 'Wall W1';
  p.furniture.push(base, wall);
  return { p, base, wall };
}

describe('pricing', () => {
  it('measures edge banding from the banding code', () => {
    const part = resolveBaseCabinet(DEFAULT_BASE_CABINET, DEFAULT_RULE_PACK).parts.find((x) => x.key === 'door-1')!;
    expect(part.edgeBanding).toBe('2L2S');
    expect(edgeBandM(part)).toBeCloseTo((2 * part.lengthUm + 2 * part.widthUm) / 1e6, 9);
  });

  it('BOM buys whole sheets, banding, worktop area and hardware at internal rates', () => {
    const { p } = kitchenProject();
    const bom = buildBom(p, DEFAULT_PRICE_LIST);
    const boards = bom.lines.filter((l) => l.section === 'Boards');
    expect(boards.length).toBeGreaterThan(0);
    for (const b of boards) expect(Number.isInteger(b.qty) && b.qty >= 1).toBe(true);
    const worktop = bom.lines.find((l) => l.section === 'Worktops')!;
    // 600 × 580 mm slab = 0.348 m² = 3.7 sq ft at ₹260.
    expect(worktop.qty).toBeCloseTo(3.7, 1);
    expect(worktop.rate).toBe(260);
    const hinges = bom.lines.find((l) => l.description.startsWith('Concealed hinge'))!;
    expect(hinges.qty).toBeGreaterThanOrEqual(2);
    expect(hinges.amount).toBe(hinges.qty * 180);
    // The sample bedroom's wardrobe is manufactured too; the bed and side table are blocks without prices.
    expect(bom.unpriced).toEqual(expect.arrayContaining(['Queen bed', 'Bedside table']));
    expect(bom.manufacturedCost).toBe(bom.lines.filter((l) => l.section !== 'Furniture & decor').reduce((s, l) => s + l.amount, 0));
  });

  it('quote folds labour, installation and margin into unit prices and adds GST', () => {
    const { p, base } = kitchenProject();
    const q = buildQuote(p, DEFAULT_PRICE_LIST);
    const line = q.lines.find((l) => l.itemId === base.id)!;
    expect(line.size).toBe('600 × 580 × 850');
    expect(line.finish).toContain('Black galaxy granite top');
    expect(Math.abs(line.amount - line.cost * 1.2)).toBeLessThanOrEqual(1);
    expect(q.subtotal).toBe(q.lines.reduce((s, l) => s + l.amount, 0));
    expect(q.gst).toBe(Math.round(q.subtotal * 0.18));
    expect(q.total).toBe(q.subtotal + q.gst);
    expect(q.internal.margin).toBe(q.subtotal - q.lines.reduce((s, l) => s + l.cost, 0));
    // A dearer worktop raises only that unit's price.
    const pricier = buildQuote(p, { ...DEFAULT_PRICE_LIST, worktopPerSqft: { ...DEFAULT_PRICE_LIST.worktopPerSqft, 'granite-black': 1000 } });
    expect(pricier.lines.find((l) => l.itemId === base.id)!.amount).toBeGreaterThan(line.amount);
    expect(pricier.lines.find((l) => l.name === 'Wall W1')!.amount).toBe(q.lines.find((l) => l.name === 'Wall W1')!.amount);
  });

  it('sanitises stored rates over the defaults', () => {
    const pl = sanitizePriceList({ edgeBandPerM: -5, gstPct: 99, boardPerSheet: { walnut: 7000, junk: 'x' }, marginPct: 'lots' });
    expect(pl.edgeBandPerM).toBe(0);
    expect(pl.gstPct).toBe(40);
    expect(pl.boardPerSheet.walnut).toBe(7000);
    expect(pl.boardPerSheet['white-matte']).toBe(4800);
    expect(pl.marginPct).toBe(20);
    expect(formatInr(1234567)).toBe('₹12,34,567');
  });
});

describe('workshop cut-list', () => {
  it('groups every non-worktop part per board and agrees with the BOM sheet count', async () => {
    const { buildCutList } = await import('./cutlist');
    const { p } = kitchenProject();
    const boards = buildCutList(p);
    expect(boards.length).toBeGreaterThan(1);
    expect(boards.every((b) => b.rows.length > 0 && b.sheets >= 1)).toBe(true);
    expect(boards.reduce((s, b) => s + b.rows.reduce((n, r) => n + r.qty, 0), 0)).toBe(boards.reduce((s, b) => s + b.pieces, 0));
    const bom = buildBom(p, DEFAULT_PRICE_LIST);
    const bomSheets = bom.lines.filter((l) => l.section === 'Boards').reduce((s, l) => s + l.qty, 0);
    expect(boards.reduce((s, b) => s + b.sheets, 0)).toBe(bomSheets);
    expect(boards.some((b) => b.rows.some((r) => r.part === 'Worktop'))).toBe(false);
  });
});
