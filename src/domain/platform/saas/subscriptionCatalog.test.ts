import { describe, expect, it } from 'vitest';
import { EntitlementRegistry } from './entitlementRegistry';
import { SubscriptionCatalog } from './subscriptionCatalog';
import type { SubscriptionPlan } from './types';

describe('EntitlementRegistry', () => {
  it('validates canonical key prefixes correctly', () => {
    expect(EntitlementRegistry.isValidKey('feature.design.3d.render')).toBe(true);
    expect(EntitlementRegistry.isValidKey('quota.projects.active.max')).toBe(true);
    expect(EntitlementRegistry.isValidKey('module.saas.platform')).toBe(true);
    expect(EntitlementRegistry.isValidKey('addon.seats.bundle_5')).toBe(true);

    expect(EntitlementRegistry.isValidKey('invalid_key')).toBe(false);
    expect(EntitlementRegistry.isValidKey('feature.')).toBe(false);
    expect(EntitlementRegistry.isValidKey('custom.something')).toBe(false);
  });

  it('provides registered capability descriptors with categories', () => {
    const allKeys = EntitlementRegistry.listRegisteredKeys();
    expect(allKeys.length).toBeGreaterThan(0);
    expect(allKeys).toContain('feature.design.3d.export_cad');
    expect(allKeys).toContain('quota.projects.active.max');
  });
});

describe('SubscriptionCatalog', () => {
  it('registers and retrieves default commercial plans', () => {
    const catalog = new SubscriptionCatalog();
    const starter = catalog.getPlan('starter', 1);

    expect(starter).toBeDefined();
    expect(starter?.name).toBe('Starter Studio');
    expect(starter?.priceMonthlyPaise).toBe(499900); // ₹4,999/mo in integer paise
    expect(starter?.priceAnnualPaise).toBe(4799000); // ₹47,990/yr
    expect(starter?.quotas['quota.projects.active.max']).toBe(15);
    expect(starter?.quotas['quota.seats.designers.max']).toBe(2);
    expect(starter?.features['feature.manufacturing.cnc_cutlist']).toBe(true);
    expect(starter?.features['feature.design.3d.export_cad']).toBe(false);
  });

  it('lists public commercial plans', () => {
    const catalog = new SubscriptionCatalog();
    const publicPlans = catalog.listPublicPlans();

    expect(publicPlans.length).toBeGreaterThanOrEqual(3);
    const planIds = publicPlans.map((p) => p.id);
    expect(planIds).toContain('starter');
    expect(planIds).toContain('pro');
    expect(planIds).toContain('enterprise');
    // In-house development tier is not public
    expect(planIds).not.toContain('inhouse');
  });

  it('supports versioned plans and preserves grandfathered versions', () => {
    const catalog = new SubscriptionCatalog();
    
    // Original v1
    const proV1 = catalog.getPlan('pro', 1);
    expect(proV1).toBeDefined();
    expect(proV1?.version).toBe(1);

    // Register v2 with updated quotas
    const proV2: SubscriptionPlan = {
      ...proV1!,
      version: 2,
      priceMonthlyPaise: 1499900, // ₹14,999/mo
      quotas: {
        ...proV1!.quotas,
        'quota.seats.designers.max': 10,
      },
      updatedAt: new Date().toISOString(),
    };
    catalog.registerPlan(proV2);

    // Latest version returns v2
    const latest = catalog.getPlan('pro');
    expect(latest?.version).toBe(2);
    expect(latest?.priceMonthlyPaise).toBe(1499900);
    expect(latest?.quotas['quota.seats.designers.max']).toBe(10);

    // Historical v1 lookup remains intact
    const historical = catalog.getPlan('pro', 1);
    expect(historical?.version).toBe(1);
    expect(historical?.priceMonthlyPaise).toBe(1299900);
    expect(historical?.quotas['quota.seats.designers.max']).toBe(5);
  });

  it('rejects registering invalid plans with negative pricing', () => {
    const catalog = new SubscriptionCatalog();
    const invalidPlan = {
      id: 'bad_plan',
      name: 'Bad Plan',
      version: 1,
      tagline: 'Invalid',
      priceMonthlyPaise: -100, // Negative!
      priceAnnualPaise: 0,
      isPublic: true,
      features: {},
      quotas: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => catalog.registerPlan(invalidPlan as SubscriptionPlan)).toThrow();
  });
});
