/**
 * Pure Deterministic Manufacturing Explode Engine.
 * Converts 3D room cabinets into exact factory cutting lists, edge-banding deductions,
 * and 32mm system boring coordinates.
 *
 * Rules:
 * - Framework-free TypeScript. Zero React, Three.js, Zustand, or DOM.
 * - Integer millimeter math (lengths, widths, boring coordinates).
 * - Exact floating deductions for edge-banding thickness.
 */

import { type RulePack, SEED_RULE_PACK_V1 } from '../../domain/manufacturing/rulePack';

export interface BoringHole {
  face: 'A' | 'B' | 'EDGE_TOP' | 'EDGE_BOTTOM' | 'EDGE_LEFT' | 'EDGE_RIGHT';
  x: number; // mm from datum
  y: number; // mm from datum
  diameter: number; // mm (e.g. 5 for shelf pin, 35 for hinge cup, 8 for dowel)
  depth: number; // mm
}

export interface EdgeBandingSpec {
  l1?: string; // Top edge (length 1)
  l2?: string; // Bottom edge (length 2)
  w1?: string; // Front edge (width 1)
  w2?: string; // Back edge (width 2)
}

export interface ManufacturingPart {
  partId: string;
  moduleCode: string;
  elementId: string;
  name: string;
  material: string;
  role: 'carcass' | 'shutter' | 'back' | 'shelf' | 'stretcher' | 'drawer';
  quantity: number;
  finishedLength: number; // mm
  finishedWidth: number;  // mm
  cuttingLength: number;   // mm (finished minus edge deductions)
  cuttingWidth: number;    // mm (finished minus edge deductions)
  thickness: number;      // mm
  grain: 'L' | 'W' | 'NONE';
  edgeBanding: EdgeBandingSpec;
  holes: BoringHole[];
}

export interface ManufacturingHardware {
  code: string;
  name: string;
  category: 'hinge' | 'runner' | 'handle' | 'leg' | 'shelf_pin' | 'fastener';
  quantity: number;
}

export interface ManufacturingPackage {
  projectCode: string;
  elementCount: number;
  parts: ManufacturingPart[];
  hardware: ManufacturingHardware[];
  summary: {
    totalParts: number;
    totalCarcaseAreaSqM: number;
    totalShutterAreaSqM: number;
    totalBackPanelAreaSqM: number;
    edgeBandLinearMeters: Record<string, number>;
  };
}

export interface ExplodeCabinetInput {
  id: string;
  type: string; // 'base' | 'wall' | 'tall' | 'drawer' | 'sink' | 'corner'
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  materialId?: string;
  shutterMaterialId?: string;
}

/**
 * Rounds to 2 decimal places to prevent IEEE-754 floating point artifacts.
 */
function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Explodes a single cabinet into factory-ready parts and hardware.
 */
