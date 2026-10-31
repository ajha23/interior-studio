import { describe, expect, it } from 'vitest';
import { executeCommand, type KitchenProject } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { lKitchen12x10 } from '@/test/kitchens';
import { type Dimension, type ImageRef } from '../deliverables/drawing';
import { sheetsToPdf } from '../deliverables/pdf';
import { designRevision } from '../deliverables/revision';
import { sheetToSvg } from '../deliverables/svg';
import { createPackage, executePackageCommand, type PackageCommand, type PackageEnv } from './commands';
import { composePackage, composePage, dragOverride, type PackageContext } from './compose';
import { parsePackageFile, serializePackage, type ClientPackage } from './schema';

const NOW = new Date('2026-10-31T10:00:00Z');
const env = (project: KitchenProject, ids = sequentialIds()): PackageEnv => ({ project, now: NOW, newId: ids });
const ctx = (project: KitchenProject, assets: Map<string, ImageRef> = new Map()): PackageContext => ({ current: project, assets, generatedAt: NOW });
const run = (pkg: ClientPackage, cmd: PackageCommand, e: PackageEnv) => {
  const r = executePackageCommand(pkg, cmd, e);
  if (!r.ok) throw new Error(r.error);
  return r.package;
};
const dimsOf = (pkg: ClientPackage, pageIndex: number, c: PackageContext) => {
  const body = composePage(pkg, pkg.pages[pageIndex]!, c).sheet.body;
  return body.kind === 'view' ? body.view.prims.filter((p): p is Dimension => p.t === 'dim') : [];
};
/** A 2 × 2 px baseline JPEG is not needed: the writers only copy the bytes. */
const JPEG: ImageRef = { id: 'img_1', w: 4, h: 3, data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) };

