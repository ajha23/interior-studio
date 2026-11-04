import { describe, expect, it } from 'vitest';
import { explodeScene } from './explode';
import { FACTORY_VALIDATED_RULE_PACK_V1, SEED_RULE_PACK_V1 } from '../../domain/manufacturing/rulePack';
import { computeCanonicalSha256 } from './packageHash';

describe('ARC-03 Deterministic Golden Package & Hashing Contract', () => {
  const goldenCabinets = [
    {
      id: 'base-sink-900',
      type: 'sink' as const,
      dimensions: { width: 900, height: 720, depth: 560 },
    },
    {
      id: 'base-standard-600',
      type: 'base' as const,
      dimensions: { width: 600, height: 720, depth: 560 },
    },
    {
      id: 'wall-lift-600',
      type: 'wall' as const,
      dimensions: { width: 600, height: 720, depth: 320 },
    },
  ];

  it('generates 100% deterministic parts and canonical hash across repeated runs', () => {
    const pkg1 = explodeScene(goldenCabinets, FACTORY_VALIDATED_RULE_PACK_V1, 'proj-golden-001');
    const pkg2 = explodeScene(goldenCabinets, FACTORY_VALIDATED_RULE_PACK_V1, 'proj-golden-001');

    expect(pkg1.canonicalHash).toBe(pkg2.canonicalHash);
    expect(pkg1.canonicalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pkg1.parts.length).toBe(pkg2.parts.length);
  });

  it('guarantees different canonical hashes when rule pack status or thickness changes', () => {
    const pkgValidated = explodeScene(goldenCabinets, FACTORY_VALIDATED_RULE_PACK_V1, 'proj-golden-001');
    const pkgProvisional = explodeScene(goldenCabinets, SEED_RULE_PACK_V1, 'proj-golden-001');

    expect(pkgValidated.canonicalHash).not.toBe(pkgProvisional.canonicalHash);
  });

  it('computes expected deterministic hash for golden reference payload', () => {
    const goldenPayload = {
      rulePack: 'seed_joinery_v1',
      version: '1.0.0',
      partsCount: 15,
      totalAreaSqM: 4.82,
      hardwareUnits: 28,
    };

    const hash1 = computeCanonicalSha256(goldenPayload);
    const hash2 = computeCanonicalSha256({
      // Re-ordered keys to verify canonical key-sorting
      totalAreaSqM: 4.82,
      hardwareUnits: 28,
      partsCount: 15,
      version: '1.0.0',
      rulePack: 'seed_joinery_v1',
    });

    expect(hash1).toBe(hash2);
    expect(hash1).toBe('740a4e2047ef92e9d014fd848b001b8936889ea302bf13aea9c1bebf716b3003');
    expect(hash1.length).toBe(64);
  });
});
