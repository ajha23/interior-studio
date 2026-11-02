/**
 * Server API & RPC middleware for unified policy evaluation.
 * Enforces TenantValid ∧ SubscriptionEntitled ∧ RolePermissionGranted ∧ ResourceScopeValid ∧ UsageWithinLimit.
 * Conforms to Constitution Principle X (FR-004, FR-009).
 */

import { PolicyEvaluationEngine } from '@/domain/platform/saas/policyEngine';
import {
  SubscriptionCatalog,
  defaultSubscriptionCatalog,
} from '@/domain/platform/saas/subscriptionCatalog';
import type {
  CanonicalKey,
  TenantEntitlementOverride,
  TenantSubscription,
  TenantUsageQuota,
} from '@/domain/platform/saas/types';
import type { ActorContext, ResourceContext } from '@/domain/platform/authorization/types';
import { defaultHeaderActorResolver } from './authorizationMiddleware';

export interface PolicyGuardOptions {
  featureKey?: CanonicalKey;
  permission?: string;
  quotaMetric?: { key: CanonicalKey; amount: number };
  getResourceContext?: (
    req: Request
  ) => Promise<ResourceContext | undefined> | ResourceContext | undefined;
  resolveActor?: (
    req: Request
  ) => Promise<ActorContext | null> | ActorContext | null;
  resolveSubscription?: (
    req: Request,
    orgId: string
  ) => Promise<TenantSubscription | null> | TenantSubscription | null;
  resolveOverrides?: (
    req: Request,
    orgId: string
  ) => Promise<TenantEntitlementOverride[]> | TenantEntitlementOverride[];
  resolveQuotas?: (
    req: Request,
    orgId: string
  ) => Promise<TenantUsageQuota[]> | TenantUsageQuota[];
  catalog?: SubscriptionCatalog;
}

export type RequestHandler = (req: Request) => Promise<Response>;

/**
 * Higher-order middleware wrapping request handlers with unified policy evaluation.
 */
export function withPolicyGuard(options: PolicyGuardOptions) {
  return function (handler: RequestHandler): RequestHandler {
    return async function (req: Request): Promise<Response> {
      const resolveActor = options.resolveActor ?? defaultHeaderActorResolver;
      const actor = await resolveActor(req);

      if (!actor || !actor.orgId || !actor.id) {
        return new Response(
          JSON.stringify({
            error: 'UNAUTHORIZED',
            message: 'Missing authenticated user or organization context',
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }

      const catalog = options.catalog ?? defaultSubscriptionCatalog;
      const subscription = options.resolveSubscription
        ? await options.resolveSubscription(req, actor.orgId)
        : null;

      const overrides = options.resolveOverrides
        ? await options.resolveOverrides(req, actor.orgId)
        : [];

      const quotas = options.resolveQuotas
        ? await options.resolveQuotas(req, actor.orgId)
        : [];

      const resource = options.getResourceContext
        ? await options.getResourceContext(req)
        : undefined;

      const engine = new PolicyEvaluationEngine(
        catalog,
        subscription ?? undefined,
        actor.roles,
        overrides,
        quotas
      );

      const result = engine.evaluatePolicySync({
        orgId: actor.orgId,
        userId: actor.id,
        featureKey: options.featureKey,
        permissionId: options.permission,
        resource,
        quotaMetric: options.quotaMetric,
      });

      if (!result.allowed) {
        if (result.failedStage === 'quota') {
          return new Response(
            JSON.stringify({
              error: 'PAYMENT_REQUIRED',
              reason: result.reason,
              quotaRemaining: result.quotaRemaining,
              requiredUpgradeTier: result.requiredUpgradeTier,
            }),
            { status: 402, headers: { 'content-type': 'application/json' } }
          );
        }

        if (result.failedStage === 'tenant') {
          return new Response(
            JSON.stringify({
              error: 'UNAUTHORIZED',
              reason: result.reason,
            }),
            { status: 401, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            error: 'FORBIDDEN',
            reason: result.reason,
            failedStage: result.failedStage,
            requiredUpgradeTier: result.requiredUpgradeTier,
          }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }

      return handler(req);
    };
  };
}
