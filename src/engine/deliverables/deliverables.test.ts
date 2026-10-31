import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, executeBatch, executeCommand, makeCabinet, type KitchenProject } from '@/domain';
import { lKitchen12x10 } from '@/test/kitchens';
import { buildBom, fillers } from './bom';
import { csvCell, toCsv } from './csv';
import { chooseScale, formatDimension, PAPER, type Dimension } from './drawing';
import { elevationView } from './elevationView';
import { sheetsToPdf } from './pdf';
import { DEFAULT_ANNOTATIONS, missingMeasurements, planView } from './plan';
import { checkReadiness } from './readiness';
import { designRevision, stableJson } from './revision';
import { querySchedule, scheduleRows } from './schedule';
import { bomCsv, buildDrawingSet, DEFAULT_CONFIG, scheduleCsv } from './set';
import { escapeXml, sheetToSvg } from './svg';

const AT = new Date('2026-10-31T10:00:00Z');
const withRules = (p: KitchenProject, extra: Partial<KitchenProject['production']> = {}): KitchenProject => ({ ...p, production: { constructionId: 'frameless-18', ...extra } });
const dims = (prims: { t: string }[]) => prims.filter((p): p is Dimension => p.t === 'dim');
const ann = (unit: 'mm' | 'cm' | 'ft-in' = 'mm') => ({ ...DEFAULT_ANNOTATIONS, unit });

describe('floor plan', () => {
  it('projects the room to a correctly proportioned plan at a standard scale', () => {
    const p = lKitchen12x10();
    const v = planView(p, ann(), 1 / 25);
    const floor = v.prims.find((x) => x.t === 'rect' && x.fill === 'floor');
    expect(floor).toMatchObject({ x: 0, y: 0, w: 3658, h: 3048 });
    const s = chooseScale(v, 'A3', 'fit');
    expect(s).toMatchObject({ label: '1:25', fits: true });
    // On paper the room is exactly W/25 by L/25 millimetres.
    expect(3658 * s.scale).toBeCloseTo(146.32);
    expect(chooseScale(v, 'A4', 'fit').label).toBe('1:50');
    expect(chooseScale(v, 'A4', 10).fits).toBe(false);
  });

  it('dimensions overall and segment lengths from the canonical geometry', () => {
    const p = lKitchen12x10();
    const d = dims(planView(p, ann(), 1 / 25).prims);
    const overall = d.filter((x) => x.role === 'overall').map((x) => x.value).sort((a, b) => a - b);
    expect(overall).toEqual([3048, 3048, 3276, 3276, 3658, 3658, 3886, 3886]); // internal and external, all four walls
    expect(d.find((x) => x.role === 'thickness')!.value).toBe(114);
    // The front wall's opening chain: 1500 + 900 (door) + 1258 = 3658.
    const front = d.filter((x) => x.role !== 'overall' && x.a.y > 3048);
    expect(front.map((x) => x.value)).toEqual([1500, 900, 1258]);
    expect(front.find((x) => x.role === 'opening')!.value).toBe(900);
    // Back-wall unit chain = the unit widths (and the 58 mm gap), summing to the wall.
    // Second tier (8 + 7 mm on paper at 1:25 = 375 mm): the unit chain; the first tier is the opening chain.
    const backUnits = d.filter((x) => x.a.y < 0 && x.role === 'segment' && Math.abs(Math.abs(x.offset) - 375) < 1);
    expect(backUnits.map((x) => x.value)).toEqual([1000, 800, 600, 600, 600, 58]);
    expect(backUnits.reduce((s, x) => s + x.value, 0)).toBe(3658);
  });

  it('formats dimensions in every supported unit without changing the values', () => {
    expect(formatDimension(3658, 'mm')).toBe('3658');
    expect(formatDimension(3658, 'cm')).toBe('365.8 cm');
    expect(formatDimension(3658, 'm')).toBe('3.658 m');
    expect(formatDimension(3658, 'in')).toBe('144"');
    expect(formatDimension(3658, 'ft')).toBe('12 ft');
    expect(formatDimension(3658, 'ft-in')).toBe(`12' 0"`);
    const imperial = dims(planView(lKitchen12x10(), ann('ft-in'), 1 / 25).prims).find((x) => x.role === 'overall' && x.value === 3658)!;
    expect(imperial.text).toBe(`12' 0"`);
  });
});

