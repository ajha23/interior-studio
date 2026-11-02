/**
 * Pure domain schemas and types for Multi-Tenant SaaS Subscriptions and Entitlements.
 * Conforms to Constitution Principle X (Multi-Tenant SaaS Architecture & Subscription Entitlements).
 * Zero React, Three.js, DOM, or network imports.
 */

import { z } from 'zod';

/**
 * Subscription Lifecycle States (FR-007)
 */
export const SubscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'grace_period',
  'paused',
  'cancelled_at_period_end',
  'expired',
  'unpaid',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * Billing Cadence
 */
export const BillingCycleSchema = z.enum(['monthly', 'annual']);
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

/**
 * Canonical Feature & Quota Identifier Keys (FR-002)
 * Must follow prefix convention: module.*, feature.*, quota.*, addon.*
 */
export const CanonicalKeySchema = z
  .string()
  .regex(/^(module|feature|quota|addon)\.[a-z0-9_.-]+$/);
export type CanonicalKey = z.infer<typeof CanonicalKeySchema>;

/**
 * Commercial Plan Definition Schema (FR-001)
 * Pricing strictly stored in non-negative integer paise (Constitution Principle III).
 */
export const SubscriptionPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(1).default(1),
  tagline: z.string().default(''),
  priceMonthlyPaise: z.number().int().min(0),
  priceAnnualPaise: z.number().int().min(0),
  isPublic: z.boolean().default(true),
  features: z.record(CanonicalKeySchema, z.boolean()),
  quotas: z.record(CanonicalKeySchema, z.number().int()), // -1 indicates unlimited
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

/**
 * Tenant Active Subscription Record (FR-007)
 */
export const TenantSubscriptionSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  planId: z.string().min(1),
  planVersion: z.number().int().min(1),
  cycle: BillingCycleSchema.default('monthly'),
  status: SubscriptionStatusSchema.default('trial'),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
  gracePeriodEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean().default(false),
  gatewayCustomerId: z.string().optional(),
  gatewaySubscriptionId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TenantSubscription = z.infer<typeof TenantSubscriptionSchema>;

/**
 * Tenant Contractual Entitlement Override & Add-on (FR-003, US4)
 */
export const TenantEntitlementOverrideSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  key: CanonicalKeySchema,
  overrideType: z.enum(['feature_toggle', 'quota_delta', 'quota_absolute']),
  booleanValue: z.boolean().optional(),
  numericDelta: z.number().int().optional(),
  numericAbsolute: z.number().int().optional(),
  reason: z.string().min(1),
  appliedBy: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type TenantEntitlementOverride = z.infer<typeof TenantEntitlementOverrideSchema>;

/**
 * Tenant Consumption Quota Counter (FR-006, US3)
 */
export const TenantUsageQuotaSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  quotaKey: CanonicalKeySchema,
  periodAnchor: z.string(), // ISO date 'YYYY-MM-DD' aligning with billing cycle
  consumedCount: z.number().int().min(0).default(0),
  reservedCount: z.number().int().min(0).default(0),
  effectiveLimit: z.number().int(), // -1 = unlimited
  updatedAt: z.string().datetime(),
});
export type TenantUsageQuota = z.infer<typeof TenantUsageQuotaSchema>;

/**
 * Policy Evaluation Request Context (FR-004)
 */
export const PolicyEvaluationContextSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().min(1),
  featureKey: CanonicalKeySchema.optional(),
  permissionId: z.string().optional(),
  resource: z
    .object({
      projectId: z.string().optional(),
      assignedUserIds: z.array(z.string()).optional(),
      teamId: z.string().optional(),
      clientId: z.string().optional(),
    })
    .optional(),
  quotaMetric: z
    .object({
      key: CanonicalKeySchema,
      amount: z.number().int().min(1).default(1),
    })
    .optional(),
});
export type PolicyEvaluationContext = z.infer<typeof PolicyEvaluationContextSchema>;

/**
 * Policy Evaluation Result Diagnostics (FR-004)
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  failedStage?: 'tenant' | 'subscription' | 'rbac' | 'scope' | 'quota';
  reason?: string;
  requiredUpgradeTier?: string;
  effectiveScope?: string;
  quotaRemaining?: number;
}

/**
 * Effective Computed Entitlements snapshot for an organization
 */
export interface EffectiveEntitlements {
  orgId: string;
  planId: string;
  planVersion: number;
  features: Record<string, boolean>;
  quotas: Record<string, number>; // -1 indicates unlimited
  activeOverrides: TenantEntitlementOverride[];
}

/**
 * Inviolable platform architectural safety ceilings.
 * Contractual overrides cannot exceed these physical bounds.
 */
export const PLATFORM_SAFETY_CEILINGS: Record<string, number> = {
  'quota.projects.active.max': 10000,
  'quota.seats.designers.max': 500,
  'quota.renderings.monthly.max': 50000,
  'quota.ai_operations.monthly.max': 100000,
};