export function explodeCabinet(
  cabinet: ExplodeCabinetInput,
  rulePack: RulePack = SEED_RULE_PACK_V1,
  _projectCode: string = 'PROJECT'
): { parts: ManufacturingPart[]; hardware: ManufacturingHardware[] } {
  const parts: ManufacturingPart[] = [];
  const hardware: ManufacturingHardware[] = [];

  const { width: W, height: H, depth: D } = cabinet.dimensions;
  const tc = rulePack.carcassThickness;
  const ts = rulePack.shutterThickness;
  const tb = rulePack.backPanelThickness;
  const bgDepth = rulePack.backPanelGrooveDepth;
  const reveal = rulePack.doorReveal;
  const ebCarcass = rulePack.edgeBandThicknessCarcass;
  const ebShutter = rulePack.edgeBandThicknessShutter;
  const ebCodeCarcass = rulePack.edgeBandCodes.carcassExposed;
  const ebCodeShutter = rulePack.edgeBandCodes.shutter;

  const isBase = cabinet.type === 'base' || cabinet.type === 'sink' || cabinet.type === 'drawer';
  const isTall = cabinet.type === 'tall';
  const isWardrobe =
    cabinet.type.startsWith('wardrobe') ||
    cabinet.type === 'WARDROBE-2D' ||
    cabinet.type === 'WARDROBE-SLIDE';
  const isVanity = cabinet.type.startsWith('vanity') || cabinet.type === 'VANITY-BWP';
  const isTable =
    cabinet.type.startsWith('loose-table') ||
    cabinet.type === 'LOOSE-TABLE-4P' ||
    cabinet.type === 'table';

  const carcassMat =
    cabinet.materialId || (isVanity ? 'BWP-PLY-18-WATERPROOF' : 'MDF-PLPB-18-WHITE');
  const shutterMat = cabinet.shutterMaterialId || 'MDF-MR-18-ACRYLIC';
  const backMat = 'HDF-08-WHITE';

  // Specific Loose Furniture branch: Table
  if (isTable) {
    const topThick = 25;
    const legLength = H - topThick;
    const apronW = 100;
    const longApronL = Math.max(100, W - 150);
    const shortApronL = Math.max(100, D - 150);

    parts.push({
      partId: `${cabinet.id}-TOP-SURFACE`,
      moduleCode: `TABLE-${W}x${D}`,
      elementId: cabinet.id,
      name: 'Table Top Surface',
      material: shutterMat,
      role: 'carcass',
      quantity: 1,
      finishedLength: W,
      finishedWidth: D,
      cuttingLength: round2(W - 2 * ebShutter),
      cuttingWidth: round2(D - 2 * ebShutter),
      thickness: topThick,
      grain: 'L',
      edgeBanding: {
        l1: ebCodeShutter,
        l2: ebCodeShutter,
        w1: ebCodeShutter,
        w2: ebCodeShutter,
      },
      holes: [],
    });

    parts.push({
      partId: `${cabinet.id}-SOLID-LEG`,
      moduleCode: `TABLE-${W}x${D}`,
      elementId: cabinet.id,
      name: 'Solid Table Leg',
      material: carcassMat,
      role: 'carcass',
      quantity: 4,
      finishedLength: legLength,
      finishedWidth: 75,
      cuttingLength: legLength,
      cuttingWidth: 75,
      thickness: 75,
      grain: 'L',
      edgeBanding: {},
      holes: [{ face: 'EDGE_TOP', x: 37, y: 37, diameter: 8, depth: 40 }],
    });

    parts.push({
      partId: `${cabinet.id}-APRON-LONG`,
      moduleCode: `TABLE-${W}x${D}`,
      elementId: cabinet.id,
      name: 'Long Support Apron',
      material: carcassMat,
      role: 'stretcher',
      quantity: 2,
      finishedLength: longApronL,
      finishedWidth: apronW,
      cuttingLength: longApronL,
      cuttingWidth: round2(apronW - ebCarcass),
      thickness: tc,
      grain: 'L',
      edgeBanding: { w1: ebCodeCarcass },
      holes: [],
    });

    parts.push({
      partId: `${cabinet.id}-APRON-SHORT`,
      moduleCode: `TABLE-${W}x${D}`,
      elementId: cabinet.id,
      name: 'Short Support Apron',
      material: carcassMat,
      role: 'stretcher',
      quantity: 2,
      finishedLength: shortApronL,
      finishedWidth: apronW,
      cuttingLength: shortApronL,
      cuttingWidth: round2(apronW - ebCarcass),
      thickness: tc,
      grain: 'L',
      edgeBanding: { w1: ebCodeCarcass },
      holes: [],
    });

    hardware.push({
      code: 'HW-BRACKET-CORNER-LEG',
      name: 'Heavy Duty Steel Corner Leg Bracket',
      category: 'fastener',
      quantity: 4,
    });
    hardware.push({
      code: 'HW-BOLT-M8-LEG',
      name: 'M8 Hanger Bolt with Flange Nut',
      category: 'fastener',
      quantity: 8,
    });

    return { parts, hardware };
  }

  // 1. Left & Right Carcass Sides (Gables)
  const sideHoles: BoringHole[] = [];
  // 32mm system line holes: two rows at 37mm from front and 37mm from back
  const frontColX = 37;
  const backColX = Math.max(37, D - 50);
  const startY = 100;
  const endY = H - 100;
  for (let y = startY; y <= endY; y += rulePack.system32Pitch) {
    sideHoles.push({ face: 'A', x: frontColX, y, diameter: 5, depth: 12 });
    sideHoles.push({ face: 'A', x: backColX, y, diameter: 5, depth: 12 });
  }

  // Left Gable
  parts.push({
    partId: `${cabinet.id}-LH-SIDE`,
    moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
    elementId: cabinet.id,
    name: 'Left Side (Gable)',
    material: carcassMat,
    role: 'carcass',
    quantity: 1,
    finishedLength: H,
    finishedWidth: D,
    cuttingLength: H,
    cuttingWidth: round2(D - ebCarcass),
    thickness: tc,
    grain: 'L',
    edgeBanding: { w1: ebCodeCarcass },
    holes: sideHoles,
  });

  // Right Gable
  parts.push({
    partId: `${cabinet.id}-RH-SIDE`,
    moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
    elementId: cabinet.id,
    name: 'Right Side (Gable)',
    material: carcassMat,
    role: 'carcass',
    quantity: 1,
    finishedLength: H,
    finishedWidth: D,
    cuttingLength: H,
    cuttingWidth: round2(D - ebCarcass),
    thickness: tc,
    grain: 'L',
    edgeBanding: { w1: ebCodeCarcass },
    holes: sideHoles,
  });

  // 2. Bottom Panel
  const bottomW = W - 2 * tc;
  parts.push({
    partId: `${cabinet.id}-BOTTOM`,
    moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
    elementId: cabinet.id,
    name: 'Bottom Panel',
    material: carcassMat,
    role: 'carcass',
    quantity: 1,
    finishedLength: bottomW,
    finishedWidth: D,
    cuttingLength: bottomW,
    cuttingWidth: round2(D - ebCarcass),
    thickness: tc,
    grain: 'W',
    edgeBanding: { w1: ebCodeCarcass },
    holes: [],
  });

  // 3. Top Stretcher(s) or Top Panel
  if (isBase || isVanity) {
    // Front and back horizontal stretchers (100mm wide) - leaves sink/plumbing drop-in access
    parts.push({
      partId: `${cabinet.id}-TOP-FRONT-STR`,
      moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
      elementId: cabinet.id,
      name: 'Top Front Stretcher',
      material: carcassMat,
      role: 'stretcher',
      quantity: 1,
      finishedLength: bottomW,
      finishedWidth: 100,
      cuttingLength: bottomW,
      cuttingWidth: round2(100 - ebCarcass),
      thickness: tc,
      grain: 'L',
      edgeBanding: { w1: ebCodeCarcass },
      holes: [],
    });
    parts.push({
      partId: `${cabinet.id}-TOP-BACK-STR`,
      moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
      elementId: cabinet.id,
      name: 'Top Back Stretcher',
      material: carcassMat,
      role: 'stretcher',
      quantity: 1,
      finishedLength: bottomW,
      finishedWidth: 100,
      cuttingLength: bottomW,
      cuttingWidth: 100,
      thickness: tc,
      grain: 'L',
      edgeBanding: {},
      holes: [],
    });
  } else {
    // Full Top Panel for Wall / Tall units
    parts.push({
      partId: `${cabinet.id}-TOP`,
      moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
      elementId: cabinet.id,
      name: 'Top Panel',
      material: carcassMat,
      role: 'carcass',
      quantity: 1,
      finishedLength: bottomW,
      finishedWidth: D,
      cuttingLength: bottomW,
      cuttingWidth: round2(D - ebCarcass),
      thickness: tc,
      grain: 'W',
      edgeBanding: { w1: ebCodeCarcass },
      holes: [],
    });
  }

  // 4. Back Panel (Grooved)
  const backW = bottomW + 2 * bgDepth;
  const backH = isVanity ? Math.floor(H / 2) : H - tc + bgDepth;
  parts.push({
    partId: `${cabinet.id}-BACK`,
    moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
    elementId: cabinet.id,
    name: isVanity ? 'Half Back Panel (Plumbing Access)' : 'Back Panel (Grooved)',
    material: backMat,
    role: 'back',
    quantity: 1,
    finishedLength: backH,
    finishedWidth: backW,
    cuttingLength: backH,
    cuttingWidth: backW,
    thickness: tb,
    grain: 'L',
    edgeBanding: {},
    holes: [],
  });

  // 5. Adjustable Shelves & Wardrobe Dividers
  if (cabinet.type === 'base' || cabinet.type === 'wall' || cabinet.type === 'tall' || isWardrobe || isVanity) {
    const shelfCount = isWardrobe ? 2 : (cabinet.type === 'tall' ? 4 : (cabinet.type === 'wall' ? 2 : 1));
    const shelfW = bottomW - 2; // 2mm clearance
    const shelfD = D - rulePack.shelfSetback;
    parts.push({
      partId: `${cabinet.id}-SHELF`,
      moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
      elementId: cabinet.id,
      name: isWardrobe ? 'Wardrobe Loft/Internal Shelf' : 'Adjustable Shelf',
      material: carcassMat,
      role: 'shelf',
      quantity: shelfCount,
      finishedLength: shelfW,
      finishedWidth: shelfD,
      cuttingLength: shelfW,
      cuttingWidth: round2(shelfD - ebCarcass),
      thickness: tc,
      grain: 'W',
      edgeBanding: { w1: ebCodeCarcass },
      holes: [],
    });

    hardware.push({
      code: 'HW-PIN-5MM',
      name: '5mm Nickel Shelf Support Pin',
      category: 'shelf_pin',
      quantity: shelfCount * 4,
    });

    if (isWardrobe) {
      hardware.push({
        code: 'HW-RAIL-OVAL-CHROME',
        name: 'Oval Chrome Plated Wardrobe Hanging Rail (900mm)',
        category: 'fastener',
        quantity: 1,
      });
      hardware.push({
        code: 'HW-BRACKET-RAIL-END',
        name: 'Oval Wardrobe Rail End Flange Supports (Pair)',
        category: 'fastener',
        quantity: 2,
      });
    }
  }

  // 6. Shutters (Fronts)
  if (cabinet.type !== 'drawer') {
    const isDoubleDoor = W > 600;
    const doorCount = isDoubleDoor ? 2 : 1;
    const doorH = H - (2 * reveal);
    const doorW = isDoubleDoor
      ? Math.floor((W - (3 * reveal)) / 2)
      : W - (2 * reveal);

    const hingesPerDoor = H > 2000 ? 5 : (H > 1500 ? 4 : (H > 900 ? 3 : 2));

    const doorHoles: BoringHole[] = [];
    doorHoles.push({ face: 'B', x: 22.5, y: 100, diameter: 35, depth: 12 });
    doorHoles.push({ face: 'B', x: 22.5, y: doorH - 100, diameter: 35, depth: 12 });
    if (hingesPerDoor >= 3) {
      doorHoles.push({ face: 'B', x: 22.5, y: Math.floor(doorH / 2), diameter: 35, depth: 12 });
    }

    parts.push({
      partId: `${cabinet.id}-SHUTTER`,
      moduleCode: `${cabinet.type.toUpperCase()}-${W}`,
      elementId: cabinet.id,
      name: isDoubleDoor ? 'Cabinet Shutter (Pair)' : 'Cabinet Shutter',
      material: shutterMat,
      role: 'shutter',
      quantity: doorCount,
      finishedLength: doorH,
      finishedWidth: doorW,
      cuttingLength: round2(doorH - 2 * ebShutter),
      cuttingWidth: round2(doorW - 2 * ebShutter),
      thickness: ts,
      grain: 'L',
      edgeBanding: {
        l1: ebCodeShutter,
        l2: ebCodeShutter,
        w1: ebCodeShutter,
        w2: ebCodeShutter,
      },
      holes: doorHoles,
    });

    hardware.push({
      code: 'HW-HINGE-CLIP-TOP-110',
      name: '110° Soft-Close Concealed Hinge with Base Plate',
      category: 'hinge',
      quantity: doorCount * hingesPerDoor,
    });

    hardware.push({
      code: 'HW-HANDLE-BAR-160',
      name: '160mm Brushed SS Bar Handle',
      category: 'handle',
      quantity: doorCount,
    });
  }

  // 7. Base / Tall / Wardrobe / Vanity Unit Legs
  if (isBase || isTall || isWardrobe || isVanity) {
    hardware.push({
      code: 'HW-LEG-ADJ-100',
      name: '100mm Heavy Duty Adjustable Plastic Cabinet Leg',
      category: 'leg',
      quantity: 4,
    });
  }

  return { parts, hardware };
}

