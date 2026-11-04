/**
 * React hook for reactive SaaS subscription policy evaluation.
 * Conforms to Constitution Principle X (FR-004, FR-009).
 */

import { useMemo } from 'react';
import { PolicyEvaluationEngine } from '@/domain/platform/saas/policyEngine';
import { defaultSubscriptionCatalog } from '@/domain/platform/saas/subscriptionCatalog';
import type {
  CanonicalKey,
  TenantEntitlementOverride,
  TenantSubscription,
  TenantUsageQuota,
} from '@/domain/platform/saas/types';
import type { ActorRole, ResourceContext } from '@/domain/platform/authorization/types';
import { useAuthorizationStore } from '@/state/authorizationStore';

export interface UseSubscriptionPolicyOptions {
  featureKey?: CanonicalKey;
  permission?: string;
  quotaMetric?: { key: CanonicalKey; amount: number };
  resource?: ResourceContext;
  // Direct dependency injection / overrides (useful for testing or scoped views)
  subscription?: TenantSubscription | null;
  roles?: ActorRole[];
  overrides?: TenantEntitlementOverride[];
  quotas?: TenantUsageQuota[];
  userId?: string;
  orgId?: string;
}

export interface SubscriptionPolicyState {
  allowed: boolean;
  isEntitled: boolean;
  isPermitted: boolean;
  isQuotaAvailable: boolean;
  failedStage?: 'tenant' | 'subscription' | 'rbac' | 'scope' | 'quota';
  reason?: string;
  requiredUpgradeTier?: string;
  quotaRemaining?: number;
}

const FALLBACK_PERIOD_START = '2026-11-01T00:00:00.000Z';
const FALLBACK_PERIOD_END = '2026-12-01T00:00:00.000Z';

function createFallbackSubscription(orgId: string): TenantSubscription {
  return {
    id: 'sub_default',
    orgId,
    planId: 'starter',
    planVersion: 1,
    cycle: 'monthly',
    status: 'active',
    currentPeriodStart: FALLBACK_PERIOD_START,
    currentPeriodEnd: FALLBACK_PERIOD_END,
    gracePeriodEndsAt: null,
    cancelAtPeriodEnd: false,
    createdAt: FALLBACK_PERIOD_START,
    updatedAt: FALLBACK_PERIOD_START,
  };
}

export function useSubscriptionPolicy(
  options: UseSubscriptionPolicyOptions = {}
): SubscriptionPolicyState {
  const actorRoles = useAuthorizationStore((s) => s.actor?.roles);

  const effectiveOrgId = options.orgId ?? '00000000-0000-0000-0000-000000000000';
  const effectiveUserId = options.userId ?? 'usr_current';

  const effectiveSubscription: TenantSubscription = useMemo(() => {
    if (options.subscription) {
      return options.subscription;
    }
    return createFallbackSubscription(effectiveOrgId);
  }, [options.subscription, effectiveOrgId]);

  const effectiveRoles: ActorRole[] = useMemo(() => {
    if (options.roles) {
      return options.roles;
    }
    if (actorRoles && actorRoles.length > 0) {
      return actorRoles;
    }
    return [
      {
        roleId: 'designer',
        permissions: [
          { permissionId: 'projects:read', scopeType: 'all_projects' },
          { permissionId: 'projects:write', scopeType: 'all_projects' },
        ],
      },
    ];
  }, [options.roles, actorRoles]);

  return useMemo(() => {
    const engine = new PolicyEvaluationEngine(
      defaultSubscriptionCatalog,
      effectiveSubscription,
      effectiveRoles,
      options.overrides ?? [],
      options.quotas ?? []
    );

    const result = engine.evaluatePolicySync({
      orgId: effectiveOrgId,
      userId: effectiveUserId,
      featureKey: options.featureKey,
      permissionId: options.permission,
      resource: options.resource,
      quotaMetric: options.quotaMetric,
    });

    return {
      allowed: result.allowed,
      isEntitled: result.failedStage !== 'subscription',
      isPermitted: result.failedStage !== 'rbac' && result.failedStage !== 'scope',
      isQuotaAvailable: result.failedStage !== 'quota',
      failedStage: result.failedStage,
      reason: result.reason,
      requiredUpgradeTier: result.requiredUpgradeTier,
      quotaRemaining: result.quotaRemaining,
    };
  }, [
    effectiveSubscription,
    effectiveRoles,
    options.overrides,
    options.quotas,
    effectiveOrgId,
    effectiveUserId,
    options.featureKey,
    options.permission,
    options.resource,
    options.quotaMetric,
  ]);
}
