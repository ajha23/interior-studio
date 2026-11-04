/**
 * Adapter converting legacy/domain KitchenProject into normalized ECS WorkspaceEntity items.
 */
import type { KitchenProject } from '../schema';
import type { WorkspaceEntity } from './types';

/**
 * Normalizes all components of a KitchenProject (walls, openings, cabinets,
 * appliances, loose furniture, MEP service fixtures) into ECS WorkspaceEntity items.
 */
export function projectToEntities(project: KitchenProject): WorkspaceEntity[] {
  const entities: WorkspaceEntity[] = [];

  const wallMat = project.materials[project.surfaces.wall];
  const wallMatComp = wallMat
    ? {
        materialId: wallMat.id,
        finishCategory: 'wall',
        finishName: wallMat.name,
        colorHex: wallMat.color,
      }
    : undefined;

  // 1. Room Walls
  // Back Wall
  entities.push({
    id: 'wall-back',
    entityType: 'wall',
    name: 'Back Wall',
    layer: 'architecture',
    transform: {
      x: project.room.width / 2,
      y: 0,
      z: 0,
      width: project.room.width,
      height: project.room.height,
      depth: project.room.wallThickness,
      rotation: 0,
    },
    material: wallMatComp,
    customComponents: { wallId: 'back' },
  });

  // Left Wall
  entities.push({
    id: 'wall-left',
    entityType: 'wall',
    name: 'Left Wall',
    layer: 'architecture',
    transform: {
      x: 0,
      y: 0,
      z: project.room.length / 2,
      width: project.room.wallThickness,
      height: project.room.height,
      depth: project.room.length,
      rotation: 0,
    },
    material: wallMatComp,
    customComponents: { wallId: 'left' },
  });

  // Right Wall
  entities.push({
    id: 'wall-right',
    entityType: 'wall',
    name: 'Right Wall',
    layer: 'architecture',
    transform: {
      x: project.room.width,
      y: 0,
      z: project.room.length / 2,
      width: project.room.wallThickness,
      height: project.room.height,
      depth: project.room.length,
      rotation: 0,
    },
    material: wallMatComp,
    customComponents: { wallId: 'right' },
  });

  // Front Wall
  entities.push({
    id: 'wall-front',
    entityType: 'wall',
    name: 'Front Wall',
    layer: 'architecture',
    transform: {
      x: project.room.width / 2,
      y: 0,
      z: project.room.length,
      width: project.room.width,
      height: project.room.height,
      depth: project.room.wallThickness,
      rotation: 0,
    },
    material: wallMatComp,
    customComponents: { wallId: 'front' },
  });

  // 2. Openings
  for (const opening of project.openings) {
    entities.push({
      id: opening.id,
      entityType: 'opening',
      name: `${opening.kind.toUpperCase()} (${opening.wallId})`,
      layer: 'openings',
      transform: {
        x: opening.offset + opening.width / 2,
        y: opening.sill,
        z: 0,
        width: opening.width,
        height: opening.height,
        depth: project.room.wallThickness,
        rotation: 0,
      },
      customComponents: {
        wallId: opening.wallId,
        kind: opening.kind,
        swing: opening.swing,
        hinge: opening.hinge,
      },
    });
  }

  // 3. Cabinets (Manufacturable elements)
  for (const cabinet of project.cabinets) {
    const mat = project.materials[cabinet.materialId];
    entities.push({
      id: cabinet.id,
      entityType: 'cabinet',
      name: `${cabinet.type.charAt(0).toUpperCase() + cabinet.type.slice(1)} Cabinet (${cabinet.id})`,
      layer: 'cabinetry',
      transform: {
        x: cabinet.position.x,
        y: cabinet.position.y,
        z: cabinet.position.z,
        width: cabinet.dimensions.width,
        height: cabinet.dimensions.height,
        depth: cabinet.dimensions.depth,
        rotation: cabinet.rotationY,
      },
      material: mat
        ? {
            materialId: mat.id,
            finishCategory: 'shutter',
            finishName: mat.name,
            colorHex: mat.color,
          }
        : undefined,
      pricing: {
        hsnSacCode: '9403',
        unitRatePaise: 450000,
        marginPercent: 20,
        itemType: 'goods',
      },
      manufacturing: {
        rulePackId: project.production.constructionId ?? 'factory-standard',
        rulePackVersion: 1,
        isManufacturable: true,
        edgeBandSpec: {
          l1: '0.8mm PVC',
          l2: '0.8mm PVC',
          w1: '0.8mm PVC',
          w2: '0.8mm PVC',
        },
      },
      customComponents: {
        cabinetType: cabinet.type,
        wallId: cabinet.wallId,
        frontStyle: cabinet.frontStyle,
        interior: cabinet.interior,
      },
    });
  }

  // 4. Appliances
  for (const appliance of project.appliances) {
    entities.push({
      id: appliance.id,
      entityType: 'appliance',
      name: `${appliance.type.charAt(0).toUpperCase() + appliance.type.slice(1)} (${appliance.id})`,
      layer: 'appliances',
      transform: {
        x: appliance.position.x,
        y: appliance.position.y,
        z: appliance.position.z,
        width: appliance.dimensions.width,
        height: appliance.dimensions.height,
        depth: appliance.dimensions.depth,
        rotation: appliance.rotationY,
      },
      pricing: {
        hsnSacCode: '8418',
        unitRatePaise: 800000,
        marginPercent: 15,
        itemType: 'goods',
      },
      customComponents: {
        applianceType: appliance.type,
        wallId: appliance.wallId,
      },
    });
  }

  // 5. Loose Furniture (No manufacturing component - purchased loose items)
  for (const furniture of project.furniture) {
    const mat = project.materials[furniture.materialId];
    entities.push({
      id: furniture.id,
      entityType: 'furniture',
      name: `${furniture.type.charAt(0).toUpperCase() + furniture.type.slice(1)} (${furniture.id})`,
      layer: 'furniture',
      transform: {
        x: furniture.position.x,
        y: furniture.position.y,
        z: furniture.position.z,
        width: furniture.dimensions.width,
        height: furniture.dimensions.height,
        depth: furniture.dimensions.depth,
        rotation: furniture.rotationY,
      },
      material: mat
        ? {
            materialId: mat.id,
            finishCategory: 'furniture',
            finishName: mat.name,
            colorHex: mat.color,
          }
        : undefined,
      pricing: {
        hsnSacCode: '9403',
        unitRatePaise: 350000,
        marginPercent: 25,
        itemType: 'goods',
      },
      customComponents: {
        furnitureType: furniture.type,
        wallId: furniture.wallId,
      },
    });
  }

  // 6. MEP Service Points
  for (const mep of project.mep) {
    entities.push({
      id: mep.id,
      entityType: 'fixture',
      name: `MEP ${mep.kind.toUpperCase()} (${mep.id})`,
      layer: 'mep',
      transform: {
        x: mep.offset,
        y: mep.elevation,
        z: 0,
        width: 100,
        height: 100,
        depth: 50,
        rotation: 0,
      },
      customComponents: {
        kind: mep.kind,
        wallId: mep.wallId,
        label: mep.label,
      },
    });
  }

  return entities;
}
