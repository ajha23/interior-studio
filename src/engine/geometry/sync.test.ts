import { describe, expect, it } from 'vitest';
import { allElements, createExampleProject, executeCommand, type KitchenElement, type KitchenProject } from '@/domain';
import { elementBox } from './box';
import { buildParts } from './parts';
import { localToRoom } from './transform';

/**
 * The plan draws each element's footprint with `elementBox`; the 3D view draws its procedural parts
 * placed by the element's position and rotation (`localToRoom`, the same transform the renderer
 * applies). Both come from the one canonical model, so they must cover exactly the same space.
 */
function bodyBoxIn3d(el: KitchenElement) {
  const pts = buildParts(el)
    .filter((p) => p.body)
    .flatMap((p) =>
      [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => localToRoom(el, { x: p.center.x + (sx * p.size.x) / 2, y: p.center.y + (sy * p.size.y) / 2, z: p.center.z + (sz * p.size.z) / 2 })))),
    );
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    minX: r(Math.min(...pts.map((p) => p.x))),
    maxX: r(Math.max(...pts.map((p) => p.x))),
    minY: r(Math.min(...pts.map((p) => p.y))),
    maxY: r(Math.max(...pts.map((p) => p.y))),
    minZ: r(Math.min(...pts.map((p) => p.z))),
    maxZ: r(Math.max(...pts.map((p) => p.z))),
  };
}

function expectInSync(project: KitchenProject) {
  for (const el of allElements(project)) expect(bodyBoxIn3d(el), `${el.type} ${el.id}`).toEqual(elementBox(el));
}

describe('plan and 3D agree', () => {
  it('every element of the example kitchen, on every wall and rotation, plus furniture', () => {
    const p = executeCommand(createExampleProject(), { type: 'add_furniture', furnitureType: 'table', id: 'tbl' }).project;
    expect(p.furniture).toHaveLength(1);
    expectInSync(p);
  });

  it('still agree after resizing, moving, rotating and switching units', () => {
    let p = executeCommand(createExampleProject(), { type: 'add_furniture', furnitureType: 'sofa', id: 'sofa' }).project;
    const base = p.cabinets.find((c) => c.type === 'base' && c.wallId === 'left')!;
    for (const cmd of [
      { type: 'resize_cabinet' as const, cabinetId: base.id, dimensions: { width: 600, height: 780, depth: 600 } },
      { type: 'rotate_entity' as const, entityId: 'sofa', rotationY: 90 as const },
      { type: 'resize_furniture' as const, furnitureId: 'sofa', dimensions: { width: 1800, height: 820, depth: 950 } },
      { type: 'set_measurement_unit' as const, unit: 'ft-in' as const },
    ]) {
      const r = executeCommand(p, cmd);
      expect(r.result.errors).toEqual([]);
      p = r.project;
      expectInSync(p);
    }
  });
});
