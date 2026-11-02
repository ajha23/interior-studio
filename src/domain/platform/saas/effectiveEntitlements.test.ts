import { describe, expect, it } from 'vitest';
import { EffectiveEntitlementManager } from './effectiveEntitlements';
import { SubscriptionCatalog } from './subscriptionCatalog';
import type { TenantEntitlementOverride, TenantSubscription } from './types';

describe('EffectiveEntitlementManager (Layered Calculation & Precedence)', () => {
  const catalog = new SubscriptionCatalog();
  const manager = new EffectiveEntitlementManager(catalog);
  const orgId = '55555555-5555-5555-5555-555555555555';

  const starterSub: TenantSubscription = {
    id: 'sub_test',
    orgId,
    planId: 'starter',
    planVersion: 1,
    cycle: 'monthly',
    status: 'active',
    currentPeriodStart: '2026-11-01T00:00:00.000Z',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    gracePeriodEndsAt: null,
    cancelAtPeriodEnd: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  it('computes baseline entitlements from subscription plan with no overrides', () => {
    const effective = manager.computeEffectiveEntitlements(starterSub, []);

    expect(effective.planId).toBe('starter');
    expect(manager.isEntitled(effective, 'feature.manufacturing.cnc_cutlist')).toBe(true);
    expect(manager.isEntitled(effective, 'feature.design.3d.export_cad')).toBe(false);
    expect(manager.getEffectiveQuota(effective, 'quota.projects.active.max')).toBe(15);
    expect(manager.getEffectiveQuota(effective, 'quota.seats.designers.max')).toBe(2);
  });

  it('applies feature toggle overrides', () => {
    const overrides: TenantEntitlementOverride[] = [
      {
        id: 'ov_cad',
        orgId,
        key: 'feature.design.3d.export_cad',
        overrideType: 'feature_toggle',
        booleanValue: true,
        reason: 'Beta partner grant',
        appliedBy: 'admin_sys',
        expiresAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const effective = manager.computeEffectiveEntitlements(starterSub, overrides);
    expect(manager.isEntitled(effective, 'feature.design.3d.export_cad')).toBe(true);
  });

  it('ignores expired overrides', () => {
    const expiredOverrides: TenantEntitlementOverride[] = [
      {
        id: 'ov_expired',
        orgId,
        key: 'feature.design.3d.export_cad',
        overrideType: 'feature_toggle',
        booleanValue: true,
        reason: 'Expired promo',
        appliedBy: 'admin_sys',
        expiresAt: '2025-01-01T00:00:00.000Z', // In the past
        createdAt: '2024-12-01T00:00:00.000Z',
      },
    ];

    const effective = manager.computeEffectiveEntitlements(starterSub, expiredOverrides);
    expect(manager.isEntitled(effective, 'feature.design.3d.export_cad')).toBe(false);
  });

  it('accumulates commercial quota deltas (Add-ons)', () => {
    const overrides: TenantEntitlementOverride[] = [
      // Base: 2 seats. Add-on 1: +5 seats. Add-on 2: +5 seats. Total = 12 seats
      {
        id: 'addon_1',
        orgId,
        key: 'quota.seats.designers.max',
        overrideType: 'quota_delta',
        numericDelta: 5,
        reason: 'Seat bundle 5 purchased',
        appliedBy: 'stripe_webhook',
        expiresAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'addon_2',
        orgId,
        key: 'quota.seats.designers.max',
        overrideType: 'quota_delta',
        numericDelta: 5,
        reason: 'Seat bundle 5 purchased',
        appliedBy: 'stripe_webhook',
        expiresAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const effective = manager.computeEffectiveEntitlements(starterSub, overrides);
    expect(manager.getEffectiveQuota(effective, 'quota.seats.designers.max')).toBe(12);
  });

  it('enforces immutable platform architectural safety ceilings (Clarification 3)', () => {
    // Attempt an override with 50,000 active projects (platform ceiling is 10,000)
    const dangerousOverride: TenantEntitlementOverride[] = [
      {
        id: 'ov_huge',
        orgId,
        key: 'quota.projects.active.max',
        overrideType: 'quota_absolute',
        numericAbsolute: 50000,
        reason: 'Excessive contract',
        appliedBy: 'sales_rep',
        expiresAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const effective = manager.computeEffectiveEntitlements(starterSub, dangerousOverride);
    // Must be capped by PLATFORM_SAFETY_CEILINGS
    expect(manager.getEffectiveQuota(effective, 'quota.projects.active.max')).toBe(10000);
  });
});