describe('elevations', () => {
  it('uses the selected wall and the units on it, as seen from the room', () => {
    const p = lKitchen12x10();
    const back = elevationView(p, 'back', ann(), 1 / 25);
    const floorChain = dims(back.prims).filter((d) => d.role === 'segment' && d.offset < 0).map((d) => d.value);
    expect(floorChain).toEqual([1000, 800, 600, 600, 600, 58]);
    expect(dims(back.prims).find((d) => d.role === 'overall' && d.axis === 'x')!.value).toBe(3658);
    expect(dims(back.prims).find((d) => d.role === 'overall' && d.axis === 'y')!.value).toBe(2438);
    // Height chain: plinth 100, carcass 720, worktop 40 → 860 mm worktop level.
    const heights = dims(back.prims).filter((d) => d.role === 'height').map((d) => d.value);
    expect(heights.slice(0, 3)).toEqual([100, 720, 40]);
    // The sink (C2) sits 1000–1800 mm from the viewer's left on the back wall.
    const tags = back.prims.filter((x) => x.t === 'tag');
    expect(tags.find((t) => t.t === 'tag' && t.text === 'C2')).toMatchObject({ at: { x: 1400 } });
    // On the left wall the viewer's left is the front corner: the fridge (offset 1780–2480 from the back) is at 3048 − 2480 = 568.
    const left = elevationView(p, 'left', ann(), 1 / 25);
    const fridge = left.prims.find((x) => x.t === 'rect' && x.fill === 'appliance' && x.w === 700);
    expect(fridge).toMatchObject({ x: 568 });
  });

  it('reports missing measurements instead of inventing them', () => {
    const p = lKitchen12x10();
    const broken = { ...p, room: { ...p.room, height: Number.NaN } } as KitchenProject;
    expect(missingMeasurements(broken, 'elevation')).toEqual(['ceiling (wall) height']);
    const set = buildDrawingSet(broken, DEFAULT_CONFIG('mm'), { generatedAt: AT });
    expect(set.missing).toContain('ceiling (wall) height');
    expect(set.sheets.some((s) => s.id.startsWith('elev'))).toBe(false);
    expect(set.sheets.some((s) => s.id === 'plan')).toBe(true);
    expect(checkReadiness(broken, 'r').outputs.drawings.status).toBe('blocked');
  });
});

describe('schedule', () => {
  it('reflects the model, with known and unspecified properties', () => {
    const p = lKitchen12x10();
    const rows = scheduleRows(p, designRevision(p));
    expect(rows).toHaveLength(13); // 9 cabinets + 4 appliances
    const sink = rows.find((r) => r.id === 'sink')!;
    expect(sink).toMatchObject({ ref: 'C2', typeLabel: 'Sink unit', wall: 'back', run: 'Back wall run 1', width: 800, height: 720, depth: 560, offset: 1000, elevation: 100, doors: 2, finish: { status: 'known', value: 'White matte' } });
    expect(sink.hinge.status).toBe('unspecified');
    expect(sink.construction.status).toBe('unspecified');
    expect(sink.status).toBe('incomplete');
    expect(sink.missing).toEqual(expect.arrayContaining(['hinge product', 'handle product', 'construction method']));
    expect(rows.find((r) => r.id === 'fridge')).toMatchObject({ category: 'appliance', status: 'bought-in', run: 'Left wall run 1' });
    const corner = scheduleRows(withRules(p), 'r').find((r) => r.id === 'corner')!;
    expect(corner.missing).toContain('cut-list rules for this cabinet type');
  });

  it('stays in sync after an edit, under a new revision', () => {
    const p = lKitchen12x10();
    const edited = executeCommand(p, { type: 'resize_cabinet', cabinetId: 'base1', dimensions: { width: 600, height: 750, depth: 560 } }).project;
    expect(designRevision(edited)).not.toBe(designRevision(p));
    const row = scheduleRows(edited, designRevision(edited)).find((r) => r.id === 'base1')!;
    expect(row).toMatchObject({ height: 750, revision: designRevision(edited) });
  });

  it('filters, sorts and groups', () => {
    const rows = scheduleRows(lKitchen12x10(), 'r');
    const base = querySchedule(rows, { category: 'cabinet', type: 'base' });
    expect(base[0]!.rows.map((r) => r.id)).toEqual(['base1', 'base2']);
    const byWall = querySchedule(rows, { groupBy: 'wall', sort: { key: 'width', dir: 'desc' } });
    expect(byWall.map((g) => g.group)).toEqual(['Back wall', 'Left wall']);
    expect(byWall[0]!.rows[0]!.width).toBe(1000);
    expect(querySchedule(rows, { text: 'sink' })[0]!.rows).toHaveLength(1);
  });
});

