import { describe, expect, it } from 'vitest';
import { sequentialIds } from '@/test/ids';
import {
  CABINET_SPECS,
  INTERIOR_PRESETS,
  interiorErrors,
  interiorPreset,
  newFitting,
  parseProjectFile,
  serializeProject,
  computeBom,
  createExampleProject,
  createProject,
  DEFAULT_ROOM,
  deriveCountertops,
  executeCommand,
  offsetAlongWall,
  spanAlongWall,
  validateProject,
  type DesignCommand,
  type KitchenCabinet,
  type KitchenProject,
} from '@/domain';

const straight = () => createProject({ name: 'Test', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());
const lShaped = () => createProject({ name: 'L', room: { width: 3600, length: 3200, height: 2700, wallThickness: 150 }, layout: 'l-shaped' }, sequentialIds());

function cabinet(p: KitchenProject, type: KitchenCabinet['type'], wallId = 'back'): KitchenCabinet {
  const c = p.cabinets.find((x) => x.type === type && x.wallId === wallId);
  if (!c) throw new Error(`no ${type} on ${wallId}`);
  return c;
}

function run(p: KitchenProject, ...commands: DesignCommand[]): KitchenProject {
  return commands.reduce((acc, cmd) => {
    const { project, result } = executeCommand(acc, cmd, { newId: sequentialIds() });
    expect(result.errors).toEqual([]);
    return project;
  }, p);
}

describe('layout presets', () => {
  it.each(['straight', 'l-shaped', 'empty'] as const)('%s layout has no validation issues', (layout) => {
    const room = layout === 'l-shaped' ? { ...DEFAULT_ROOM, width: 3600 } : DEFAULT_ROOM;
    expect(validateProject(createProject({ name: 'x', room, layout }))).toEqual([]);
  });

  it('example kitchen is valid and uses mixed finishes', () => {
    const p = createExampleProject();
    expect(validateProject(p)).toEqual([]);
    expect(new Set(p.cabinets.map((c) => c.materialId)).size).toBeGreaterThan(1);
  });

  it('rejects a layout that does not fit the room', () => {
    const p = createProject({ name: 'Small', room: { ...DEFAULT_ROOM, width: 3000 }, layout: 'empty' });
    const { project, result } = executeCommand(p, { type: 'apply_layout', layout: 'straight' });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/needs a back wall of at least 3900 mm/);
    expect(project).toBe(p);
  });
});

describe('resizing cabinets', () => {
  it('600 → 900 mm keeps the id, updates dimensions, ripples the run and the worktop', () => {
    const p = straight();
    const base = cabinet(p, 'base');
    const sink = cabinet(p, 'sink');
    const before = deriveCountertops(p);
    expect(before.map((c) => c.length)).toEqual([2000, 600]);

    const { project, result } = executeCommand(p, { type: 'resize_cabinet', cabinetId: base.id, dimensions: { width: 900, height: 720, depth: 560 } });
    expect(result.success).toBe(true);
    const resized = project.cabinets.find((c) => c.id === base.id)!;
    expect(resized.dimensions).toEqual({ width: 900, height: 720, depth: 560 });
    expect(offsetAlongWall(resized)).toBe(offsetAlongWall(base));
    expect(spanAlongWall(project.cabinets.find((c) => c.id === sink.id)!).start).toBe(spanAlongWall(sink).start + 300);
    expect(deriveCountertops(project).map((c) => c.length)).toEqual([2300, 600]);
    expect(validateProject(project)).toEqual([]);
  });

  it('rejects an out-of-range width and leaves the project untouched', () => {
    const p = straight();
    const { project, result } = executeCommand(p, { type: 'resize_cabinet', cabinetId: cabinet(p, 'base').id, dimensions: { width: 1500, height: 720, depth: 560 } });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Width 1500 mm is outside the base cabinet range 150–1200 mm/);
    expect(project).toBe(p);
  });

  it('rejects non-integer and out-of-range dimensions', () => {
    const p = straight();
    const id = cabinet(p, 'base').id;
    expect(executeCommand(p, { type: 'resize_cabinet', cabinetId: id, dimensions: { width: 600.5, height: 720, depth: 560 } }).result.errors[0]).toMatch(/whole number/);
    expect(executeCommand(p, { type: 'resize_cabinet', cabinetId: id, dimensions: { width: 600, height: 1200, depth: 560 } }).result.errors[0]).toMatch(/Height 1200 mm is outside/);
  });

  it('rejects a resize that pushes the run past the wall', () => {
    const p = run(straight(), { type: 'resize_cabinet', cabinetId: cabinet(straight(), 'base').id, dimensions: { width: 900, height: 720, depth: 560 } });
    const { result, project } = executeCommand(p, { type: 'resize_cabinet', cabinetId: cabinet(p, 'base').id, dimensions: { width: 1200, height: 720, depth: 560 } });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Not enough space on the back wall: a 1200 mm base cabinet pushes Drawer unit 600 300 mm past the end/);
    expect(project).toBe(p);
  });
});

