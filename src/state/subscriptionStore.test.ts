import { beforeEach, describe, expect, it } from 'vitest';
import { useSubscriptionStore } from './subscriptionStore';
import type { TenantSubscription } from '@/domain/platform/saas/types';

describe('useSubscriptionStore Zustand State Store', () => {
  const orgId = '99999999-9999-9999-9999-999999999999';

  const initialSub: TenantSubscription = {
    id: 'sub_store_01',
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

  beforeEach(() => {
    useSubscriptionStore.getState().reset();
    useSubscriptionStore.getState().setSubscription(initialSub);
  });

  it('initializes with default starter plan and evaluates entitlements', () => {
    const store = useSubscriptionStore.getState();

    expect(store.activeSubscription?.planId).toBe('starter');
    expect(store.isEntitled('feature.manufacturing.cnc_cutlist')).toBe(true);
    expect(store.isEntitled('feature.design.3d.export_cad')).toBe(false);
  });

  it('opens and closes upgrade modal with target tier context', () => {
    const store = useSubscriptionStore.getState();

    store.openUpgradeModal('pro', 'feature.design.3d.export_cad');

    const updated = useSubscriptionStore.getState();
    expect(updated.upgradeModalOpen).toBe(true);
    expect(updated.upgradeModalTargetTier).toBe('pro');
    expect(updated.upgradeModalFeatureKey).toBe('feature.design.3d.export_cad');

    updated.closeUpgradeModal();
    expect(useSubscriptionStore.getState().upgradeModalOpen).toBe(false);
  });

  it('updates plan tier and recalculates effective entitlements upon upgrade', () => {
    const store = useSubscriptionStore.getState();

    store.upgradePlan('pro');

    const updated = useSubscriptionStore.getState();
    expect(updated.activeSubscription?.planId).toBe('pro');
    expect(updated.isEntitled('feature.design.3d.export_cad')).toBe(true);
    expect(updated.upgradeModalOpen).toBe(false);
  });

  it('tracks quantitative quotas correctly', () => {
    const store = useSubscriptionStore.getState();

    store.setQuotas([
      {
        id: 'q1',
        orgId,
        quotaKey: 'quota.projects.active.max',
        periodAnchor: '2026-11-01',
        consumedCount: 10,
        reservedCount: 0,
        effectiveLimit: 15,
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ]);

    expect(store.getRemainingQuota('quota.projects.active.max')).toBe(5);
  });
});
