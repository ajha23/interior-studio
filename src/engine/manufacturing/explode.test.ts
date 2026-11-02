import { describe, it, expect } from 'vitest';
import { explodeCabinet, explodeScene } from './explode';
import { SEED_RULE_PACK_V1 } from '../../domain/manufacturing/rulePack';

describe('Manufacturing Explode Engine (Step B)', () => {
  it('explodes a standard 600mm base cabinet into exact constituent parts', () => {
    const cabinet = {
      id: 'cab_base_600',
      type: 'base',
      dimensions: { width: 600, height: 720, depth: 560 },
      materialId: 'PLY-BWP-18',
      shutterMaterialId: 'MDF-PU-18-MATTE',
    };

    const { parts, hardware } = explodeCabinet(cabinet, SEED_RULE_PACK_V1, 'TEST_PRJ');

    // Expected parts: Left Gable, Right Gable, Bottom, Top Front Stretcher, Top Back Stretcher, Back, Shelf, Shutter
    expect(parts.length).toBe(8);

    const leftGable = parts.find((p) => p.name === 'Left Side (Gable)');
    expect(leftGable).toBeDefined();
    expect(leftGable?.finishedLength).toBe(720);
    expect(leftGable?.finishedWidth).toBe(560);
    // Cutting width should deduct 0.8mm edge band on front edge
    expect(leftGable?.cuttingWidth).toBe(559.2);
    expect(leftGable?.holes.length).toBeGreaterThan(0); // Has 32mm system boring holes

    const bottom = parts.find((p) => p.name === 'Bottom Panel');
    expect(bottom).toBeDefined();
    // 600 - 2 * 18 = 564mm
    expect(bottom?.finishedLength).toBe(564);

    const shutter = parts.find((p) => p.role === 'shutter');
    expect(shutter).toBeDefined();
    // 720 - 2 * 3 = 714mm finished length
    expect(shutter?.finishedLength).toBe(714);
    // 600 - 2 * 3 = 594mm finished width
    expect(shutter?.finishedWidth).toBe(594);
    // 2.0mm ABS edge band on all 4 edges -> deductions of 4mm each
    expect(shutter?.cuttingLength).toBe(710);
    expect(shutter?.cuttingWidth).toBe(590);
    // Hinge cup holes check
    const hingeHoles = shutter?.holes.filter((h) => h.diameter === 35);
    expect(hingeHoles?.length).toBe(2);

    // Hardware checks
    const hinges = hardware.find((h) => h.category === 'hinge');
    expect(hinges?.quantity).toBe(2);
    const legs = hardware.find((h) => h.category === 'leg');
    expect(legs?.quantity).toBe(4);
    const shelfPins = hardware.find((h) => h.category === 'shelf_pin');
    expect(shelfPins?.quantity).toBe(4);
  });

  it('handles double shutter on wider units (>600mm)', () => {
    const wideCabinet = {
      id: 'cab_base_900',
      type: 'base',
      dimensions: { width: 900, height: 720, depth: 560 },
    };

    const { parts, hardware } = explodeCabinet(wideCabinet, SEED_RULE_PACK_V1);
    const shutter = parts.find((p) => p.role === 'shutter');
    expect(shutter).toBeDefined();
    expect(shutter?.quantity).toBe(2); // Pair of shutters
    // Width = floor((900 - 3 * 3) / 2) = floor(891 / 2) = 445mm
    expect(shutter?.finishedWidth).toBe(445);

    const hinges = hardware.find((h) => h.category === 'hinge');
    expect(hinges?.quantity).toBe(4); // 2 hinges * 2 doors = 4
  });

  it('aggregates a whole scene and computes summary metrics', () => {
    const scene = [
      { id: 'b1', type: 'base', dimensions: { width: 600, height: 720, depth: 560 } },
      { id: 'w1', type: 'wall', dimensions: { width: 600, height: 720, depth: 350 } },
    ];

    const pkg = explodeScene(scene, SEED_RULE_PACK_V1, 'KITCHEN_01');
    expect(pkg.elementCount).toBe(2);
    expect(pkg.parts.length).toBeGreaterThan(10);
    expect(pkg.summary.totalCarcaseAreaSqM).toBeGreaterThan(0);
    expect(pkg.summary.totalShutterAreaSqM).toBeGreaterThan(0);
    expect(pkg.summary.edgeBandLinearMeters['EB-0.8-PVC']).toBeGreaterThan(0);
    expect(pkg.summary.edgeBandLinearMeters['EB-2.0-ABS']).toBeGreaterThan(0);

    // ARC-02 & ARC-04 assertions
    expect(pkg.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.rulePackId).toBe(SEED_RULE_PACK_V1.id);
    expect(pkg.rulePackStatus).toBe('provisional');
  });

  it('produces distinct SHA-256 hashes when cabinet dimensions are modified', () => {
    const pkgA = explodeScene(
      [{ id: 'b1', type: 'base', dimensions: { width: 600, height: 720, depth: 560 } }],
      SEED_RULE_PACK_V1,
      'KITCHEN_01'
    );
    const pkgB = explodeScene(
      [{ id: 'b1', type: 'base', dimensions: { width: 605, height: 720, depth: 560 } }], // 5mm diff
      SEED_RULE_PACK_V1,
      'KITCHEN_01'
    );

    expect(pkgA.canonicalHash).not.toBe(pkgB.canonicalHash);
  });

  it('explodes a 2-door wardrobe with hanging rail and tall shutters', () => {
    const wardrobe = {
      id: 'wr_master_01',
      type: 'wardrobe-hinged',
      dimensions: { width: 900, height: 2100, depth: 600 },
    };

    const { parts, hardware } = explodeCabinet(wardrobe, SEED_RULE_PACK_V1);
    expect(parts.length).toBeGreaterThanOrEqual(6);

    const hangingRail = hardware.find((h) => h.code === 'HW-RAIL-OVAL-CHROME');
    expect(hangingRail).toBeDefined();
    expect(hangingRail?.quantity).toBe(1);

    const shutters = parts.filter((p) => p.role === 'shutter');
    expect(shutters.length).toBe(1);
    expect(shutters[0]?.quantity).toBe(2); // Pair of shutters
    expect(shutters[0]?.finishedLength).toBe(2100 - 2 * 3); // 2094mm

    // Tall shutters (2100mm) get 5 hinges per door -> 10 hinges
    const hinges = hardware.find((h) => h.category === 'hinge');
    expect(hinges?.quantity).toBe(10);
  });

  it('explodes a washroom vanity defaulting to BWP moisture-resistant carcass', () => {
    const vanity = {
      id: 'vanity_01',
      type: 'vanity-bwp',
      dimensions: { width: 800, height: 800, depth: 500 },
    };

    const { parts } = explodeCabinet(vanity, SEED_RULE_PACK_V1);
    const leftGable = parts.find((p) => p.name === 'Left Side (Gable)');
    expect(leftGable?.material).toBe('BWP-PLY-18-WATERPROOF');

    const backPanel = parts.find((p) => p.role === 'back');
    expect(backPanel?.name).toContain('Plumbing Access');
    expect(backPanel?.finishedLength).toBe(400); // Half height for pipe clearance
  });

  it('explodes a parametric loose dining table into top surface, 4 solid legs, and 4 aprons', () => {
    const table = {
      id: 'table_dining_01',
      type: 'loose-table',
      dimensions: { width: 1500, height: 750, depth: 900 },
    };

    const { parts, hardware } = explodeCabinet(table, SEED_RULE_PACK_V1);
    const top = parts.find((p) => p.name === 'Table Top Surface');
    expect(top).toBeDefined();
    expect(top?.finishedLength).toBe(1500);
    expect(top?.finishedWidth).toBe(900);
    expect(top?.thickness).toBe(25);

    const legs = parts.find((p) => p.name === 'Solid Table Leg');
    expect(legs).toBeDefined();
    expect(legs?.quantity).toBe(4);
    expect(legs?.finishedLength).toBe(725); // 750 - 25mm top

    const longAprons = parts.find((p) => p.name === 'Long Support Apron');
    expect(longAprons).toBeDefined();
    expect(longAprons?.quantity).toBe(2);

    const brackets = hardware.find((h) => h.code === 'HW-BRACKET-CORNER-LEG');
    expect(brackets?.quantity).toBe(4);
  });
});