describe('materials', () => {
  it('changing a shutter finish keeps dimensions and position', () => {
    const p = straight();
    const base = cabinet(p, 'base');
    const next = run(p, { type: 'set_material', targetIds: [base.id], materialId: 'shutter-oak' });
    const after = next.cabinets.find((c) => c.id === base.id)!;
    expect(after.materialId).toBe('shutter-oak');
    expect(after.dimensions).toEqual(base.dimensions);
    expect(after.position).toEqual(base.position);
  });

  it('rejects a finish from the wrong category', () => {
    const p = straight();
    const { result } = executeCommand(p, { type: 'set_material', targetIds: [cabinet(p, 'base').id], materialId: 'floor-oak' });
    expect(result.errors[0]).toMatch(/floor finish/);
    expect(executeCommand(p, { type: 'set_surface_material', surface: 'countertop', materialId: 'counter-oak' }).project.surfaces.countertop).toBe('counter-oak');
  });
});

describe('adding, moving and removing', () => {
  it('auto-places a new cabinet in the first free spot without overlaps', () => {
    const p = straight();
    const { project, result } = executeCommand(p, { type: 'add_cabinet', cabinetType: 'base', id: 'new_base' });
    expect(result.success).toBe(true);
    const added = project.cabinets.find((c) => c.id === 'new_base')!;
    expect(added.wallId).toBe('left');
    expect(validateProject(project)).toEqual([]);
  });

  it('rejects a move onto another unit and a floor unit lifted off the floor', () => {
    const p = straight();
    const drawer = cabinet(p, 'drawer');
    expect(executeCommand(p, { type: 'move_entity', entityId: drawer.id, placement: { wallId: 'back', offset: 0 } }).result.errors[0]).toMatch(/overlaps/);
    expect(executeCommand(p, { type: 'move_entity', entityId: drawer.id, placement: { wallId: 'back', offset: 3600, elevation: 500 } }).result.errors[0]).toMatch(/elevation is fixed/);
    const moved = run(p, { type: 'move_entity', entityId: drawer.id, placement: { wallId: 'back', offset: 3600 } });
    expect(spanAlongWall(moved.cabinets.find((c) => c.id === drawer.id)!)).toEqual({ start: 3600, end: 4200 });
  });

  it('keeps right-wall units against their wall when the room grows', () => {
    const p = run(straight(), { type: 'add_cabinet', cabinetType: 'base', id: 'r1', placement: { wallId: 'right', offset: 1000 } });
    const x = p.cabinets.find((c) => c.id === 'r1')!.position.x;
    const grown = run(p, { type: 'set_room', room: { ...p.room, width: 4700 } });
    expect(grown.cabinets.find((c) => c.id === 'r1')!.position.x).toBe(x + 500);
  });

  it('rejects shrinking the room below the kitchen', () => {
    const p = straight();
    const { result } = executeCommand(p, { type: 'set_room', room: { ...p.room, width: 3800 } });
    expect(result.success).toBe(false);
    expect(executeCommand(p, { type: 'set_room', room: { ...p.room, width: 1000 } }).result.errors[0]).toMatch(/Room width must be at least 1500 mm/);
  });

  it('removes an element and rejects unknown ids', () => {
    const p = straight();
    const id = cabinet(p, 'sink').id;
    expect(run(p, { type: 'remove_entity', entityId: id }).cabinets.some((c) => c.id === id)).toBe(false);
    expect(executeCommand(p, { type: 'remove_entity', entityId: 'nope' }).result.errors[0]).toMatch(/No element/);
  });

  it('rejects malformed commands before touching the project', () => {
    const p = straight();
    const { project, result } = executeCommand(p, { type: 'explode' });
    expect(result.success).toBe(false);
    expect(project).toBe(p);
  });
});