describe('bill of materials and cut list', () => {
  it('lists nothing to cut without a construction method, and says why', () => {
    const bom = buildBom(lKitchen12x10());
    expect(bom.complete).toBe(false);
    expect(bom.lines.filter((l) => l.category === 'carcass')).toHaveLength(0);
    expect(bom.excluded.map((e) => e.ref)).toEqual(expect.arrayContaining(['C1', 'C2']));
    expect(bom.lines.filter((l) => l.category === 'worktop')).toHaveLength(2);
  });

  it('uses the configured rules, excludes unverified types, and separates calculated from estimated', () => {
    const bom = buildBom(withRules(lKitchen12x10(), { wastePercent: 15, prices: { currency: 'GBP', boardPerM2: 20 } }));
    expect(bom.excluded).toEqual([{ ref: 'C1', id: 'corner', reason: expect.stringMatching(/Blind corner/) }]);
    expect(bom.complete).toBe(false);
    expect(bom.lines.every((l) => (l.category === 'board' ? l.basis === 'estimated' : l.basis === 'calculated'))).toBe(true);
    expect(bom.lines.some((l) => l.refs.includes('C1') && l.category !== 'worktop')).toBe(false);
    expect(bom.lines.find((l) => l.category === 'board')!.formula).toMatch(/15 % waste/);
    expect(bom.totalCost).toBeGreaterThan(0);
    expect(bom.lines.find((l) => l.category === 'filler')).toMatchObject({ width: 58, length: 720, refs: ['C6'] });
  });

  it('matches the verified 600 mm base unit fixture', () => {
    const base = makeCabinet(DEFAULT_ROOM, { id: 'b', type: 'base', wallId: 'back', offset: 0, dimensions: { width: 600, height: 720, depth: 560 }, materialId: 'shutter-oak' });
    const p = withRules({ ...createProject({ name: 'One', room: DEFAULT_ROOM, layout: 'empty' }), cabinets: [base] });
    const lines = buildBom(p).lines;
    const find = (item: string) => lines.filter((l) => l.item === item);
    expect(find('Side')).toEqual([expect.objectContaining({ length: 720, width: 542, thickness: 18, qty: 2 })]);
    expect(find('Top')[0]).toMatchObject({ length: 564, width: 542, qty: 1 });
    expect(find('Bottom')[0]).toMatchObject({ length: 564, width: 542, qty: 1 });
    expect(find('Back')[0]).toMatchObject({ length: 684, width: 564, thickness: 8, qty: 1 });
    expect(find('Kickboard')[0]).toMatchObject({ thickness: 18, qty: 1 });
    expect(find('Door')[0]).toMatchObject({ material: 'Natural oak', qty: 1 });
    expect(lines.find((l) => l.item.startsWith('Concealed hinge'))).toMatchObject({ qty: 2 });
    expect(lines.find((l) => l.item.startsWith('Adjustable leg'))).toMatchObject({ qty: 4 });
  });

  it('does not double-count shared parts: one worktop per run, hardware totalled, a box per cabinet', () => {
    const empty = createProject({ name: 'Two', room: DEFAULT_ROOM, layout: 'empty' });
    const two = executeBatch(empty, [
      { type: 'add_cabinet', cabinetType: 'base', id: 'a', placement: { wallId: 'back', offset: 0 } },
      { type: 'add_cabinet', cabinetType: 'base', id: 'b', placement: { wallId: 'back', offset: 600 } },
    ]).project;
    const lines = buildBom(withRules(two)).lines;
    expect(lines.filter((l) => l.category === 'worktop')).toEqual([expect.objectContaining({ qty: 1 })]);
    expect(lines.find((l) => l.item === 'Side')!.qty).toBe(4);
    expect(lines.filter((l) => l.item.startsWith('Concealed hinge'))).toHaveLength(1);
    expect(lines.find((l) => l.item.startsWith('Concealed hinge'))!.qty).toBe(4);
    expect(fillers(two)).toEqual([]);
  });
});

