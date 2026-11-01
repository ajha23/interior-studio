import { describe, it, expect } from 'vitest';
import { createProject, DEFAULT_ROOM, type KitchenProject } from '@/domain';
import { checkMepSafety } from './mepChecks';

describe('MEP Safety & Clearance Engine', () => {
  it('flags warning when electrical point is within 300mm of water point', () => {
    const project: KitchenProject = {
      ...createProject({ name: 'MEP Test', room: DEFAULT_ROOM, layout: 'empty' }),
      mep: [
        {
          id: 'p_water',
          kind: 'water_inlet',
          wallId: 'back',
          offset: 1200,
          elevation: 500,
          label: 'Cold Water Supply',
        },
        {
          id: 'p_elec_close',
          kind: 'electrical_6a',
          wallId: 'back',
          offset: 1350, // 150mm distance (< 300mm)
          elevation: 1100,
          label: 'Mixer Socket',
        },
      ],
    };

    const issues = checkMepSafety(project);
    expect(issues.some((i) => i.code === 'MEP_WATER_ELECTRICAL_PROXIMITY')).toBe(true);
    expect(issues[0]?.message).toContain('only 150 mm');
  });

  it('passes when electrical point is safely beyond 300mm', () => {
    const project: KitchenProject = {
      ...createProject({ name: 'MEP Safe', room: DEFAULT_ROOM, layout: 'empty' }),
      mep: [
        {
          id: 'p_water',
          kind: 'water_inlet',
          wallId: 'back',
          offset: 1200,
          elevation: 500,
        },
        {
          id: 'p_elec_safe',
          kind: 'electrical_6a',
          wallId: 'back',
          offset: 1700, // 500mm distance (>= 300mm)
          elevation: 1100,
        },
      ],
    };

    const issues = checkMepSafety(project);
    expect(issues.filter((i) => i.code === 'MEP_WATER_ELECTRICAL_PROXIMITY')).toHaveLength(0);
  });

  it('checks chimney duct alignment with range hood', () => {
    const baseProject = createProject({ name: 'Chimney Test', room: DEFAULT_ROOM, layout: 'empty' });
    // Add hood at offset 1500 (width 900 -> centre = 1500 + 450 = 1950)
    const project: KitchenProject = {
      ...baseProject,
      appliances: [
        {
          id: 'app_hood',
          type: 'hood',
          dimensions: { width: 900, height: 500, depth: 500 },
          position: { x: 1950, y: 1500, z: 250 },
          rotationY: 0,
          wallId: 'back',
        },
      ],
      mep: [
        {
          id: 'p_duct_misaligned',
          kind: 'chimney_duct',
          wallId: 'back',
          offset: 1750, // 200mm offset from centre 1950 (> 75mm)
          elevation: 2200,
        },
      ],
    };

    const issues = checkMepSafety(project);
    expect(issues.some((i) => i.code === 'MEP_HOOD_CHIMNEY_MISALIGNMENT')).toBe(true);
  });
});
