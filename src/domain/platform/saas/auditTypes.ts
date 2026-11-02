/**
 * Pure domain audit action types and event factories for SaaS commercial operations.
 * Conforms to Constitution Principle VII (Audit Logging) and Principle X (SaaS Subscriptions).
 */

import { type AuditRecord, createAuditEvent } from '../audit';
import type { SubscriptionStatus } from './types';

export type SaaSCommercialAuditEventAction =
  | 'subscriptions.plan_changed'
  | 'subscriptions.status_changed'
  | 'subscriptions.override_applied'
  | 'quotas.reservation_adjusted'
  | 'quotas.rolled_over';

export interface PlanChangedMetadata {
  fromPlanId: string;
  toPlanId: string;
  fromVersion: number;
  toVersion: number;
  billingCycle: 'monthly' | 'annual';
  priceMonthlyPaise: number;
}

export interface StatusChangedMetadata {
  fromStatus: SubscriptionStatus;
  toStatus: SubscriptionStatus;
  reason?: string;
  gracePeriodEndsAt?: string | null;
}

export interface OverrideAppliedMetadata {
  key: string;
  overrideType: 'feature_toggle' | 'quota_delta' | 'quota_absolute';
  booleanValue?: boolean;
  numericDelta?: number;
  numericAbsolute?: number;
  reason: string;
  expiresAt?: string | null;
}

export interface QuotaAdjustedMetadata {
  quotaKey: string;
  operation: 'reserve' | 'commit' | 'release' | 'reset';
  amount: number;
  consumedBefore: number;
  consumedAfter: number;
  effectiveLimit: number;
}

export function createSaaSAuditEvent(params: {
  orgId: string;
  actorId: string;
  action: SaaSCommercialAuditEventAction;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AuditRecord {
  return createAuditEvent({
    orgId: params.orgId,
    actorId: params.actorId,
    eventFamily: 'commercial',
    eventAction: params.action,
    resourceType: 'saas_subscription',
    resourceId: params.resourceId,
    metadata: params.metadata,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}