describe('countertops', () => {
  it('L-shaped runs produce slabs that meet without overlapping', () => {
    const slabs = deriveCountertops(lShaped());
    expect(slabs.map((s) => [s.wallId, s.length])).toEqual([['back', 3000], ['left', 600], ['left', 600]]);
    const back = slabs[0]!.box;
    const left = slabs[1]!.box;
    expect(left.minZ).toBeGreaterThanOrEqual(back.maxZ);
  });
});

describe('BOM', () => {
  it('counts and dimensions match the project model', () => {
    const p = straight();
    const bom = computeBom(p);
    expect(bom.totals.cabinetCount).toBe(p.cabinets.length);
    expect(bom.totals.applianceCount).toBe(p.appliances.length);
    expect(bom.cabinets.reduce((s, r) => s + r.quantity, 0)).toBe(p.cabinets.length);
    const wall600 = bom.cabinets.find((r) => r.type === 'wall' && r.width === 600)!;
    expect(wall600.quantity).toBe(3);
    expect(bom.totals.countertopLength).toBe(2600);

    const resized = run(p, { type: 'resize_cabinet', cabinetId: cabinet(p, 'base').id, dimensions: { width: 900, height: 720, depth: 560 } });
    expect(computeBom(resized).cabinets.find((r) => r.type === 'base')!.width).toBe(900);
  });
});

describe('custom widths', () => {
  it('accepts any whole-millimetre width in the range (650 mm base cabinet)', () => {
    const p = straight();
    const { result, project } = executeCommand(p, { type: 'resize_cabinet', cabinetId: cabinet(p, 'base').id, dimensions: { width: 650, height: 720, depth: 560 } });
    expect(result.success).toBe(true);
    expect(cabinet(project, 'base').dimensions.width).toBe(650);
  });
});

describe('free placement and rotation', () => {
  it('places a floor unit free-standing, rotates it, and gives it its own worktop', () => {
    const p = run(straight(), { type: 'add_cabinet', cabinetType: 'base', id: 'island', placement: { wallId: 'front', offset: 1500 } });
    const placed = run(p, { type: 'place_entity', entityId: 'island', x: 2100, z: 1800, rotationY: 90 });
    const island = placed.cabinets.find((c) => c.id === 'island')!;
    expect(island.wallId).toBeUndefined();
    expect(island.position).toEqual({ x: 2100, y: 100, z: 1800 });
    const slab = deriveCountertops(placed).find((s) => s.entityIds.includes('island'))!;
    expect(slab.wallId).toBeNull();
    // Facing +x: the worktop overhangs on the +x side only.
    expect(slab.box.maxX - slab.box.minX).toBe(560 + 20);
    const rotated = run(placed, { type: 'rotate_entity', entityId: 'island', rotationY: 180 });
    expect(rotated.cabinets.find((c) => c.id === 'island')!.rotationY).toBe(180);
  });

  it('keeps wall units on walls', () => {
    const p = straight();
    const wall = cabinet(p, 'wall');
    expect(executeCommand(p, { type: 'place_entity', entityId: wall.id, x: 2000, z: 1500, rotationY: 0 }).result.errors[0]).toMatch(/hangs on a wall/);
    expect(executeCommand(p, { type: 'rotate_entity', entityId: wall.id, rotationY: 90 }).result.success).toBe(false);
  });

  it('a free unit resizes keeping its back and left side; odd widths keep whole-millimetre edges', () => {
    const p = run(straight(), { type: 'add_cabinet', cabinetType: 'base', id: 'isl', placement: { wallId: 'front', offset: 1500 } }, { type: 'place_entity', entityId: 'isl', x: 2000, z: 1600, rotationY: 0 });
    const resized = run(p, { type: 'resize_cabinet', cabinetId: 'isl', dimensions: { width: 651, height: 720, depth: 600 } });
    const isl = resized.cabinets.find((c) => c.id === 'isl')!;
    expect(isl.position.x - 651 / 2).toBe(2000 - 300);
    expect(isl.position.z - 600 / 2).toBe(1600 - 280);
    const reparsed = parseProjectFile(serializeProject(resized));
    expect(reparsed.ok).toBe(true);
  });
});

