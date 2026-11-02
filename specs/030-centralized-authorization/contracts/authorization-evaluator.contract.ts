/**
 * Contract: Dynamic Authorization Evaluator & Client Hook
 * Layer: Pure domain / framework-free TypeScript + React Hook contract
 */

import {
  AuthorizationEvaluationResult,
  ResourceContext,
  ResourceScopeType,
} from '../data-model';

export interface ActorContext {
  id: string; // User ID
  orgId: string; // Tenant Organization ID
  roles: Array<{
    roleId: string;
    rank: number;
    permissions: Array<{
      permissionId: string;
      scopeType: ResourceScopeType;
    }>;
  }>;
  teamId?: string;
  clientId?: string;
}

export interface IAuthorizationEvaluator {
  /**
   * Pure evaluation function: determines if an actor is authorized to perform an action.
   * Evaluates multiple assigned roles using the Additive Union strategy.
   * Deny-by-default: returns false unless an active role explicitly grants the permission with a matching scope.
   */
  can(
    actor: ActorContext,
    permissionId: string,
    resource?: ResourceContext
  ): AuthorizationEvaluationResult;
}

/**
 * Frontend React Hook Contract
 */
export interface UseAuthorizeResult {
  allowed: boolean;
  loading: boolean;
  reason?: string;
  scope?: ResourceScopeType;
}

export type UseAuthorizeHook = (
  permissionId: string,
  resourceContext?: ResourceContext
) => UseAuthorizeResult;
