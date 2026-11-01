import { describe, it, expect } from 'vitest';
import { RulePackSchema, SEED_RULE_PACK_V1 } from './rulePack';

describe('RulePack Schema & Seed V1 (Step B)', () => {
  it('validates SEED_RULE_PACK_V1 against the schema', () => {
    const parsed = RulePackSchema.safeParse(SEED_RULE_PACK_V1);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.carcassThickness).toBe(18);
      expect(parsed.data.shutterThickness).toBe(18);
      expect(parsed.data.backPanelThickness).toBe(8);
      expect(parsed.data.doorReveal).toBe(3);
      expect(parsed.data.system32Pitch).toBe(32);
      expect(parsed.data.edgeBandCodes.carcassExposed).toBe('EB-0.8-PVC');
    }
  });

  it('rejects invalid carcass thickness outside bounded range', () => {
    const invalid = {
      ...SEED_RULE_PACK_V1,
      carcassThickness: 5, // below 12mm
    };
    const parsed = RulePackSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

