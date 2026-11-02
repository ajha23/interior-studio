/**
 * Global Zustand Store for Studio Billing, Subscriptions, and Entitlements (BIL-01, ENT-07).
 */

import { create } from 'zustand';
import {
  type BillingCycle,
  type BillingInvoice,
  InMemoryBillingAdapter,
  type SubscriptionRecord,
} from '@/domain/platform/billing';
import {
  checkEntitlement,
  type EntitlementCheckResult,
  type FeatureKey,
  type PlanTier,
} from '@/domain/platform/entitlements';

const billingAdapter = new InMemoryBillingAdapter();

const DEFAULT_INVOICES: BillingInvoice[] = [
  {
    id: 'inv_oct_2024',
    subscriptionId: 'sub_active_01',
    invoiceNumber: 'INV-2024-10-0982',
    date: '01/10/2024',
    amountPaise: 1299900,
    taxPaise: 233982,
    status: 'paid',
  },
  {
    id: 'inv_sep_2024',
    subscriptionId: 'sub_active_01',
    invoiceNumber: 'INV-2024-09-0814',
    date: '01/09/2024',
    amountPaise: 1299900,
    taxPaise: 233982,
    status: 'paid',
  },
];

interface BillingStoreState {
  currentTier: PlanTier;
  cycle: BillingCycle;
  subscription: SubscriptionRecord | null;
  invoices: BillingInvoice[];
  upgradeModalOpen: boolean;
  upgradeModalFeature: FeatureKey | null;
  upgradeModalTargetTier: PlanTier | null;

  // Actions
  setTier: (tier: PlanTier) => void;
  setCycle: (cycle: BillingCycle) => void;
  openUpgradeModal: (feature: FeatureKey, targetTier?: PlanTier) => void;
  closeUpgradeModal: () => void;
  upgradePlan: (targetTier: PlanTier, cycle?: BillingCycle) => Promise<SubscriptionRecord>;
  cancelSubscription: () => Promise<void>;
}

export const useBillingStore = create<BillingStoreState>((set, get) => ({
  currentTier: 'pro',
  cycle: 'monthly',
  subscription: {
    id: 'sub_active_01',
    orgId: 'org_inhouse_01',
    planId: 'pro',
    cycle: 'monthly',
    status: 'active',
    currentPeriodStart: '2024-10-01T00:00:00Z',
    currentPeriodEnd: '2024-11-01T00:00:00Z',
    razorpaySubscriptionId: 'sub_live_998124',
  },
  invoices: DEFAULT_INVOICES,
  upgradeModalOpen: false,
  upgradeModalFeature: null,
  upgradeModalTargetTier: null,

  setTier: (tier: PlanTier) => {
    set((state) => ({
      currentTier: tier,
      subscription: state.subscription
        ? { ...state.subscription, planId: tier }
        : null,
    }));
  },

  setCycle: (cycle: BillingCycle) => {
    set({ cycle });
  },

  openUpgradeModal: (feature: FeatureKey, targetTier: PlanTier = 'pro') => {
    set({
      upgradeModalOpen: true,
      upgradeModalFeature: feature,
      upgradeModalTargetTier: targetTier,
    });
  },

  closeUpgradeModal: () => {
    set({
      upgradeModalOpen: false,
      upgradeModalFeature: null,
      upgradeModalTargetTier: null,
    });
  },

  upgradePlan: async (targetTier: PlanTier, cycle?: BillingCycle) => {
    const chosenCycle = cycle || get().cycle;
    const sub = await billingAdapter.createSubscription({
      orgId: 'org_inhouse_01',
      planId: targetTier,
      cycle: chosenCycle,
      customerEmail: 'billing@interiorstudio.in',
    });

    set({
      currentTier: targetTier,
      cycle: chosenCycle,
      subscription: sub,
      upgradeModalOpen: false,
      upgradeModalFeature: null,
      upgradeModalTargetTier: null,
    });

    return sub;
  },

  cancelSubscription: async () => {
    const currentSub = get().subscription;
    if (currentSub) {
      const updated = await billingAdapter.cancelSubscription(currentSub.id);
      set({ subscription: updated });
    }
  },
}));

/**
 * React hook to evaluate a feature entitlement against the active tenant plan.
 */
export function useEntitlement(
  feature: FeatureKey,
  currentCount?: number
): EntitlementCheckResult {
  const currentTier = useBillingStore((s) => s.currentTier);
  return checkEntitlement(currentTier, feature, currentCount);
}

