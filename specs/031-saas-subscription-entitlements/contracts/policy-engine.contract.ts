/**
 * Contract: Unified SaaS Policy Evaluation Engine
 * Layer: Pure domain / framework-free TypeScript
 */

import type {
  PolicyEvaluationContext,
  PolicyEvaluationResult,
} from '../data-model';

export interface IPolicyEvaluationEngine {
  /**
   * Pure evaluation function: assesses whether an operation is permitted under
   * Tenant validity, Subscription entitlements, RBAC permissions, and Quota bounds.
   * Deny-by-default on any missing or unsatisfied condition.
   */
  evaluatePolicy(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult>;

  /**
   * Synchronous pure in-memory evaluation against pre-loaded tenant subscription
   * and actor RBAC context (used by client hooks and UI controls).
   */
  evaluatePolicySync(context: PolicyEvaluationContext): PolicyEvaluationResult;
}