describe('client package', () => {
  it('starts with a layout, an elevation per wall in use, a board, a 3D view and a schedule', () => {
    const p = lKitchen12x10();
    const pkg = createPackage(env(p));
    expect(pkg.pages.map((x) => [x.template, x.label ?? '', x.name])).toEqual([
      ['layout', '', 'Kitchen layout'],
      ['elevation', 'A', 'Elevation A — Back wall'],
      ['elevation', 'B', 'Elevation B — Left wall'],
      ['elevation', 'C', 'Elevation C — Front wall'],
      ['hardware', '', 'Hardware & accessories board'],
      ['presentation', '', '3D view'],
      ['schedule', '', 'Cabinet schedule'],
    ]);
    // Only what the project knows is filled in: no invented client or studio.
    expect(pkg.info).toMatchObject({ projectTitle: p.name, client: '', studio: '', date: '31.10.2026' });
    expect(pkg.sources.map((s) => s.revision)).toEqual([designRevision(p)]);
    const pages = composePackage(pkg, ctx(p));
    expect(pages.slice(0, 4).map((x) => x.status)).toEqual(['current', 'current', 'current', 'current']);
    expect(pages[5]!.status).toBe('missing-source');
  });

  it('round-trips through its versioned file and rejects unsafe or foreign content', () => {
    const pkg = createPackage(env(lKitchen12x10()));
    const parsed = parsePackageFile(serializePackage(pkg, NOW));
    expect(parsed).toEqual({ ok: true, package: pkg });
    const evil = JSON.parse(serializePackage(pkg, NOW));
    evil.package.pages[0].notes = [{ id: 'n1', text: 'a\u0007b<script>', x: 1, y: 1, size: 3, bold: false, color: 'red' }];
    const cleaned = parsePackageFile(JSON.stringify(evil));
    expect(cleaned.ok && cleaned.package.pages[0]!.notes[0]!.text).toBe('ab<script>');
    evil.package.pages[0].notes[0].id = '../../x';
    expect(parsePackageFile(JSON.stringify(evil)).ok).toBe(false);
    expect(parsePackageFile('{"format":"other"}').ok).toBe(false);
    expect(parsePackageFile(JSON.stringify({ ...evil, schemaVersion: 99 }))).toMatchObject({ ok: false });
  });

  it('adds, renames, reorders, duplicates and deletes pages', () => {
    const p = lKitchen12x10();
    const e = env(p);
    let pkg = createPackage(e);
    pkg = run(pkg, { type: 'add-page', template: 'elevation', wallId: 'back' }, e);
    expect(pkg.pages.at(-1)).toMatchObject({ template: 'elevation', label: 'D', name: 'Elevation D — Back wall' });
    const id = pkg.pages.at(-1)!.id;
    pkg = run(pkg, { type: 'update-page', pageId: id, patch: { name: 'Island elevation', paper: 'A4', orientation: 'portrait' } }, e);
    pkg = run(pkg, { type: 'move-page', pageId: id, to: 1 }, e);
    expect(pkg.pages[1]).toMatchObject({ id, name: 'Island elevation', paper: 'A4', orientation: 'portrait' });
    pkg = run(pkg, { type: 'duplicate-page', pageId: id }, e);
    expect(pkg.pages[2]).toMatchObject({ name: 'Island elevation (copy)', label: 'E' });
    expect(pkg.pages[2]!.id).not.toBe(id);
    pkg = run(pkg, { type: 'remove-page', pageId: id }, e);
    expect(pkg.pages.some((x) => x.id === id)).toBe(false);
    expect(executePackageCommand(pkg, { type: 'update-page', pageId: pkg.pages[1]!.id, patch: { label: 'A' } }, e)).toMatchObject({ ok: false, error: 'Reference A is already used by another page.' });
    expect(executePackageCommand(pkg, { type: 'update-page', pageId: pkg.pages[0]!.id, patch: { name: '  ' } }, e).ok).toBe(false);
    const portrait = composePage(pkg, pkg.pages[1]!, ctx(p)).sheet;
    expect(sheetToSvg(portrait)).toContain('width="210mm" height="297mm"');
  });

  it('draws layout and elevation dimensions from the model, with elevation markers on the layout', () => {
    const p = lKitchen12x10();
    const pkg = createPackage(env(p));
    const plan = dimsOf(pkg, 0, ctx(p));
    expect(plan.filter((d) => d.role === 'overall').map((d) => d.value).sort((a, b) => a - b)).toEqual([3048, 3048, 3276, 3276, 3658, 3658, 3886, 3886]);
    const layout = composePage(pkg, pkg.pages[0]!, ctx(p));
    expect(layout.handles.filter((h) => h.kind === 'marker').map((h) => h.label)).toEqual(['A', 'B', 'C']);
    const back = dimsOf(pkg, 1, ctx(p));
    expect(back.filter((d) => d.role === 'segment' && d.offset < 0).map((d) => d.value)).toEqual([1000, 800, 600, 600, 600, 58]);
    // Title block: studio-style table with the package's details and the drawing scale.
    const svg = sheetToSvg(layout.sheet);
    for (const t of ['PROJECT:', 'CLIENT:', 'DRAWN BY:', 'DRAWING REVISIONS', '1:25 on A3', '12 × 10 ft L kitchen']) expect(svg).toContain(t);
  });

  it('moves a dimension label without changing the measurement or the design', () => {
    const p = lKitchen12x10();
    const e = env(p);
    let pkg = createPackage(e);
    const page = composePage(pkg, pkg.pages[1]!, ctx(p));
    const h = page.handles.find((x) => x.kind === 'dim' && x.value === 800)!;
    const before = dimsOf(pkg, 1, ctx(p)).find((d) => d.key === h.key)!;
    const override = dragOverride(h, undefined, 6, -4);
    pkg = run(pkg, { type: 'set-override', pageId: pkg.pages[1]!.id, key: h.key, override }, e);
    const after = dimsOf(pkg, 1, ctx(p)).find((d) => d.key === h.key)!;
    expect(after.value).toBe(800);
    expect(after.text).toBe('800');
    expect(after.shift).toBe(override.dx);
    // The line moved by dy on paper (1/scale model mm per paper mm), away from the object when dy > 0.
    const body = composePage(pkg, pkg.pages[1]!, ctx(p)).sheet.body;
    const scale = body.kind === 'view' ? body.scale : 0;
    expect(scale).toBe(1 / 20);
    expect(Math.abs(after.offset) - Math.abs(before.offset)).toBeCloseTo(override.dy / scale);
    expect(composePage(pkg, pkg.pages[1]!, ctx(p)).status).toBe('customized');
    // The design is untouched.
    expect(designRevision(p)).toBe(pkg.pages[1]!.source!.revision);
    expect(executePackageCommand(pkg, { type: 'set-override', pageId: pkg.pages[1]!.id, key: 'width', override: { dx: 1, dy: 0 } }, e).ok).toBe(false);
    pkg = run(pkg, { type: 'set-override', pageId: pkg.pages[1]!.id, key: h.key, override: { dx: 0, dy: 0, hidden: true } }, e);
    expect(dimsOf(pkg, 1, ctx(p)).some((d) => d.key === h.key)).toBe(false);
  });

  it('marks only affected pages stale after a design change and keeps edits through regeneration', () => {
    const p = lKitchen12x10();
    const e = env(p);
    let pkg = createPackage(e);
    const back = pkg.pages[1]!;
    pkg = run(pkg, { type: 'add-note', pageId: back.id, note: { text: 'LED strip will be installed after the kitchen is completed', x: 40, y: 30 } }, e);
    const tag = composePage(pkg, back, ctx(p)).handles.find((h) => h.key === 'tag:sink')!;
    expect(tag.label).toBe('C2');
    const dim1000 = composePage(pkg, back, ctx(p)).handles.find((h) => h.kind === 'dim' && h.value === 1000 && h.key.includes('segment'))!;
    pkg = run(pkg, { type: 'set-override', pageId: back.id, key: tag.key, override: { dx: 3, dy: 2 } }, e);

    // A design edit (cabinet height on the back wall) through the design command pipeline.
    const edited = executeCommand(p, { type: 'resize_cabinet', cabinetId: 'base1', dimensions: { width: 600, height: 750, depth: 560 } }).project;
    const statuses = composePackage(pkg, ctx(edited)).map((x) => x.status);
    expect(statuses[0]).toBe('current'); // the plan does not show heights
    expect(statuses[1]).toBe('stale');
    expect(statuses[2]).toBe('current');
    expect(statuses[6]).toBe('stale'); // the schedule lists heights
    // Until regenerated the page still shows the pinned revision, not the edited one.
    expect(dimsOf(pkg, 1, ctx(edited)).filter((d) => d.role === 'height').map((d) => d.value).slice(0, 3)).toEqual([100, 720, 40]);
    expect(composePage(pkg, pkg.pages[1]!, ctx(edited)).sheet.title.status).toContain('STALE');

    pkg = run(pkg, { type: 'regenerate-page', pageId: back.id }, env(edited));
    const regenerated = composePage(pkg, pkg.pages[1]!, ctx(edited));
    expect(regenerated.status).toBe('customized');
    expect(pkg.pages[1]!.source!.revision).toBe(designRevision(edited));
    const schedule = composePage(pkg, pkg.pages[6]!, ctx(edited));
    expect(schedule.status).toBe('stale');
    expect(pkg.pages[1]!.notes).toHaveLength(1);
    expect(pkg.pages[1]!.overrides[tag.key]).toEqual({ dx: 3, dy: 2 });
    // Both revisions are stored while pages are pinned to them; none once nothing uses them.
    expect(pkg.sources.map((s) => s.revision).sort()).toEqual([designRevision(p), designRevision(edited)].sort());
    expect(dim1000).toBeTruthy();
  });

  it('flags edits whose element changed instead of moving them onto something else', () => {
    const p = lKitchen12x10();
    const e = env(p);
    let pkg = createPackage(e);
    const back = pkg.pages[1]!;
    // The reference tag of base1, which is then removed from the design (the other tags renumber).
    const h = composePage(pkg, back, ctx(p)).handles.find((x) => x.key === 'tag:base1')!;
    expect(h).toMatchObject({ kind: 'tag', elementId: 'base1' });
    pkg = run(pkg, { type: 'set-override', pageId: back.id, key: h.key, override: { dx: 5, dy: 0 } }, e);
    const edited = executeCommand(p, { type: 'remove_entity', entityId: 'base1' });
    expect(edited.result.errors).toEqual([]);
    pkg = run(pkg, { type: 'regenerate-page', pageId: back.id }, env(edited.project));
    const page = composePage(pkg, pkg.pages[1]!, ctx(edited.project));
    expect(page.status).toBe('needs-review');
    expect(page.orphaned).toEqual([h.key]);
    pkg = run(pkg, { type: 'discard-orphans', pageId: back.id, keys: page.orphaned }, e);
    expect(composePage(pkg, pkg.pages[1]!, ctx(edited.project)).status).toBe('current');
  });

  it('builds hardware boards and 3D views from stored images, and marks old snapshots stale', () => {
    const p = lKitchen12x10();
    const e = env(p);
    let pkg = createPackage(e);
    const board = pkg.pages[4]!;
    pkg = run(pkg, { type: 'add-card', pageId: board.id, card: { assetId: JPEG.id, caption: 'Reference image of wicker basket', spec: '600 mm unit' } }, e);
    pkg = run(pkg, { type: 'add-card', pageId: board.id, card: { assetId: 'img_gone', caption: 'Bin holder' } }, e);
    const assets = new Map([[JPEG.id, JPEG]]);
    const composed = composePage(pkg, pkg.pages[4]!, ctx(p, assets));
    expect(composed.status).toBe('missing-source');
    expect(composed.reasons.join(' ')).toContain('1 image is missing');
    expect(composed.handles.filter((h) => h.kind === 'card')).toHaveLength(2);
    const svg = sheetToSvg(composed.sheet);
    expect(svg).toContain('href="data:image/jpeg;base64,/9j/2Q=="');
    expect(svg).toContain('Image missing');
    expect(svg).toContain('REFERENCE IMAGE OF WICKER BASKET');

    const view = pkg.pages[5]!;
    pkg = run(pkg, { type: 'set-snapshot', pageId: view.id, snapshot: { assetId: JPEG.id, caption: 'Kitchen 3D view' } }, e);
    expect(composePage(pkg, pkg.pages[5]!, ctx(p, assets)).status).toBe('current');
    const edited = executeCommand(p, { type: 'resize_cabinet', cabinetId: 'base1', dimensions: { width: 600, height: 750, depth: 560 } }).project;
    expect(composePage(pkg, pkg.pages[5]!, ctx(edited, assets)).status).toBe('stale');
  });

  it('exports the whole package as one PDF with each image stored once', () => {
    const p = lKitchen12x10();
    const e = env(p);
    let pkg = createPackage(e);
    pkg = run(pkg, { type: 'add-card', pageId: pkg.pages[4]!.id, card: { assetId: JPEG.id, caption: 'Drawer' } }, e);
    pkg = run(pkg, { type: 'set-snapshot', pageId: pkg.pages[5]!.id, snapshot: { assetId: JPEG.id, caption: 'View' } }, e);
    pkg = run(pkg, { type: 'add-note', pageId: pkg.pages[0]!.id, note: { text: 'Note (with) \\ specials', x: 20, y: 20 } }, e);
    const sheets = composePackage(pkg, ctx(p, new Map([[JPEG.id, JPEG]]))).map((x) => x.sheet);
    const pdf = sheetsToPdf(sheets, { title: pkg.name, subject: 'test', created: NOW });
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(7);
    expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(1);
    expect(pdf).toContain('/DCTDecode');
    expect(pdf).toContain('(Note \\(with\\) \\\\ specials) Tj');
    expect(pdf).toContain('/MediaBox [0 0 1190.551 841.89]');
  });
});