/**
 * Explodes an entire room of cabinets into a complete manufacturing package.
 */
export function explodeScene(
  cabinets: ExplodeCabinetInput[],
  rulePack: RulePack = SEED_RULE_PACK_V1,
  projectCode: string = 'PROJECT'
): ManufacturingPackage {
  const allParts: ManufacturingPart[] = [];
  const hardwareMap = new Map<string, ManufacturingHardware>();

  let totalCarcaseArea = 0;
  let totalShutterArea = 0;
  let totalBackArea = 0;
  const edgeBandMeters: Record<string, number> = {};

  for (const cab of cabinets) {
    const { parts, hardware } = explodeCabinet(cab, rulePack, projectCode);

    for (const p of parts) {
      allParts.push(p);

      // Area in m² (length * width / 1,000,000) * quantity
      const area = (p.finishedLength * p.finishedWidth * p.quantity) / 1_000_000;
      if (p.role === 'carcass' || p.role === 'shelf' || p.role === 'stretcher') {
        totalCarcaseArea += area;
      } else if (p.role === 'shutter') {
        totalShutterArea += area;
      } else if (p.role === 'back') {
        totalBackArea += area;
      }

      // Edge banding linear meters
      const { l1, l2, w1, w2 } = p.edgeBanding;
      if (l1) edgeBandMeters[l1] = (edgeBandMeters[l1] || 0) + (p.finishedLength * p.quantity) / 1000;
      if (l2) edgeBandMeters[l2] = (edgeBandMeters[l2] || 0) + (p.finishedLength * p.quantity) / 1000;
      if (w1) edgeBandMeters[w1] = (edgeBandMeters[w1] || 0) + (p.finishedWidth * p.quantity) / 1000;
      if (w2) edgeBandMeters[w2] = (edgeBandMeters[w2] || 0) + (p.finishedWidth * p.quantity) / 1000;
    }

    for (const h of hardware) {
      const existing = hardwareMap.get(h.code);
      if (existing) {
        existing.quantity += h.quantity;
      } else {
        hardwareMap.set(h.code, { ...h });
      }
    }
  }

  return {
    projectCode,
    elementCount: cabinets.length,
    parts: allParts,
    hardware: Array.from(hardwareMap.values()),
    summary: {
      totalParts: allParts.reduce((acc, p) => acc + p.quantity, 0),
      totalCarcaseAreaSqM: round2(totalCarcaseArea),
      totalShutterAreaSqM: round2(totalShutterArea),
      totalBackPanelAreaSqM: round2(totalBackArea),
      edgeBandLinearMeters: Object.fromEntries(
        Object.entries(edgeBandMeters).map(([k, v]) => [k, round2(v)])
      ),
    },
  };
}
