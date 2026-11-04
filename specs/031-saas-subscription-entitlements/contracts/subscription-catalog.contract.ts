/**
 * Contract: Subscription Catalog & Effective Entitlement Management
 * Layer: Pure domain / framework-free TypeScript
 */

import type {
  CanonicalKey,
  SubscriptionPlan,
  TenantEntitlementOverride,
  TenantSubscription,
} from '../data-model';

export interface EffectiveEntitlements {
  orgId: string;
  planId: string;
  planVersion: number;
  features: Record<CanonicalKey, boolean>;
  quotas: Record<CanonicalKey, number>; // -1 indicates unlimited
  activeOverrides: TenantEntitlementOverride[];
}

export interface ISubscriptionCatalog {
  registerPlan(plan: SubscriptionPlan): void;
  getPlan(planId: string, version?: number): SubscriptionPlan | undefined;
  listPublicPlans(): SubscriptionPlan[];
}

export interface IEffectiveEntitlementManager {
  /**
   * Computes cumulative effective entitlements using strict layered precedence:
   * Base Plan + Add-ons + Contractual Overrides + Promotional Grants.
   */
  computeEffectiveEntitlements(
    subscription: TenantSubscription,
    overrides: TenantEntitlementOverride[]
  ): EffectiveEntitlements;

  isEntitled(
    effective: EffectiveEntitlements,
    featureKey: CanonicalKey
  ): boolean;

  getEffectiveQuota(
    effective: EffectiveEntitlements,
    quotaKey: CanonicalKey
  ): number;
}
