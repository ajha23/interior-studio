import { describe, expect, it } from 'vitest';
import { sequentialIds } from '@/test/ids';
import { createExampleProject, createProject, DEFAULT_ROOM, makeCabinet, libraryMaterials, DEFAULT_SURFACES, SCHEMA_VERSION, type KitchenProject } from '@/domain';
import { elevation } from '../drawings/elevation';
import { cutList, cutListCsv } from './cutlist';
import { cabinetSchedule, unitRefs } from './schedule';

const straight = () => createProject({ name: 'p', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());

function single(): KitchenProject {
  const base = makeCabinet(DEFAULT_ROOM, { id: 'b', type: 'base', wallId: 'back', offset: 0, dimensions: { width: 600, height: 720, depth: 560 }, materialId: 'shutter-oak' });
  return { schemaVersion: SCHEMA_VERSION, id: 'p', name: 'One', room: DEFAULT_ROOM, surfaces: { ...DEFAULT_SURFACES }, materials: libraryMaterials(), cabinets: [base], appliances: [], viewpoints: [], openings: [], furniture: [], preferences: { unit: 'mm' }, production: {} };
}

describe('schedule and references', () => {
  it('numbers cabinets and appliances in reading order around the room', () => {
    const p = straight();
    const refs = unitRefs(p);
    const fridge = p.appliances.find((a) => a.type === 'fridge')!;
    const base = p.cabinets.find((c) => c.type === 'base')!;
    expect(refs.get(fridge.id)).toBe('A1');
    expect(refs.get(base.id)).toBe('C1');
    const rows = cabinetSchedule(p);
    expect(rows).toHaveLength(p.cabinets.length + p.appliances.length);
    expect(rows.find((r) => r.ref === 'C1')).toMatchObject({ label: 'Base cabinet', width: 600, location: 'Back wall @ 700', fronts: '1 door', interior: '1 × shelf' });
  });
});

describe('cut list', () => {
  it('a 600 × 720 × 560 base cabinet with one shelf breaks down into the expected panels and hardware', () => {
    const list = cutList(single());
    const find = (part: string) => list.panels.filter((r) => r.part === part);
    expect(find('Side')).toEqual([expect.objectContaining({ length: 720, width: 542, thickness: 18, qty: 2, banding: '1 long' })]);
    expect(find('Top')[0]).toMatchObject({ length: 564, width: 542, qty: 1 });
    expect(find('Bottom')[0]).toMatchObject({ length: 564, width: 542, qty: 1 });
    expect(find('Back')[0]).toMatchObject({ length: 684, width: 564, thickness: 8, qty: 1, banding: '—' });
    expect(find('Shelf')[0]).toMatchObject({ length: 564, thickness: 18, qty: 1 });
    expect(find('Door')[0]).toMatchObject({ length: 717, width: 597, thickness: 18, qty: 1, material: 'Natural oak', banding: 'all 4' });
    expect(find('Plinth')[0]).toMatchObject({ length: 596, width: 100, thickness: 18, qty: 1, material: 'Plinth board' });
    const hw = Object.fromEntries(list.hardware.map((h) => [h.item, h.qty]));
    expect(hw).toEqual({ 'Concealed hinge': 2, Handle: 1, 'Shelf support': 4, 'Adjustable leg': 4 });
    expect(list.boards.every((b) => b.boards >= 1)).toBe(true);
  });

  it('counts drawer runners, glass and hinges for taller doors across the example kitchen', () => {
    const list = cutList(createExampleProject());
    const hw = Object.fromEntries(list.hardware.map((h) => [h.item, h.qty]));
    expect(hw['Drawer runners (pair)']).toBe(3);
    // The tall unit's 1260 mm lower door takes 3 hinges.
    expect(hw['Concealed hinge']).toBeGreaterThan(10);
    expect(list.worktops.length).toBe(3);
    const csv = cutListCsv(list);
    expect(csv.split('\n')[0]).toBe('Part,Material,Thickness (mm),Length (mm),Width (mm),Qty,Edge banding,Units');
    expect(csv.trim().split('\n')).toHaveLength(1 + list.panels.length + list.glass.length);
  });
});

describe('elevations', () => {
  it('the back wall of the straight kitchen shows every unit at its offset with a closed width chain', () => {
    const p = straight();
    const e = elevation(p, 'back');
    expect(e.length).toBe(4200);
    const floorChain = e.shapes.filter((s) => s.kind === 'dim' && !s.vertical && s.y1 === -180);
    expect(floorChain.map((s) => (s.kind === 'dim' ? s.text : ''))).toEqual(['700', '600', '800', '600', '600', '600', '300']);
    const total = floorChain.reduce((sum, s) => sum + (s.kind === 'dim' ? Number(s.text) : 0), 0);
    expect(total).toBe(4200);
    // Height marks include the plinth (100), worktop (860) and the wall units (1480 / 2200).
    const heights = e.shapes.filter((s) => s.kind === 'dim' && s.vertical && s.x1 === -180).map((s) => (s.kind === 'dim' ? s.y2 : 0));
    expect(heights).toEqual(expect.arrayContaining([100, 860, 1480, 2200, 2700]));
    expect(e.shapes.filter((s) => s.kind === 'tag').map((s) => (s.kind === 'tag' ? s.text : ''))).toContain('C1');
  });

  it('left and right walls are drawn from inside the room (left wall: back corner on the right)', () => {
    const p = createProject({ name: 'l', room: { ...DEFAULT_ROOM, width: 3600 }, layout: 'l-shaped' }, sequentialIds());
    const left = elevation(p, 'left');
    const drawer = p.cabinets.find((c) => c.type === 'drawer' && c.wallId === 'left')!;
    const carcass = left.shapes.find((s) => s.kind === 'rect' && s.style === 'carcass' && s.y === 100 && s.w === 600);
    // The drawer unit is nearest the back wall (z 580–1180), so it is at the right end: u = 3200 − 1180.
    expect(carcass && carcass.kind === 'rect' ? carcass.x : -1).toBe(3200 - (drawer.position.z + 300));
    expect(elevation(p, 'right').empty).toBe(true);
  });

  it('openings appear on their wall', () => {
    const e = elevation(createExampleProject(), 'back');
    expect(e.shapes.some((s) => s.kind === 'rect' && s.style === 'opening')).toBe(true);
  });
});
