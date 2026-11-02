import { describe, expect, it } from 'vitest';
import { useBillingStore } from './billingStore';

describe('Billing Store & Entitlements State (BIL-01, ENT-07)', () => {
  it('initializes with active pro tier and allows setting tier', () => {
    const store = useBillingStore.getState();
    expect(store.currentTier).toBe('pro');
    expect(store.subscription?.status).toBe('active');

    store.setTier('starter');
    expect(useBillingStore.getState().currentTier).toBe('starter');
    expect(useBillingStore.getState().subscription?.planId).toBe('starter');
  });

  it('opens and closes upgrade modal with target feature and tier', () => {
    const store = useBillingStore.getState();
    store.openUpgradeModal('drawings.dxf', 'pro');

    expect(useBillingStore.getState().upgradeModalOpen).toBe(true);
    expect(useBillingStore.getState().upgradeModalFeature).toBe('drawings.dxf');
    expect(useBillingStore.getState().upgradeModalTargetTier).toBe('pro');

    store.closeUpgradeModal();
    expect(useBillingStore.getState().upgradeModalOpen).toBe(false);
  });

  it('upgrades plan through billing adapter and unlocks target tier', async () => {
    const store = useBillingStore.getState();
    store.setTier('starter');

    const sub = await store.upgradePlan('pro', 'annual');
    expect(sub.planId).toBe('pro');
    expect(sub.cycle).toBe('annual');
    expect(useBillingStore.getState().currentTier).toBe('pro');
    expect(useBillingStore.getState().cycle).toBe('annual');
  });
});

