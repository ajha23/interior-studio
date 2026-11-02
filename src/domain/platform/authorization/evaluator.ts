import type {
  ActorContext,
  AuthorizationEvaluationResult,
  ResourceContext,
  ResourceScopeType,
} from './types';

export interface IAuthorizationEvaluator {
  can(
    actor: ActorContext,
    permissionId: string,
    resource?: ResourceContext
  ): AuthorizationEvaluationResult;
}

/**
 * Pure evaluation function: determines if an actor is authorized to perform an action.
 * Evaluates multiple assigned roles using the Additive Union strategy.
 * Deny-by-default: returns false unless an active role explicitly grants the permission with a matching scope.
 */
export function evaluateAuthorization(
  actor: ActorContext,
  permissionId: string,
  resource?: ResourceContext
): AuthorizationEvaluationResult {
  // 1. Filter out deactivated roles
  const activeRoles = actor.roles.filter((r) => r.status !== 'deactivated');
  const evaluatedRoleIds = activeRoles.map((r) => r.roleId);

  if (activeRoles.length === 0) {
    return {
      allowed: false,
      reason: 'No active roles assigned to actor in this organization',
      evaluatedRoles: [],
      missingPermissions: [permissionId],
    };
  }

  // 2. Filter for roles that grant the requested permissionId
  const matchingRoles = activeRoles.filter((role) =>
    role.permissions.some((p) => p.permissionId === permissionId)
  );

  if (matchingRoles.length === 0) {
    return {
      allowed: false,
      reason: `Permission '${permissionId}' not granted by any active role`,
      evaluatedRoles: evaluatedRoleIds,
      missingPermissions: [permissionId],
    };
  }

  // 3. Aggregate granted scopes across matching roles (Additive Union)
  const grantedScopes = new Set<ResourceScopeType>();
  for (const role of matchingRoles) {
    for (const perm of role.permissions) {
      if (perm.permissionId === permissionId) {
        grantedScopes.add(perm.scopeType);
      }
    }
  }

  const matchingRoleIds = matchingRoles.map((r) => r.roleId);

  // Highest scope: all_projects
  if (grantedScopes.has('all_projects')) {
    return {
      allowed: true,
      applicableScope: 'all_projects',
      evaluatedRoles: matchingRoleIds,
    };
  }

  // If no resource context is provided, allow with the first granted scoped permission
  if (!resource) {
    const firstScope = Array.from(grantedScopes)[0];
    return {
      allowed: true,
      applicableScope: firstScope,
      evaluatedRoles: matchingRoleIds,
    };
  }

  // 4. Resource context checks
  if (
    grantedScopes.has('assigned_projects') &&
    resource.assignedUserIds?.includes(actor.id)
  ) {
    return {
      allowed: true,
      applicableScope: 'assigned_projects',
      evaluatedRoles: matchingRoleIds,
    };
  }

  if (
    grantedScopes.has('team_projects') &&
    actor.teamId &&
    resource.teamId &&
    actor.teamId === resource.teamId
  ) {
    return {
      allowed: true,
      applicableScope: 'team_projects',
      evaluatedRoles: matchingRoleIds,
    };
  }

  if (
    grantedScopes.has('client_projects') &&
    actor.clientId &&
    resource.clientId &&
    actor.clientId === resource.clientId
  ) {
    return {
      allowed: true,
      applicableScope: 'client_projects',
      evaluatedRoles: matchingRoleIds,
    };
  }

  return {
    allowed: false,
    reason: 'Insufficient resource scope: actor does not have access to this resource',
    evaluatedRoles: matchingRoleIds,
  };
}

/**
 * Standard implementation of IAuthorizationEvaluator.
 */
export class AuthorizationEvaluator implements IAuthorizationEvaluator {
  can(
    actor: ActorContext,
    permissionId: string,
    resource?: ResourceContext
  ): AuthorizationEvaluationResult {
    return evaluateAuthorization(actor, permissionId, resource);
  }
}
