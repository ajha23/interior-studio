import { describe, expect, it } from 'vitest';
import { explodeScene } from './explode';
import { FACTORY_VALIDATED_RULE_PACK_V1, SEED_RULE_PACK_V1 } from '../../domain/manufacturing/rulePack';

describe('MFG-01 Part-to-Module Lineage Traceability Contract', () => {
  const sampleCabinets = [
    {
      id: 'base-sink-900',
      type: 'sink',
      dimensions: { width: 900, height: 720, depth: 560 },
    },
    {
      id: 'wall-lift-600',
      type: 'wall',
      dimensions: { width: 600, height: 720, depth: 320 },
    },
    {
      id: 'drawer-450',
      type: 'drawer',
      dimensions: { width: 450, height: 720, depth: 560 },
    },
    {
      id: 'dining-table-1200',
      type: 'loose-table-4p',
      dimensions: { width: 1200, height: 750, depth: 800 },
    },
  ];

  it('guarantees 100% of parts are traceable to source module, rule pack and algorithm', () => {
    const pkg = explodeScene(sampleCabinets, FACTORY_VALIDATED_RULE_PACK_V1, 'PROJ-TEST-TRACE');
    expect(pkg.parts.length).toBeGreaterThan(0);

    for (const part of pkg.parts) {
      // 1. Module lineage
      expect(part.elementId).toBeDefined();
      expect(part.elementId.length).toBeGreaterThan(0);
      expect(part.moduleType).toBeDefined();
      expect(part.moduleType!.length).toBeGreaterThan(0);

      // 2. RulePack lineage
      expect(part.rulePackId).toBe(FACTORY_VALIDATED_RULE_PACK_V1.id);
      expect(part.rulePackVersion).toBe(FACTORY_VALIDATED_RULE_PACK_V1.version);

      // 3. Algorithm version
      expect(part.generationAlgorithmVersion).toBe('2.1.0');

      // 4. Physical manufacturing specs
      expect(part.material.length).toBeGreaterThan(0);
      expect(part.thickness).toBeGreaterThan(0);
      expect(part.finishedLength).toBeGreaterThan(0);
      expect(part.finishedWidth).toBeGreaterThan(0);
      expect(part.cuttingLength).toBeGreaterThan(0);
      expect(part.cuttingWidth).toBeGreaterThan(0);
    }
  });

  it('tracks distinct rule pack versions and IDs when rule pack changes', () => {
    const pkg = explodeScene(sampleCabinets.slice(0, 1), SEED_RULE_PACK_V1, 'PROJ-TEST-SEED');
    for (const part of pkg.parts) {
      expect(part.rulePackId).toBe(SEED_RULE_PACK_V1.id);
    }
  });
});
