import { describe, it, expect } from 'vitest';
import { EntitlementRegistry } from './entitlementRegistry';
import { SubscriptionCatalog } from './subscriptionCatalog';

describe('nestingEntitlement', () => {
  it('registers feature.manufacturing.sheet_nesting and quota in EntitlementRegistry', () => {
    const keys = EntitlementRegistry.listRegisteredKeys();
    expect(keys).toContain('feature.manufacturing.sheet_nesting');
    expect(keys).toContain('quota.nesting_runs.monthly.max');

    const feature = EntitlementRegistry.getCapability('feature.manufacturing.sheet_nesting');
    expect(feature?.displayName).toContain('Sheet Nesting');

    const quota = EntitlementRegistry.getCapability('quota.nesting_runs.monthly.max');
    expect(quota?.category).toBe('quota');
  });

  it('entitles Pro, Enterprise, and InHouse tiers while restricting Starter and Trial', () => {
    const catalog = new SubscriptionCatalog();
    const trial = catalog.getPlan('trial', 1);
    const starter = catalog.getPlan('starter', 1);
    const pro = catalog.getPlan('pro', 1);
    const enterprise = catalog.getPlan('enterprise', 1);
    const inhouse = catalog.getPlan('inhouse', 1);

    expect(trial?.features['feature.manufacturing.sheet_nesting']).toBe(false);
    expect(starter?.features['feature.manufacturing.sheet_nesting']).toBe(false);

    expect(pro?.features['feature.manufacturing.sheet_nesting']).toBe(true);
    expect(enterprise?.features['feature.manufacturing.sheet_nesting']).toBe(true);
    expect(inhouse?.features['feature.manufacturing.sheet_nesting']).toBe(true);

    expect(pro?.quotas['quota.nesting_runs.monthly.max']).toBe(100);
    expect(enterprise?.quotas['quota.nesting_runs.monthly.max']).toBe(1000);
  });
});
