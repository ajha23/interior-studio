import { describe, it, expect } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { mepPlanView, buildMepScheduleSheet } from './mepSheet';

describe('MEP Service Layout Sheet Engine', () => {
  it('generates an MEP service plan view with tags and dimensions', () => {
    const project = createProject({
      name: 'MEP Test Project',
      room: DEFAULT_ROOM,
      layout: 'empty',
    });

    project.mep = [
      {
        id: 'mep_hob',
        kind: 'electrical_16a',
        wallId: 'back',
        offset: 1500,
        elevation: 450,
        label: 'Hob 16A Socket',
      },
      {
        id: 'mep_sink_in',
        kind: 'water_inlet',
        wallId: 'back',
        offset: 2400,
        elevation: 500,
        label: 'Sink Hot/Cold Inlet',
      },
    ];

    const view = mepPlanView(project);
    expect(view.id).toBe('mep-plan-view');
    expect(view.prims.length).toBeGreaterThan(0);

    const tags = view.prims.filter((p) => p.t === 'tag');
    expect(tags.length).toBe(2);
    expect(tags.some((t) => t.t === 'tag' && t.text === 'E16')).toBe(true);
    expect(tags.some((t) => t.t === 'tag' && t.text === 'W_IN')).toBe(true);

    const dims = view.prims.filter((p) => p.t === 'dim');
    expect(dims.length).toBe(2);
  });

  it('generates a tabular MEP schedule sheet', () => {
    const project = createProject({
      name: 'MEP Schedule Project',
      room: DEFAULT_ROOM,
      layout: 'empty',
    });

    project.mep = [
      {
        id: 'mep_chimney',
        kind: 'chimney_duct',
        wallId: 'back',
        offset: 1500,
        elevation: 2100,
        label: 'Chimney 150mm Duct',
      },
    ];

    const sheet = buildMepScheduleSheet(project, 'REV12345');
    expect(sheet.id).toBe('mep-schedule');
    expect(sheet.body.kind).toBe('table');
    if (sheet.body.kind === 'table') {
      expect(sheet.body.rows.length).toBe(1);
      expect(sheet.body.rows[0]?.[0]).toBe('CHIM');
      expect(sheet.body.rows[0]?.[1]).toBe('Chimney Exhaust Duct');
      expect(sheet.body.rows[0]?.[3]).toBe('1500');
      expect(sheet.body.rows[0]?.[4]).toBe('2100');
    }
  });
});
