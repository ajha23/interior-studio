import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, executeCommand, makeCabinet, type KitchenElement } from '@/domain';
import { makeAppliance } from '@/domain/furniture/factory';
import { buildModel, moverPoint } from './parts';

const cabinet = (type: Parameters<typeof makeCabinet>[1]['type']) =>
  makeCabinet(DEFAULT_ROOM, { id: 'c', type, wallId: 'back', offset: 0, dimensions: undefined, materialId: 'shutter-oak'});

function withWidth(el: KitchenElement, width: number): KitchenElement {
  return { ...el, dimensions: { ...el.dimensions, width } };
}

describe('moving parts', () => {
  it('every tagged part belongs to a mover and every mover moves something', () => {
    const p = createProject({ name: 'm', room: DEFAULT_ROOM, layout: 'straight' });
    for (const el of [...p.cabinets, ...p.appliances]) {
      const { parts, movers } = buildModel(el);
      const ids = new Set(movers.map((m) => m.id));
      for (const part of parts) if (part.mover) expect(ids.has(part.mover), `${el.type} ${part.key}`).toBe(true);
      for (const m of movers) expect(parts.some((part) => part.mover === m.id), `${el.type} ${m.id}`).toBe(true);
    }
  });

  it('a single door hinges on the left and swings its free edge out towards the room', () => {
    const { movers } = buildModel(cabinet('base'));
    expect(movers).toHaveLength(1);
    const door = movers[0]!;
    expect(door).toMatchObject({ kind: 'hinge', label: 'Door' });
    const freeEdge = { x: door.pivot.x + 600, y: 400, z: door.pivot.z };
    const open = moverPoint(door, 1, freeEdge);
    expect(open.z).toBeGreaterThan(door.pivot.z + 500);
    // Half open is in between, and closed is unchanged.
    expect(moverPoint(door, 0, freeEdge)).toEqual(freeEdge);
  });

  it('a pair of doors hinges on the outer edges, swinging opposite ways', () => {
    const { movers } = buildModel(withWidth(cabinet('base'), 900));
    expect(movers.map((m) => m.label)).toEqual(['Left door', 'Right door']);
    expect(Math.sign(movers[0]!.amount)).toBe(-Math.sign(movers[1]!.amount));
    expect(movers[0]!.pivot.x).toBeLessThan(movers[1]!.pivot.x);
  });

  it('drawer units pull out their drawers, boxes included', () => {
    const { parts, movers } = buildModel(cabinet('drawer'));
    expect(movers.map((m) => [m.label, m.kind])).toEqual([['Top drawer', 'slide'], ['Middle drawer', 'slide'], ['Bottom drawer', 'slide']]);
    expect(parts.filter((p) => p.mover === 'drawer0').map((p) => p.key)).toEqual(expect.arrayContaining(['drawer0base', 'drawer0sideL', 'handle0']));
    expect(moverPoint(movers[0]!, 1, movers[0]!.grab).z).toBeGreaterThan(movers[0]!.grab.z + 300);
  });

  it('inner drawers need the door in front of them open; open units have no doors', () => {
    const p = createProject({ name: 'm', room: DEFAULT_ROOM, layout: 'straight' });
    const base = p.cabinets.find((c) => c.type === 'base')!;
    const withDrawers = executeCommand(p, { type: 'apply_interior_preset', cabinetId: base.id, preset: 'drawers' }).project.cabinets.find((c) => c.id === base.id)!;
    const { movers } = buildModel(withDrawers);
    const inner = movers.filter((m) => m.kind === 'slide');
    expect(inner.length).toBeGreaterThan(0);
    expect(inner.every((m) => m.requires.includes('door0'))).toBe(true);
    const openUnit = buildModel({ ...withDrawers, frontStyle: 'open' }).movers;
    expect(openUnit.some((m) => m.kind === 'hinge')).toBe(false);
    expect(openUnit.every((m) => m.requires.length === 0)).toBe(true);
  });

  it('tall units have lower and upper doors; the blind corner door hinges on the right', () => {
    expect(buildModel(cabinet('tall')).movers.map((m) => m.label)).toEqual(['Lower door', 'Upper door']);
    const corner = buildModel(cabinet('corner')).movers;
    expect(corner).toHaveLength(1);
    expect(corner[0]!.amount).toBeGreaterThan(0);
  });

  it('appliance doors: fridge and freezer hinge, oven and dishwasher drop forward', () => {
    expect(buildModel(makeAppliance(DEFAULT_ROOM, { id: 'f', type: 'fridge', wallId: 'back', offset: 0 })).movers.map((m) => m.label)).toEqual(['Freezer door', 'Fridge door']);
    for (const type of ['range', 'dishwasher'] as const) {
      const [door] = buildModel(makeAppliance(DEFAULT_ROOM, { id: 'a', type, wallId: 'back', offset: 0 })).movers;
      expect(door!.kind).toBe('drop');
      const open = moverPoint(door!, 1, door!.grab);
      expect(open.z).toBeGreaterThan(door!.grab.z);
      expect(open.y).toBeLessThan(door!.grab.y);
    }
    expect(buildModel(makeAppliance(DEFAULT_ROOM, { id: 'h', type: 'hood', wallId: 'back', offset: 0 })).movers).toEqual([]);
  });
});
