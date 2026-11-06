/** Kitchen layout presets and new-project defaults. */
import type { LengthUnit } from '@/engine/measurement/units';
import type { Layout } from '../commands/schema';
import { makeAppliance, makeCabinet, newId } from '../furniture/factory';
import { CABINET_SPECS, COUNTERTOP_OVERHANG } from '../furniture/specs';
import { DEFAULT_SHUTTER, DEFAULT_SURFACES, libraryMaterials } from '../materials/library';
import { wallLength } from '../room/walls';
import {
  SCHEMA_VERSION,
  type Appliance,
  type ApplianceType,
  type CabinetType,
  type KitchenCabinet,
  type KitchenProject,
  type Room,
  type WallId,
} from '../schema';

export const DEFAULT_ROOM: Room = { width: 4200, length: 3200, height: 2700, wallThickness: 150 };

/** Common room sizes to start from (width along the back wall × length of the side walls). */
export const ROOM_PRESETS: { id: string; label: string; room: Room }[] = [
  { id: 'compact', label: 'Compact kitchen', room: { width: 2400, length: 2400, height: 2700, wallThickness: 150 } },
  { id: 'galley', label: 'Galley', room: { width: 2400, length: 4200, height: 2700, wallThickness: 150 } },
  { id: 'standard', label: 'Standard kitchen', room: { width: 4200, length: 3200, height: 2700, wallThickness: 150 } },
  { id: 'large', label: 'Large kitchen', room: { width: 4800, length: 4200, height: 2700, wallThickness: 150 } },
  { id: 'open-plan', label: 'Open-plan kitchen-diner', room: { width: 6000, length: 4500, height: 2700, wallThickness: 150 } },
  // 12 ft × 10 ft with an 8 ft ceiling, stored to the nearest millimetre.
  { id: '12x10ft', label: '12 × 10 ft', room: { width: 3658, length: 3048, height: 2438, wallThickness: 114 } },
];

type Slot =
  | { kind: 'cabinet'; type: CabinetType; width: number }
  | { kind: 'appliance'; type: ApplianceType; width: number };

interface Run {
  wallId: WallId;
  start: number;
  floor: Slot[];
  /** Wall-hung units, each at the offset of the floor slot it sits above. */
  above: { overSlot: number; slot: Slot }[];
}

const cab = (type: CabinetType, width: number): Slot => ({ kind: 'cabinet', type, width });
const app = (type: ApplianceType, width: number): Slot => ({ kind: 'appliance', type, width });

const BASE_DEPTH = 560;

function runsFor(layout: Layout): Run[] {
  switch (layout) {
    case 'empty':
      return [];
    case 'straight':
      return [
        {
          wallId: 'back',
          start: 0,
          floor: [app('fridge', 700), cab('base', 600), cab('sink', 800), app('dishwasher', 600), app('range', 600), cab('drawer', 600)],
          above: [
            { overSlot: 1, slot: cab('wall', 600) },
            { overSlot: 2, slot: cab('wall', 800) },
            { overSlot: 3, slot: cab('wall', 600) },
            { overSlot: 4, slot: app('hood', 600) },
            { overSlot: 5, slot: cab('wall', 600) },
          ],
        },
      ];
    case 'l-shaped':
      return [
        {
          wallId: 'back',
          start: 0,
          floor: [cab('corner', 1000), cab('sink', 800), app('dishwasher', 600), cab('base', 600), cab('tall', 600)],
          above: [
            { overSlot: 1, slot: cab('wall', 800) },
            { overSlot: 2, slot: cab('wall', 600) },
            { overSlot: 3, slot: cab('wall', 600) },
          ],
        },
        {
          // Starts where the back worktop ends, so the two slabs meet without overlapping.
          wallId: 'left',
          start: BASE_DEPTH + COUNTERTOP_OVERHANG,
          floor: [cab('drawer', 600), app('range', 600), cab('base', 600), app('fridge', 700)],
          above: [
            { overSlot: 0, slot: cab('wall', 600) },
            { overSlot: 1, slot: app('hood', 600) },
            { overSlot: 2, slot: cab('wall', 600) },
          ],
        },
      ];
  }
}

/** Wall length each layout needs, for a clear message when the room is too small. */
export function layoutRequirements(layout: Layout): { wallId: WallId; length: number }[] {
  return runsFor(layout).map((r) => ({ wallId: r.wallId, length: r.start + r.floor.reduce((s, x) => s + x.width, 0) }));
}

export function layoutFitErrors(room: Room, layout: Layout): string[] {
  return layoutRequirements(layout)
    .filter((req) => wallLength(room, req.wallId) < req.length)
    .map((req) => `The ${layout} layout needs a ${req.wallId} wall of at least ${req.length} mm (this room has ${wallLength(room, req.wallId)} mm).`);
}

export function buildLayout(
  room: Room,
  layout: Layout,
  makeId: (prefix: string) => string = newId,
): { cabinets: KitchenCabinet[]; appliances: Appliance[] } {
  const cabinets: KitchenCabinet[] = [];
  const appliances: Appliance[] = [];
  const add = (slot: Slot, wallId: WallId, offset: number) => {
    if (slot.kind === 'cabinet') {
      const dimensions = { ...CABINET_SPECS[slot.type].defaults, width: slot.width };
      cabinets.push(makeCabinet(room, { id: makeId('cab'), type: slot.type, wallId, offset, dimensions, materialId: DEFAULT_SHUTTER }));
    } else {
      appliances.push(makeAppliance(room, { id: makeId('app'), type: slot.type, wallId, offset, width: slot.width }));
    }
  };
  for (const run of runsFor(layout)) {
    const offsets: number[] = [];
    let at = run.start;
    for (const slot of run.floor) {
      offsets.push(at);
      add(slot, run.wallId, at);
      at += slot.width;
    }
    for (const { overSlot, slot } of run.above) add(slot, run.wallId, offsets[overSlot]!);
  }
  return { cabinets, appliances };
}