describe('exports', () => {
  const set = buildDrawingSet(withRules(lKitchen12x10()), DEFAULT_CONFIG('mm'), { generatedAt: AT });

  it('PDF: valid structure, one vector page per sheet, drawing text and metadata', () => {
    const pdf = sheetsToPdf(set.sheets, { title: 'Set', subject: set.revision, created: AT });
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(set.sheets.length);
    expect(pdf).toContain('/MediaBox [0 0 1190.551 841.89]'); // A3 landscape in points
    for (const text of ['(3658)', '(3886)', '(Floor plan)', `(${set.revision.slice(0, 8)})`, '(1:25 on A3)']) expect(pdf).toContain(text.replace(/\)$/, ''));
    expect(pdf).toContain('/CreationDate (D:20261031100000Z)');
    // Every xref offset points at its object.
    const xref = pdf.slice(pdf.lastIndexOf('xref'));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(pdf).toMatch(/\d+(\.\d+)? \d+(\.\d+)? m \d+(\.\d+)? \d+(\.\d+)? l S/); // vector line work
  });

  it('SVG: well-formed, paper-sized viewBox with scale metadata, escaped text', () => {
    const svg = sheetToSvg(set.sheets[0]!);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const root = doc.documentElement;
    expect(root.getAttribute('viewBox')).toBe(`0 0 ${PAPER.A3.w} ${PAPER.A3.h}`);
    expect(root.getAttribute('width')).toBe('420mm');
    expect(root.getAttribute('data-scale')).toBe('1:25 on A3');
    expect(root.getAttribute('data-revision')).toBe(set.revision.slice(0, 8));
    const evil = buildDrawingSet({ ...lKitchen12x10(), name: '<script>alert("x")</script> & co' }, DEFAULT_CONFIG('mm'), { generatedAt: AT });
    const out = sheetToSvg(evil.sheets[0]!);
    expect(out).not.toContain('<script>');
    expect(new DOMParser().parseFromString(out, 'image/svg+xml').getElementsByTagName('script')).toHaveLength(0);
    expect(escapeXml(`a<b>"c"&'d'`)).toBe('a&lt;b&gt;&quot;c&quot;&amp;&apos;d&apos;');
  });

  it('CSV: escapes delimiters, quotes, line breaks and formulas; UTF-8 with stable headers', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(12.5)).toBe('12.50');
    expect(csvCell(null)).toBe('');
    const csv = toCsv(['Name', 'Width (mm)'], [['Ünit, “x”', 600]]);
    expect(csv.startsWith('﻿Name,Width (mm)\r\n')).toBe(true);
    expect(csv).toContain('"Ünit, “x”",600');
    const schedule = scheduleCsv(lKitchen12x10(), ['ref', 'width']);
    expect(schedule.split('\r\n')[0]).toBe('﻿Ref,Object ID,W (mm),Revision');
    const bom = bomCsv(withRules(lKitchen12x10()));
    expect(bom.split('\r\n')[0]).toContain('Category,Item,Material,Thickness (mm),Length (mm),Width (mm),Quantity,Unit of measure,Basis');
    expect(bom).toContain('no (partial)');
  });
});

describe('revisions and readiness', () => {
  it('revision ids are content hashes, independent of key order', () => {
    const p = lKitchen12x10();
    const reordered = JSON.parse(stableJson(p)) as KitchenProject;
    expect(designRevision(reordered)).toBe(designRevision(p));
    expect(buildDrawingSet(p, DEFAULT_CONFIG('mm'), { generatedAt: AT }).revision).toBe(designRevision(p));
    expect(buildDrawingSet(p, DEFAULT_CONFIG('mm'), { generatedAt: AT }).sheets[0]!.title).toMatchObject({ projectId: 'prj_fixture', revision: designRevision(p).slice(0, 8) });
  });

  it('separates presentation, drawings and manufacturing readiness, and blocks incomplete manufacturing', () => {
    const p = lKitchen12x10();
    const none = checkReadiness(p, 'r');
    expect(none.outputs).toMatchObject({ presentation: { status: 'ready' }, drawings: { status: 'ready' }, manufacturing: { status: 'blocked', label: 'Not ready for manufacturing' } });
    expect(none.issues.find((i) => i.code === 'no-construction')!.severity).toBe('blocking');
    // Rules chosen, but a blind corner (unverified) and no hardware products: still blocked.
    const rules = checkReadiness(withRules(p), 'r');
    expect(rules.outputs.manufacturing.status).toBe('blocked');
    expect(rules.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['unsupported-type', 'no-hinge', 'no-handle', 'no-waste']));
    // Without the corner unit and with products specified: ready, not before.
    const noCorner = executeCommand(withRules(p, { hinge: 'Blum Clip top 110°', drawerRunner: 'Blum Tandembox', handle: 'Bar 160', wastePercent: 15 }), { type: 'remove_entity', entityId: 'corner' }).project;
    expect(checkReadiness(noCorner, 'r').outputs.manufacturing).toEqual({ status: 'ready', label: 'Manufacturing-ready' });
    const partial = executeCommand(withRules(p, { hinge: 'H', handle: 'Bar', wastePercent: 10 }), { type: 'remove_entity', entityId: 'corner' }).project;
    expect(checkReadiness(partial, 'r').outputs.manufacturing).toEqual({ status: 'warnings', label: 'Draft: not manufacturing-ready' });
  });

  it('unresolved geometry blocks drawings and manufacturing but not a presentation', () => {
    const p = lKitchen12x10();
    const clash: KitchenProject = { ...p, cabinets: [...p.cabinets, { ...p.cabinets.find((c) => c.id === 'base1')!, id: 'dup' }] };
    const r = checkReadiness(clash, 'r');
    expect(r.outputs).toMatchObject({ presentation: { status: 'warnings' }, drawings: { status: 'blocked' }, manufacturing: { status: 'blocked' } });
  });
});
