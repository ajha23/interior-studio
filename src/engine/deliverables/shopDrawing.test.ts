import { describe, it, expect } from 'vitest';
import { buildModuleShopDrawing } from './shopDrawing';
import { SEED_RULE_PACK_V1 } from '@/domain/manufacturing/rulePack';

describe('Module Orthographic Shop Drawing Generator', () => {
  it('generates an exploded panel view for a standard base cabinet', () => {
    const cabinet = {
      id: 'cab_base_600',
      type: 'base',
      dimensions: { width: 600, height: 720, depth: 560 },
      materialId: 'PLY-BWP-18',
      shutterMaterialId: 'MDF-MR-18-ACRYLIC',
    };

    const res = buildModuleShopDrawing(cabinet, SEED_RULE_PACK_V1);
    expect(res.moduleCode).toBe('BASE-600');
    expect(res.totalParts).toBe(8);
    expect(res.totalHardware).toBeGreaterThan(0);

    const { view } = res;
    expect(view.prims.length).toBeGreaterThan(20);

    // Bounding rectangles for panels
    const rects = view.prims.filter((p) => p.t === 'rect');
    expect(rects.length).toBe(8);

    // Dimensions present for each panel
    const dims = view.prims.filter((p) => p.t === 'dim');
    expect(dims.length).toBe(16); // Width and length per part

    // Boring hole circles and crosshairs present for side gables and shutters
    const arcs = view.prims.filter((p) => p.t === 'arc');
    expect(arcs.length).toBeGreaterThan(0);
  });
});