export function createProject(input: { name: string; room: Room; layout: Layout; id?: string; unit?: LengthUnit }, makeId: (prefix: string) => string = newId): KitchenProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? makeId('prj'),
    name: input.name.trim() || 'Untitled kitchen',
    room: { ...input.room },
    surfaces: { ...DEFAULT_SURFACES },
    materials: libraryMaterials(),
    viewpoints: [],
    openings: [],
    furniture: [],
    mep: [],
    preferences: { unit: input.unit ?? 'mm' },
    production: {},
    ...buildLayout(input.room, input.layout, makeId),
  };
}

/** A finished L-shaped example with mixed finishes, used by "Open example kitchen". */
export function createExampleProject(makeId: (prefix: string) => string = newId): KitchenProject {
  const project = createProject({ name: 'Example L-shaped kitchen', room: { width: 3600, length: 3200, height: 2700, wallThickness: 150 }, layout: 'l-shaped' }, makeId);
  for (const c of project.cabinets) if (c.type !== 'wall' && c.type !== 'tall') c.materialId = 'shutter-sage';
  // A window over the sink (in place of its wall cabinet) and a door on the free right wall.
  const sink = project.cabinets.find((c) => c.type === 'sink' && c.wallId === 'back')!;
  const sinkStart = sink.position.x - sink.dimensions.width / 2;
  project.cabinets = project.cabinets.filter((c) => !(c.type === 'wall' && c.wallId === 'back' && c.position.x - c.dimensions.width / 2 === sinkStart));
  project.openings = [
    { id: makeId('opn'), kind: 'window', wallId: 'back', offset: sinkStart, width: sink.dimensions.width, height: 1000, sill: 1050, swing: 'none', hinge: 'left' },
    { id: makeId('opn'), kind: 'door', wallId: 'right', offset: 1300, width: 900, height: 2100, sill: 0, swing: 'in', hinge: 'right' },
  ];
  project.surfaces.countertop = 'counter-oak';
  project.surfaces.wall = 'wall-greige';
  return project;
}

/**
 * A photorealistic showcase kitchen demonstrating the newly ingested realistic manufacturer modules:
 * - Hailo Cargo Soft 450 Waste Separation System (14L + 14L)
 * - Hailo Euro Cargo 600 Waste Separation System (38L + 38L)
 * - Kesseböhmer FREEfold Bi-Fold Wall Cabinet Lifter with glass front
 * - Kesseböhmer MiO 5-Drawer Pull-Out Tall Pantry (600mm)
 * - 3-Drawer Unit with Cutlery & Modular Canister Matrix
 * - Hailo Stepfix Plinth Step Stool
 */
export function createRealisticShowcaseProject(makeId: (prefix: string) => string = newId): KitchenProject {
  const project = createProject(
    {
      name: 'Realistic Manufacturer Showcase Kitchen',
      room: { width: 4200, length: 3200, height: 2700, wallThickness: 150 },
      layout: 'straight',
    },
    makeId
  );

  project.surfaces.countertop = 'counter-quartz-white';
  project.surfaces.floor = 'floor-oak';
  project.surfaces.wall = 'wall-warm-white';
  project.surfaces.carcass = 'carcass-white';

  // Customize existing cabinets with realistic manufacturer configurations
  for (const c of project.cabinets) {
    if (c.type === 'base') {
      c.materialId = 'shutter-cashmere';
      // Configure with Hailo Cargo Soft Waste Separation pullout
      c.interior = {
        sections: [
          {
            width: null,
            fittings: [
              { kind: 'basket', y: 40, height: 370 },
              { kind: 'shelf', y: 460, glass: false },
            ],
          },
        ],
      };
    } else if (c.type === 'wall') {
      c.materialId = 'shutter-white-matte';
      c.frontStyle = 'glass';
      // Configure with Kesseböhmer FREEfold lifter glass interior
      c.interior = {
        sections: [
          {
            width: null,
            fittings: [
              { kind: 'shelf', y: 320, glass: true },
            ],
          },
        ],
      };
    } else if (c.type === 'tall') {
      c.materialId = 'shutter-cashmere';
      // Configure with Kesseböhmer MiO 5-drawer pantry pull-outs
      c.interior = {
        sections: [
          {
            width: null,
            fittings: [
              { kind: 'basket', y: 60, height: 140 },
              { kind: 'basket', y: 260, height: 140 },
              { kind: 'basket', y: 460, height: 140 },
              { kind: 'basket', y: 660, height: 140 },
              { kind: 'basket', y: 860, height: 140 },
              { kind: 'shelf', y: 1200, glass: false },
              { kind: 'shelf', y: 1500, glass: false },
            ],
          },
        ],
      };
    } else if (c.type === 'drawer') {
      c.materialId = 'shutter-cashmere';
    }
  }

  // Add Hailo Stepfix plinth folding stool
  project.furniture.push({
    kind: 'furniture',
    id: makeId('fur'),
    type: 'chair',
    materialId: 'shutter-graphite',
    dimensions: { width: 403, height: 380, depth: 387 },
    position: { x: 1200, y: 0, z: -1000 },
    rotationY: 0,
  });

  return project;
}
