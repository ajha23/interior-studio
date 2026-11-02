/**
 * Pure domain EffectiveEntitlementManager.
 * Computes layered entitlements: Base Plan + Add-ons + Contractual Overrides + Promotions.
 * Conforms to Constitution Principle X (FR-003) and Architectural Safety Limits.
 */

import { SubscriptionCatalog } from './subscriptionCatalog';
import {
  PLATFORM_SAFETY_CEILINGS,
  type CanonicalKey,
  type EffectiveEntitlements,
  type TenantEntitlementOverride,
  type TenantSubscription,
} from './types';

export interface IEffectiveEntitlementManager {
  computeEffectiveEntitlements(
    subscription: TenantSubscription,
    overrides: TenantEntitlementOverride[]
  ): EffectiveEntitlements;
  isEntitled(effective: EffectiveEntitlements, featureKey: CanonicalKey): boolean;
  getEffectiveQuota(effective: EffectiveEntitlements, quotaKey: CanonicalKey): number;
}

export class EffectiveEntitlementManager implements IEffectiveEntitlementManager {
  constructor(private catalog: SubscriptionCatalog) {}

  public computeEffectiveEntitlements(
    subscription: TenantSubscription,
    overrides: TenantEntitlementOverride[]
  ): EffectiveEntitlements {
    const plan = this.catalog.getPlan(subscription.planId, subscription.planVersion);
    if (!plan) {
      throw new Error(
        `Subscription plan "${subscription.planId}" v${subscription.planVersion} not found in catalog.`
      );
    }

    // 1. Start with base plan features & quotas
    const features: Record<string, boolean> = { ...plan.features };
    const quotas: Record<string, number> = { ...plan.quotas };

    // 2. Filter active overrides (ignore expired)
    const now = new Date().toISOString();
    const activeOverrides = overrides.filter(
      (o) => o.orgId === subscription.orgId && (!o.expiresAt || o.expiresAt > now)
    );

    // 3. Apply active overrides in chronological order
    for (const ov of activeOverrides) {
      if (ov.overrideType === 'feature_toggle' && ov.booleanValue !== undefined) {
        features[ov.key] = ov.booleanValue;
      } else if (ov.overrideType === 'quota_delta' && ov.numericDelta !== undefined) {
        const current = quotas[ov.key] ?? 0;
        if (current !== -1) {
          quotas[ov.key] = current + ov.numericDelta;
        }
      } else if (ov.overrideType === 'quota_absolute' && ov.numericAbsolute !== undefined) {
        quotas[ov.key] = ov.numericAbsolute;
      }

      // Enforce immutable platform architectural safety ceilings
      const currentVal = quotas[ov.key];
      const ceiling = PLATFORM_SAFETY_CEILINGS[ov.key];
      if (ceiling !== undefined && currentVal !== undefined && currentVal !== -1) {
        if (currentVal > ceiling) {
          quotas[ov.key] = ceiling;
        }
      }
    }

    return {
      orgId: subscription.orgId,
      planId: plan.id,
      planVersion: plan.version,
      features,
      quotas,
      activeOverrides,
    };
  }

  public isEntitled(effective: EffectiveEntitlements, featureKey: CanonicalKey): boolean {
    return effective.features[featureKey] === true;
  }

  public getEffectiveQuota(effective: EffectiveEntitlements, quotaKey: CanonicalKey): number {
    return effective.quotas[quotaKey] ?? -1;
  }
}
