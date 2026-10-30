import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, executeCommand, offsetAlongWall } from '@/domain';
import { parseCommandLine } from './parseCommandLine';

const project = createProject({ name: 'cli', room: DEFAULT_ROOM, layout: 'straight' });
const base = project.cabinets.find((c) => c.type === 'base')!;
const fridge = project.appliances.find((a) => a.type === 'fridge')!;
const ctx = { project, selectedId: base.id };

describe('command line', () => {
  it('resizes with AutoCAD-style aliases and keeps other dimensions', () => {
    expect(parseCommandLine('w 900', ctx)).toEqual({ kind: 'design', command: { type: 'resize_cabinet', cabinetId: base.id, dimensions: { width: 900, height: 720, depth: 560 } } });
    expect(parseCommandLine('size 900x700x580', ctx)).toMatchObject({ command: { dimensions: { width: 900, height: 700, depth: 580 } } });
    expect(parseCommandLine('W 900mm', ctx)).toMatchObject({ kind: 'design' });
  });

  it('a parsed resize goes through normal validation', () => {
    const action = parseCommandLine('w 1500', ctx);
    if (action.kind !== 'design') throw new Error('expected design');
    expect(executeCommand(project, action.command).result.errors[0]).toMatch(/outside the base cabinet range 150–1200 mm/);
  });

  it('moves absolutely, relatively and to another wall', () => {
    expect(parseCommandLine('m 1000', ctx)).toMatchObject({ command: { type: 'move_entity', placement: { wallId: 'back', offset: 1000 } } });
    expect(parseCommandLine('m +50', ctx)).toMatchObject({ command: { placement: { offset: offsetAlongWall(base) + 50 } } });
    expect(parseCommandLine('m left 650', ctx)).toMatchObject({ command: { placement: { wallId: 'left', offset: 650 } } });
    expect(parseCommandLine('m -5000', ctx)).toMatchObject({ kind: 'error' });
  });

  it('only allows width changes on appliances', () => {
    const c = { project, selectedId: fridge.id };
    expect(parseCommandLine('w 900', c)).toMatchObject({ command: { type: 'resize_appliance', width: 900 } });
    expect(parseCommandLine('h 1500', c)).toMatchObject({ kind: 'error' });
  });

  it('finds finishes by name', () => {
    expect(parseCommandLine('finish oak', ctx)).toMatchObject({ command: { type: 'set_material', materialId: 'shutter-oak' } });
    expect(parseCommandLine('worktop black granite', ctx)).toMatchObject({ command: { type: 'set_surface_material', surface: 'countertop', materialId: 'counter-black-granite' } });
    expect(parseCommandLine('finish purple', ctx)).toMatchObject({ kind: 'error' });
  });

  it('maps navigation, history and selection aliases', () => {
    expect(parseCommandLine('ze', ctx)).toEqual({ kind: 'view', action: { kind: 'fit' } });
    expect(parseCommandLine('zoom extents', ctx)).toEqual({ kind: 'view', action: { kind: 'fit' } });
    expect(parseCommandLine('f', ctx)).toEqual({ kind: 'view', action: { kind: 'focus' } });
    expect(parseCommandLine('back', ctx)).toEqual({ kind: 'view', action: { kind: 'preset', preset: 'front' } });
    expect(parseCommandLine('xray', ctx)).toEqual({ kind: 'view', action: { kind: 'style', style: 'xray' } });
    expect(parseCommandLine('u', ctx)).toEqual({ kind: 'history', action: 'undo' });
    expect(parseCommandLine('e', ctx)).toEqual({ kind: 'design', command: { type: 'remove_entity', entityId: base.id } });
    expect(parseCommandLine('sel sink', ctx)).toEqual({ kind: 'select', id: project.cabinets.find((c) => c.type === 'sink')!.id });
  });

  it('adds units and changes the room', () => {
    expect(parseCommandLine('add wall 800', ctx)).toMatchObject({ command: { type: 'add_cabinet', cabinetType: 'wall', dimensions: { width: 800, height: 720, depth: 350 } } });
    expect(parseCommandLine('add fridge', ctx)).toMatchObject({ command: { type: 'add_appliance', applianceType: 'fridge' } });
    expect(parseCommandLine('room 4500 3300', ctx)).toMatchObject({ command: { type: 'set_room', room: { width: 4500, length: 3300, height: 2700 } } });
  });

  it('explains what is missing', () => {
    expect(parseCommandLine('w 900', { project, selectedId: null })).toMatchObject({ kind: 'error', message: expect.stringMatching(/Select a unit first/) });
    expect(parseCommandLine('frobnicate', ctx)).toMatchObject({ kind: 'error', message: expect.stringMatching(/Unknown command/) });
  });

  it('places, rotates and configures interiors', () => {
    expect(parseCommandLine('free', ctx)).toEqual({ kind: 'design', command: { type: 'place_entity', entityId: base.id, x: base.position.x, z: base.position.z, rotationY: 0 } });
    expect(parseCommandLine('at 1200 900', ctx)).toMatchObject({ command: { type: 'place_entity', x: 1500, z: 1180 } });
    expect(parseCommandLine('ro 90', ctx)).toMatchObject({ command: { type: 'rotate_entity', rotationY: 90 } });
    expect(parseCommandLine('ro -90', ctx)).toMatchObject({ command: { rotationY: 270 } });
    expect(parseCommandLine('shelves 4', ctx)).toMatchObject({ command: { type: 'apply_interior_preset', preset: 'shelves', count: 4 } });
    expect(parseCommandLine('interior crockery', ctx)).toMatchObject({ command: { type: 'apply_interior_preset', preset: 'crockery' } });
    expect(parseCommandLine('glass', ctx)).toMatchObject({ command: { type: 'set_front_style', style: 'glass' } });
    expect(parseCommandLine('inside', ctx)).toEqual({ kind: 'view', action: { kind: 'toggle', what: 'inside' } });
    expect(parseCommandLine('interior disco', ctx)).toMatchObject({ kind: 'error' });
  });

  it('opens and closes doors and drawers', () => {
    expect(parseCommandLine('interact', ctx)).toEqual({ kind: 'interact' });
    expect(parseCommandLine('open all', ctx)).toEqual({ kind: 'open', open: true, all: true });
    expect(parseCommandLine('closedoors', ctx)).toEqual({ kind: 'open', open: false, all: false });
    expect(parseCommandLine('opendoors', { project, selectedId: null })).toMatchObject({ kind: 'error' });
  });

  it('walks, stands and sets eye height', () => {
    expect(parseCommandLine('walk', ctx)).toEqual({ kind: 'walk', on: true });
    expect(parseCommandLine('orbit', ctx)).toEqual({ kind: 'walk', on: false });
    expect(parseCommandLine('stand', ctx)).toEqual({ kind: 'stand' });
    expect(parseCommandLine('eye 1150', ctx)).toEqual({ kind: 'eye', mm: 1150 });
    expect(parseCommandLine('eye 50', ctx)).toMatchObject({ kind: 'error' });
  });
});
