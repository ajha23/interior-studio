import { describe, expect, it } from 'vitest';
import { CATALOG, catalogById, searchCatalog } from './library';
import { libraryPrims, newLibraryItem } from './items';
import { MATERIALS, materialById } from '../materials/library';
import { FINISHES, FLOOR_FINISHES, WALL_COLORS } from '../domain/catalog';
import { envelope } from '../furniture';
import { migrateScene } from '../persistence/migrate';
import { SCENE_MIGRATIONS } from '../persistence/sceneMigrations';
import { sampleProject } from '../domain/factory';
import { SCHEMA_VERSION } from '../domain/types';
import { validateProject } from '../validation';
import { mm } from '../domain/units';

describe('catalogue', () => {
  it('has unique ids and valid default materials', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    const ids = new Set(MATERIALS.map((m) => m.id));
    for (const c of CATALOG) {
      expect(ids.has(c.finish), `${c.id} finish ${c.finish}`).toBe(true);
      expect(ids.has(c.accent), `${c.id} accent ${c.accent}`).toBe(true);
    }
  });

  it('keeps every Phase 0 material id', () => {
    for (const f of [...FINISHES, ...FLOOR_FINISHES, ...WALL_COLORS]) expect(materialById(f.id).id).toBe(f.id);
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(MATERIALS.length);
  });

  it('builds finite geometry that stays near its envelope at any size', () => {
    for (const c of CATALOG) {
      for (const s of [1, 0.6, 1.5]) {
        const item = newLibraryItem(c, 0, 0);
        item.params = { ...item.params, widthUm: Math.round(item.params.widthUm * s), depthUm: Math.round(item.params.depthUm * s) };
        const prims = libraryPrims(item);
        expect(prims.length).toBeGreaterThan(0);
        for (const p of prims) {
          for (const v of [p.x, p.y, p.z, p.w, p.d, p.h]) expect(Number.isFinite(v), `${c.id}.${p.key}`).toBe(true);
          expect(p.w, `${c.id}.${p.key}`).toBeGreaterThan(0);
          expect(p.x + p.w, `${c.id}.${p.key}@${s}`).toBeLessThanOrEqual(item.params.widthUm + mm(5));
          expect(p.y + p.d, `${c.id}.${p.key}@${s}`).toBeLessThanOrEqual(item.params.depthUm + mm(40));
        }
      }
    }
  });

  it('searches by name, tag and category', () => {
    expect(searchCatalog('pooja').map((c) => c.id)).toContain('pooja-unit');
    expect(searchCatalog('fan', 'lighting').map((c) => c.id)).toContain('ceiling-fan');
    expect(searchCatalog('sofa', 'kitchen')).toHaveLength(0);
    expect(searchCatalog('').length).toBe(CATALOG.length);
  });

  it('lifts wall-mounted pieces by their elevation', () => {
    const tv = newLibraryItem(catalogById('split-ac')!, 0, 0);
    const e = envelope(tv);
    expect(e.zMinUm).toBe(mm(2150));
    expect(e.heightUm).toBe(mm(2150 + 320));
  });

  it('flags a library piece above the ceiling', () => {
    const p = sampleProject();
    const ac = newLibraryItem(catalogById('split-ac')!, mm(1800), mm(400));
    ac.params.elevationUm = mm(2600);
    const issues = validateProject({ ...p, furniture: [ac] });
    expect(issues.some((i) => i.code === 'ABOVE_CEILING')).toBe(true);
  });

  it('migrates v2 scenes to v3 unchanged', () => {
    const p = sampleProject();
    const v2 = { ...p, schemaVersion: 2 };
    const out = migrateScene(v2, 2, SCENE_MIGRATIONS) as typeof p;
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.plan).toEqual(p.plan);
    expect(out.furniture).toEqual(p.furniture);
  });

  it('lets rugs sit under furniture', () => {
    const p = sampleProject();
    const bed = p.furniture.find((f) => f.kind === 'bed')!;
    const rug = newLibraryItem(catalogById('rug')!, bed.xUm, bed.yUm);
    const issues = validateProject({ ...p, furniture: [...p.furniture, rug] });
    expect(issues.filter((i) => i.itemIds.includes(rug.id) && i.code === 'OVERLAP')).toHaveLength(0);
  });
});
