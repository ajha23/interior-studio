import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../project/presets';
import { projectToEntities } from './adapter';
import { WorkspaceEntitySchema } from './types';

describe('ECS Data Model & Project Adapter (Task 1)', () => {
  it('converts an example kitchen project into valid ECS entities', () => {
    const project = createExampleProject();
    const entities = projectToEntities(project);

    expect(entities.length).toBeGreaterThan(0);

    // Validate that every entity strictly conforms to WorkspaceEntitySchema
    for (const entity of entities) {
      expect(() => WorkspaceEntitySchema.parse(entity)).not.toThrow();
    }
  });

  it('generates 4 architectural room walls with correct dimensions and material', () => {
    const project = createExampleProject();
    const entities = projectToEntities(project);

    const walls = entities.filter((e) => e.entityType === 'wall');
    expect(walls).toHaveLength(4);

    const wallIds = walls.map((w) => w.id);
    expect(wallIds).toContain('wall-back');
    expect(wallIds).toContain('wall-left');
    expect(wallIds).toContain('wall-right');
    expect(wallIds).toContain('wall-front');

    const backWall = walls.find((w) => w.id === 'wall-back')!;
    expect(backWall.transform.width).toBe(project.room.width);
    expect(backWall.transform.height).toBe(project.room.height);
    expect(backWall.transform.depth).toBe(project.room.wallThickness);
    expect(backWall.layer).toBe('architecture');
  });

  it('attaches manufacturing component and edge banding to cabinets, but NOT to loose furniture', () => {
    const project = createExampleProject();
    // Add a loose furniture item for verification
    project.furniture = [
      {
        kind: 'furniture',
        id: 'dining-table-1',
        type: 'table',
        dimensions: { width: 1200, height: 750, depth: 800 },
        position: { x: 1500, y: 0, z: 1500 },
        rotationY: 0,
        materialId: project.cabinets[0]?.materialId ?? 'finish-1',
      },
    ];

    const entities = projectToEntities(project);

    const cabinets = entities.filter((e) => e.entityType === 'cabinet');
    expect(cabinets.length).toBeGreaterThan(0);
    for (const cabinet of cabinets) {
      expect(cabinet.manufacturing).toBeDefined();
      expect(cabinet.manufacturing?.isManufacturable).toBe(true);
      expect(cabinet.manufacturing?.edgeBandSpec).toBeDefined();
      expect(cabinet.pricing).toBeDefined();
      expect(cabinet.layer).toBe('cabinetry');
    }

    const furniture = entities.filter((e) => e.entityType === 'furniture');
    expect(furniture).toHaveLength(1);
    expect(furniture[0]!.manufacturing).toBeUndefined(); // Loose furniture is not panel-manufacturable
    expect(furniture[0]!.pricing).toBeDefined();
    expect(furniture[0]!.layer).toBe('furniture');
  });

  it('correctly maps openings and mep fixtures', () => {
    const project = createExampleProject();
    project.openings = [
      {
        id: 'door-1',
        kind: 'door',
        wallId: 'back',
        offset: 500,
        width: 900,
        height: 2100,
        sill: 0,
        swing: 'in',
        hinge: 'right',
      },
    ];
    project.mep = [
      {
        id: 'mep-sink',
        kind: 'water_inlet',
        wallId: 'back',
        offset: 1000,
        elevation: 600,
        label: 'Sink Inlet',
      },
    ];

    const entities = projectToEntities(project);

    const opening = entities.find((e) => e.id === 'door-1');
    expect(opening).toBeDefined();
    expect(opening?.entityType).toBe('opening');
    expect(opening?.transform.width).toBe(900);
    expect(opening?.transform.height).toBe(2100);

    const mep = entities.find((e) => e.id === 'mep-sink');
    expect(mep).toBeDefined();
    expect(mep?.entityType).toBe('fixture');
    expect(mep?.customComponents?.label).toBe('Sink Inlet');
  });
});