describe('cabinet interiors', () => {
  it('every preset is valid on every cabinet type at default and extreme heights', () => {
    for (const type of ['base', 'wall', 'tall', 'sink', 'corner', 'drawer'] as const) {
      const spec = CABINET_SPECS[type];
      for (const height of [spec.height.min, spec.defaults.height, spec.height.max]) {
        for (const preset of INTERIOR_PRESETS) {
          const dims = { ...spec.defaults, height };
          const { interior, frontStyle } = interiorPreset(type, dims, preset, 3);
          expect(interiorErrors({ type, dimensions: dims, interior, frontStyle: type === 'drawer' ? 'solid' : (frontStyle ?? 'solid') }), `${type} ${height} ${preset}`).toEqual([]);
        }
      }
    }
  });

  it('crockery preset gives glass doors, a plate rack and glass shelves', () => {
    const p = straight();
    const wall = cabinet(p, 'wall');
    const next = run(p, { type: 'apply_interior_preset', cabinetId: wall.id, preset: 'crockery' });
    const c = next.cabinets.find((x) => x.id === wall.id)!;
    expect(c.frontStyle).toBe('glass');
    expect(c.interior.sections[0]!.fittings.map((f) => f.kind)).toEqual(['plate-rack', 'shelf']);
    expect(c.interior.sections[0]!.fittings[1]).toMatchObject({ glass: true });
  });

  it('rejects overlapping fittings and sections that do not fit', () => {
    const p = straight();
    const base = cabinet(p, 'base');
    const overlap = executeCommand(p, { type: 'set_interior', cabinetId: base.id, interior: { sections: [{ width: null, fittings: [{ kind: 'drawer', y: 0, height: 200 }, { kind: 'shelf', y: 150, glass: false }] }] } });
    expect(overlap.result.errors[0]).toMatch(/Shelf at 150 mm overlaps internal drawer at 0 mm/);
    const tooWide = executeCommand(p, { type: 'set_interior', cabinetId: base.id, interior: { sections: [{ width: 400, fittings: [] }, { width: 300, fittings: [] }] } });
    expect(tooWide.result.errors[0]).toMatch(/Section widths add up to 700 mm but the inside is 546 mm wide/);
  });

  it('blocks a resize that would cut through a shelf, naming it', () => {
    const p = straight();
    const tall = run(
      p,
      { type: 'add_cabinet', cabinetType: 'tall', id: 't1', placement: { wallId: 'left', offset: 700 } },
      { type: 'set_interior', cabinetId: 't1', interior: { sections: [{ width: null, fittings: [{ kind: 'shelf', y: 1900, glass: false }] }] } },
    );
    const { result } = executeCommand(tall, { type: 'resize_cabinet', cabinetId: 't1', dimensions: { width: 600, height: 1900, depth: 560 } });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Shelf at 1900 mm does not fit inside: its top would be at 1918 mm but the inside is 1864 mm high/);
  });

  it('migrates a schema-1 file by adding default interiors and solid fronts', () => {
    const v2 = JSON.parse(serializeProject(straight()));
    v2.schemaVersion = 1;
    v2.project.schemaVersion = 1;
    for (const c of v2.project.cabinets) {
      delete c.interior;
      delete c.frontStyle;
    }
    const parsed = parseProjectFile(JSON.stringify(v2));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project.schemaVersion).toBe(2);
      expect(parsed.project.cabinets.every((c) => c.frontStyle === 'solid' && c.interior.sections.length === 1)).toBe(true);
      expect(parsed.project.cabinets.find((c) => c.type === 'wall')!.interior.sections[0]!.fittings).toHaveLength(2);
    }
  });
});

