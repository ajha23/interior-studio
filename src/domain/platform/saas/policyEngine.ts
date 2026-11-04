/**
 * Pure domain Unified Policy Evaluation Engine.
 * Evaluates the 6-term formula:
 * AccessAllowed = TenantValid ∧ SubscriptionEntitled ∧ RolePermissionGranted ∧ ResourceScopeValid ∧ UsageWithinLimit ∧ ContextualPolicySatisfied
 * Conforms to Constitution Principle X (FR-004) and Architectural Layer Isolation.
 */

import { SubscriptionCatalog } from './subscriptionCatalog';
import type {
  CanonicalKey,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  SubscriptionPlan,
  TenantEntitlementOverride,
  TenantSubscription,
  TenantUsageQuota,
} from './types';
import type { ActorRole, ResourceScopeType } from '../authorization/types';
import { ROLE_PERMISSIONS, type Role } from '../rbac';

export interface UserRoleInput {
  roleId: string;
  scopeType?: ResourceScopeType;
  permissions?: Array<{ permissionId: string; scopeType: ResourceScopeType }>;
  status?: 'active' | 'deactivated';
}

export interface IPolicyEvaluationEngine {
  evaluatePolicy(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult>;
  evaluatePolicySync(context: PolicyEvaluationContext): PolicyEvaluationResult;
}

export class PolicyEvaluationEngine implements IPolicyEvaluationEngine {
  constructor(
    private catalog: SubscriptionCatalog,
    private subscription?: TenantSubscription,
    private roles: Array<ActorRole | UserRoleInput> = [],
    private overrides: TenantEntitlementOverride[] = [],
    private quotas: TenantUsageQuota[] = []
  ) {}

