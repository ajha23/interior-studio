/**
 * Client Zustand Store for SaaS Multi-Tenant Subscriptions & Entitlements.
 * Conforms to Constitution Principle X (FR-004, FR-007, US6).
 */

import { create } from 'zustand';
import { defaultSubscriptionCatalog } from '@/domain/platform/saas/subscriptionCatalog';
import { EffectiveEntitlementManager } from '@/domain/platform/saas/effectiveEntitlements';
import type {
  CanonicalKey,
  EffectiveEntitlements,
  TenantEntitlementOverride,
  TenantSubscription,
  TenantUsageQuota,
} from '@/domain/platform/saas/types';

export interface SubscriptionStoreState {
  activeSubscription: TenantSubscription | null;
  effectiveEntitlements: EffectiveEntitlements | null;
  overrides: TenantEntitlementOverride[];
  quotas: TenantUsageQuota[];

  // Modal UI states
  upgradeModalOpen: boolean;
  upgradeModalTargetTier?: string;
  upgradeModalFeatureKey?: CanonicalKey;
  upgradeModalQuotaKey?: CanonicalKey;
  upgradeModalReason?: string;

  rosterModalOpen: boolean;
  rosterModalAllowedActive: number;

  // Actions
  setSubscription: (sub: TenantSubscription) => void;
  setOverrides: (overrides: TenantEntitlementOverride[]) => void;
  setQuotas: (quotas: TenantUsageQuota[]) => void;
  upgradePlan: (targetTier: string) => void;

  openUpgradeModal: (
    targetTier?: string,
    featureKey?: CanonicalKey,
    quotaKey?: CanonicalKey,
    reason?: string
  ) => void;
  closeUpgradeModal: () => void;

  openRosterModal: (allowedActive: number) => void;
  closeRosterModal: () => void;

  isEntitled: (featureKey: CanonicalKey) => boolean;
  getRemainingQuota: (quotaKey: CanonicalKey) => number;
  reset: () => void;
}

const entitlementManager = new EffectiveEntitlementManager(defaultSubscriptionCatalog);

const defaultOrgId = '00000000-0000-0000-0000-000000000000';
const defaultInitialSub: TenantSubscription = {
  id: 'sub_default',
  orgId: defaultOrgId,
  planId: 'starter',
  planVersion: 1,
  cycle: 'monthly',
  status: 'active',
  currentPeriodStart: new Date().toISOString(),
  currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
  gracePeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const useSubscriptionStore = create<SubscriptionStoreState>((set, get) => ({
  activeSubscription: defaultInitialSub,
  effectiveEntitlements: entitlementManager.computeEffectiveEntitlements(defaultInitialSub, []),
  overrides: [],
  quotas: [],

  upgradeModalOpen: false,
  upgradeModalTargetTier: undefined,
  upgradeModalFeatureKey: undefined,
  upgradeModalQuotaKey: undefined,
  upgradeModalReason: undefined,

  rosterModalOpen: false,
  rosterModalAllowedActive: 15,

  setSubscription: (sub: TenantSubscription) => {
    const overrides = get().overrides;
    const effective = entitlementManager.computeEffectiveEntitlements(sub, overrides);
    set({
      activeSubscription: sub,
      effectiveEntitlements: effective,
    });
  },

  setOverrides: (overrides: TenantEntitlementOverride[]) => {
    const sub = get().activeSubscription;
    if (sub) {
      const effective = entitlementManager.computeEffectiveEntitlements(sub, overrides);
      set({ overrides, effectiveEntitlements: effective });
    } else {
      set({ overrides });
    }
  },

  setQuotas: (quotas: TenantUsageQuota[]) => {
    set({ quotas });
  },

  upgradePlan: (targetTier: string) => {
    const current = get().activeSubscription;
    if (!current) return;

    const updated: TenantSubscription = {
      ...current,
      planId: targetTier,
      planVersion: 1,
      updatedAt: new Date().toISOString(),
    };

    const effective = entitlementManager.computeEffectiveEntitlements(updated, get().overrides);
    set({
      activeSubscription: updated,
      effectiveEntitlements: effective,
      upgradeModalOpen: false,
    });
  },

  openUpgradeModal: (
    targetTier?: string,
    featureKey?: CanonicalKey,
    quotaKey?: CanonicalKey,
    reason?: string
  ) => {
    set({
      upgradeModalOpen: true,
      upgradeModalTargetTier: targetTier || 'pro',
      upgradeModalFeatureKey: featureKey,
      upgradeModalQuotaKey: quotaKey,
      upgradeModalReason: reason,
    });
  },

  closeUpgradeModal: () => {
    set({
      upgradeModalOpen: false,
      upgradeModalTargetTier: undefined,
      upgradeModalFeatureKey: undefined,
      upgradeModalQuotaKey: undefined,
      upgradeModalReason: undefined,
    });
  },

  openRosterModal: (allowedActive: number) => {
    set({
      rosterModalOpen: true,
      rosterModalAllowedActive: allowedActive,
    });
  },

  closeRosterModal: () => {
    set({
      rosterModalOpen: false,
    });
  },

  isEntitled: (featureKey: CanonicalKey): boolean => {
    const effective = get().effectiveEntitlements;
    if (!effective) return false;
    return entitlementManager.isEntitled(effective, featureKey);
  },

  getRemainingQuota: (quotaKey: CanonicalKey): number => {
    const state = get();
    const quotaRecord = state.quotas.find((q) => q.quotaKey === quotaKey);
    const effective = state.effectiveEntitlements;

    let limit = -1;
    if (effective) {
      limit = entitlementManager.getEffectiveQuota(effective, quotaKey);
    }
    if (quotaRecord && quotaRecord.effectiveLimit !== undefined) {
      limit = quotaRecord.effectiveLimit;
    }

    if (limit === -1) return -1; // Unlimited
    const consumed = quotaRecord ? quotaRecord.consumedCount + quotaRecord.reservedCount : 0;
    return Math.max(0, limit - consumed);
  },

  reset: () => {
    set({
      activeSubscription: defaultInitialSub,
      effectiveEntitlements: entitlementManager.computeEffectiveEntitlements(defaultInitialSub, []),
      overrides: [],
      quotas: [],
      upgradeModalOpen: false,
      rosterModalOpen: false,
    });
  },
}));
