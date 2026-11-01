import { describe, it, expect } from 'vitest';
import { createProject, DEFAULT_ROOM, type KitchenProject } from '@/domain';
import { DxfBuilder, exportPlanDxf } from './dxf';

describe('AutoCAD DXF Exporter', () => {
  it('constructs a valid DXF ASCII structure with standard layers', () => {
    const builder = new DxfBuilder();
    builder.addLine(0, 0, 1000, 0, 'WALLS');
    builder.addCircle(500, 500, 50, 'MEP_PLUMBING');
    builder.addText(500, 500, 50, 'WATER_INLET', 'MEP_PLUMBING');

    const dxf = builder.stringify();

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('$ACADVER');
    expect(dxf).toContain('AC1009'); // AutoCAD R12 standard
    expect(dxf).toContain('TABLES');
    expect(dxf).toContain('WALLS');
    expect(dxf).toContain('MEP_PLUMBING');
    expect(dxf).toContain('MEP_ELECTRICAL');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('EOF');
  });

  it('exports complete kitchen project plan with walls, cabinets, and MEP to DXF', () => {
    const project: KitchenProject = {
      ...createProject({ name: 'Villa Kitchen', room: DEFAULT_ROOM, layout: 'straight' }),
      mep: [
        {
          id: 'p1',
          kind: 'electrical_16a',
          wallId: 'back',
          offset: 1500,
          elevation: 1100,
          label: 'Hob Ignition',
        },
      ],
    };

    const dxf = exportPlanDxf(project);

    expect(dxf).toContain('Villa Kitchen (Plan)');
    expect(dxf).toContain('CABINETS');
    expect(dxf).toContain('WORKTOPS');
    expect(dxf).toContain('MEP_ELECTRICAL');
    expect(dxf).toContain('Hob Ignition');
  });
});