describe('adding fittings', () => {
  it('puts a new shelf in the middle of the largest gap and a drawer on its floor', () => {
    const section = { width: null, fittings: [{ kind: 'shelf' as const, y: 300, glass: false }] };
    expect(newFitting(section, 'shelf', 684)).toEqual({ kind: 'shelf', y: 490, glass: false });
    expect(newFitting(section, 'drawer', 684)).toEqual({ kind: 'drawer', y: 318, height: 150 });
  });

  it('returns null when nothing fits', () => {
    const section = { width: null, fittings: [{ kind: 'bottle-rack' as const, y: 0, height: 650 }] };
    expect(newFitting(section, 'drawer', 684)).toBeNull();
  });
});

describe('viewpoints', () => {
  it('saves, overwrites and deletes viewpoints as undoable design data', () => {
    const p = straight();
    const saved = run(p, { type: 'save_viewpoint', viewpoint: { id: 'hob', name: 'At the hob', x: 3000, z: 1200, yaw: 0, pitch: -0.4, eye: 1600 } });
    expect(saved.viewpoints).toEqual([{ id: 'hob', name: 'At the hob', x: 3000, z: 1200, yaw: 0, pitch: -0.4, eye: 1600 }]);
    const moved = run(saved, { type: 'save_viewpoint', viewpoint: { id: 'hob', name: 'At the hob', x: 3000, z: 1300, yaw: 0, pitch: -0.4, eye: 1600 } });
    expect(moved.viewpoints).toHaveLength(1);
    expect(executeCommand(p, { type: 'save_viewpoint', viewpoint: { name: 'Outside', x: 9000, z: 100, yaw: 0, pitch: 0, eye: 1600 } }).result.errors[0]).toMatch(/inside the room/);
    expect(run(moved, { type: 'delete_viewpoint', id: 'hob' }).viewpoints).toEqual([]);
    const reparsed = parseProjectFile(serializeProject(moved));
    expect(reparsed.ok && reparsed.project.viewpoints[0]!.z).toBe(1300);
  });

  it('loads files saved before viewpoints existed', () => {
    const file = JSON.parse(serializeProject(straight()));
    delete file.project.viewpoints;
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.ok && parsed.project.viewpoints).toEqual([]);
  });
});

describe('measurement preferences', () => {
  it('switching the display unit never changes geometry', () => {
    const p = createProject({ name: '12 x 10', room: { width: 3658, length: 3048, height: 2438, wallThickness: 150 }, layout: 'empty', unit: 'ft-in' });
    expect(p.preferences.unit).toBe('ft-in');
    let current = p;
    for (const unit of ['cm', 'mm', 'm', 'in', 'ft', 'ft-in'] as const) {
      current = run(current, { type: 'set_measurement_unit', unit });
      expect(current.preferences.unit).toBe(unit);
      expect(current.room).toEqual(p.room);
      expect(current.cabinets).toBe(p.cabinets);
    }
  });

  it('loads files saved before units existed in millimetres', () => {
    const file = JSON.parse(serializeProject(straight()));
    delete file.project.preferences;
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.ok && parsed.project.preferences).toEqual({ unit: 'mm' });
  });
});

describe('furniture', () => {
  it('adds a table on free floor space, resizes it keeping its id, and changes its finish', () => {
    const p = run(straight(), { type: 'add_furniture', furnitureType: 'table', id: 't' });
    const t = p.furniture[0]!;
    expect(t).toMatchObject({ id: 't', kind: 'furniture', dimensions: { width: 1600, height: 750, depth: 900 } });
    expect(validateProject(p)).toEqual([]);
    const resized = run(p, { type: 'resize_furniture', furnitureId: 't', dimensions: { width: 1200, height: 750, depth: 800 } }, { type: 'set_material', targetIds: ['t'], materialId: 'shutter-walnut' });
    expect(resized.furniture[0]).toMatchObject({ id: 't', materialId: 'shutter-walnut', dimensions: { width: 1200 } });
    expect(executeCommand(p, { type: 'resize_furniture', furnitureId: 't', dimensions: { width: 5000, height: 750, depth: 800 } }).result.errors[0]).toMatch(/outside the dining table range/);
    expect(run(p, { type: 'remove_entity', entityId: 't' }).furniture).toEqual([]);
  });

  it('loads files saved before furniture existed', () => {
    const file = JSON.parse(serializeProject(straight()));
    delete file.project.furniture;
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.ok && parsed.project.furniture).toEqual([]);
  });
});
