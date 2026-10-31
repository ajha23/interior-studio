import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM, executeCommand } from '@/domain';
import { buildModel } from '@/engine/geometry/parts';
import { openingOf, setAll, setOpening, toggleOpening } from './openings';

const p = createProject({ name: 'o', room: DEFAULT_ROOM, layout: 'straight' });
const base = p.cabinets.find((c) => c.type === 'base')!;
const cab = executeCommand(p, { type: 'apply_interior_preset', cabinetId: base.id, preset: 'drawers' }).project.cabinets.find((c) => c.id === base.id)!;
const { movers } = buildModel(cab);
const inner = movers.find((m) => m.kind === 'slide')!;

describe('opening doors and drawers', () => {
  it('toggles a door open and shut', () => {
    const opened = toggleOpening({}, cab.id, movers, 'door0');
    expect(openingOf(opened, cab.id, 'door0')).toBe(1);
    expect(openingOf(toggleOpening(opened, cab.id, movers, 'door0'), cab.id, 'door0')).toBe(0);
  });

  it('pulling an inner drawer opens the door in front of it first', () => {
    const o = toggleOpening({}, cab.id, movers, inner.id);
    expect(openingOf(o, cab.id, inner.id)).toBe(1);
    expect(openingOf(o, cab.id, 'door0')).toBe(1);
  });

  it('closing the door pushes the inner drawers back in', () => {
    const o = setOpening(toggleOpening({}, cab.id, movers, inner.id), cab.id, movers, 'door0', 0.3);
    expect(openingOf(o, cab.id, inner.id)).toBe(0);
    // A door only slightly closed leaves the drawer out.
    const partly = setOpening(toggleOpening({}, cab.id, movers, inner.id), cab.id, movers, 'door0', 0.8);
    expect(openingOf(partly, cab.id, inner.id)).toBe(1);
  });

  it('clamps drags and opens or closes everything', () => {
    expect(openingOf(setOpening({}, cab.id, movers, 'door0', 1.7), cab.id, 'door0')).toBe(1);
    const all = setAll({}, cab.id, movers, 1);
    expect(movers.every((m) => openingOf(all, cab.id, m.id) === 1)).toBe(true);
  });
});