  public async evaluatePolicy(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult> {
    return this.evaluatePolicySync(context);
  }

  public evaluatePolicySync(context: PolicyEvaluationContext): PolicyEvaluationResult {
    // Stage 1: Tenant & Subscription Validity
    if (!this.subscription || this.subscription.orgId !== context.orgId) {
      return {
        allowed: false,
        failedStage: 'tenant',
        reason: 'TENANT_SUBSCRIPTION_NOT_FOUND',
      };
    }

    const inactiveStatuses = ['paused', 'expired', 'unpaid'];
    if (inactiveStatuses.includes(this.subscription.status)) {
      return {
        allowed: false,
        failedStage: 'subscription',
        reason: 'SUBSCRIPTION_INACTIVE',
      };
    }

    // Past due check with grace period
    if (this.subscription.status === 'past_due' && this.subscription.gracePeriodEndsAt) {
      if (new Date(this.subscription.gracePeriodEndsAt).getTime() < Date.now()) {
        return {
          allowed: false,
          failedStage: 'subscription',
          reason: 'SUBSCRIPTION_INACTIVE',
        };
      }
    }

    const plan = this.catalog.getPlan(this.subscription.planId, this.subscription.planVersion);
    if (!plan) {
      return {
        allowed: false,
        failedStage: 'subscription',
        reason: 'PLAN_VERSION_NOT_FOUND',
      };
    }

    // Stage 2: Feature Subscription Entitlement
    if (context.featureKey) {
      const isEntitled = this.checkFeatureEntitled(plan, context.featureKey);
      if (!isEntitled) {
        const requiredTier = this.findRequiredTierForFeature(context.featureKey);
        return {
          allowed: false,
          failedStage: 'subscription',
          reason: 'SUBSCRIPTION_UNENTITLED',
          requiredUpgradeTier: requiredTier,
        };
      }
    }

    // Stage 3: RBAC Role Permission Check
    if (context.permissionId) {
      const rbacResult = this.checkRbacPermission(context);
      if (!rbacResult.allowed) {
        return rbacResult;
      }
    }

    // Stage 4: Quantitative Quota Check
    if (context.quotaMetric) {
      const quotaResult = this.checkQuota(plan, context.quotaMetric.key, context.quotaMetric.amount);
      if (!quotaResult.allowed) {
        return quotaResult;
      }
      return {
        allowed: true,
        quotaRemaining: quotaResult.quotaRemaining,
      };
    }

    return {
      allowed: true,
    };
  }

  private checkFeatureEntitled(plan: SubscriptionPlan, key: CanonicalKey): boolean {
    const now = new Date().toISOString();
    // 1. Check for active contractual override
    const activeOverride = this.overrides
      .filter((o) => o.key === key && o.overrideType === 'feature_toggle')
      .filter((o) => !o.expiresAt || o.expiresAt > now)
      .pop();

    if (activeOverride && activeOverride.booleanValue !== undefined) {
      return activeOverride.booleanValue;
    }

    // 2. Fall back to base plan feature mapping
    return plan.features[key] === true;
  }

  private checkRbacPermission(context: PolicyEvaluationContext): PolicyEvaluationResult {
    const permission = context.permissionId!;
    const activeRoles = this.roles.filter((r) => r.status !== 'deactivated');

    if (activeRoles.length === 0) {
      return {
        allowed: false,
        failedStage: 'rbac',
        reason: 'RBAC_PERMISSION_DENIED',
      };
    }

    // Standard permission mapping / aliases
    const normalizedPerm = permission === 'projects:view' ? 'projects:read'
      : permission === 'projects:edit' ? 'projects:write'
      : permission;

    let granted = false;
    let matchingScope: ResourceScopeType = 'all_projects';

    for (const role of activeRoles) {
      let roleGrants = false;

      // Check explicit permissions if present on ActorRole
      if (role.permissions && role.permissions.length > 0) {
        const found = role.permissions.find(
          (p) => p.permissionId === permission || p.permissionId === normalizedPerm
        );
        if (found) {
          roleGrants = true;
          matchingScope = found.scopeType;
        }
      } else {
        // Fall back to system role mapping
        const sysPermissions = ROLE_PERMISSIONS[role.roleId as Role] || [];
        if (sysPermissions.includes(normalizedPerm as never) || sysPermissions.includes(permission as never)) {
          roleGrants = true;
          matchingScope = ('scopeType' in role ? (role as UserRoleInput).scopeType : undefined) ?? 'all_projects';
        }
      }

      if (roleGrants) {
        granted = true;
        // Verify resource scope
        if (matchingScope === 'assigned_projects') {
          if (context.resource?.assignedUserIds) {
            if (!context.resource.assignedUserIds.includes(context.userId)) {
              return {
                allowed: false,
                failedStage: 'scope',
                reason: 'RESOURCE_OUT_OF_SCOPE',
              };
            }
          }
        }
        break;
      }
    }

    if (!granted) {
      return {
        allowed: false,
        failedStage: 'rbac',
        reason: 'RBAC_PERMISSION_DENIED',
      };
    }

    return { allowed: true };
  }

  private checkQuota(
    plan: SubscriptionPlan,
    quotaKey: CanonicalKey,
    amount: number
  ): PolicyEvaluationResult {
    // 1. Find live quota tracking counter
    const quotaRecord = this.quotas.find((q) => q.quotaKey === quotaKey);

    let effectiveLimit = plan.quotas[quotaKey] ?? -1;
    let consumed = 0;
    let reserved = 0;

    if (quotaRecord) {
      consumed = quotaRecord.consumedCount;
      reserved = quotaRecord.reservedCount;
      if (quotaRecord.effectiveLimit !== undefined) {
        effectiveLimit = quotaRecord.effectiveLimit;
      }
    }

    // If unlimited (-1)
    if (effectiveLimit === -1) {
      return { allowed: true, quotaRemaining: -1 };
    }

    const remaining = effectiveLimit - (consumed + reserved);
    if (remaining < amount) {
      const requiredTier = this.findRequiredTierForQuota(quotaKey, consumed + reserved + amount);
      return {
        allowed: false,
        failedStage: 'quota',
        reason: 'QUOTA_EXCEEDED',
        quotaRemaining: Math.max(0, remaining),
        requiredUpgradeTier: requiredTier,
      };
    }

    return {
      allowed: true,
      quotaRemaining: remaining,
    };
  }

  private findRequiredTierForFeature(featureKey: CanonicalKey): string {
    const publicPlans = this.catalog.listPublicPlans();
    for (const plan of publicPlans) {
      if (plan.features[featureKey] === true) {
        return plan.id;
      }
    }
    return 'enterprise';
  }

  private findRequiredTierForQuota(quotaKey: CanonicalKey, needed: number): string {
    const publicPlans = this.catalog.listPublicPlans();
    for (const plan of publicPlans) {
      const limit = plan.quotas[quotaKey] ?? 0;
      if (limit === -1 || limit >= needed) {
        return plan.id;
      }
    }
    return 'enterprise';
  }
}
