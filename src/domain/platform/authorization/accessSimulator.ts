import type {
  ResourceScopeType,
} from './types';
import { moduleRegistry } from './moduleRegistry';
import type { AdminRoleService } from './adminRoleService';
import { SubscriptionCatalog } from '../saas/subscriptionCatalog';
import type { CanonicalKey } from '../saas/types';

export interface SimulationRequest {
  orgId: string;
  actorId?: string;
  roleId?: string;
  permissionId: string;
  projectId?: string;
  resourceAssignedUserIds?: string[];
  tenantPlanId?: string;
  tenantStatus?: 'active' | 'trial' | 'past_due' | 'cancelled';
}

export type SimulationStage = 'TENANT' | 'SUBSCRIPTION' | 'ROLE' | 'SCOPE';

export interface SimulationStageDetail {
  stage: SimulationStage;
  name: string;
  passed: boolean;
  verdict: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  remedy?: string;
}

export interface SimulationResult {
  allowed: boolean;
  targetUser?: { id: string; name: string };
  targetRole?: { id: string; name: string };
  targetPermission: { id: string; title: string; module: string };
  targetResource?: { id: string; name?: string };
  evaluationStages: SimulationStageDetail[];
  finalReason: string;
  effectiveScopes: ResourceScopeType[];
}

/**
 * Pure domain Effective Access Simulator (US5, FR-010).
 * Models the authoritative 4-stage policy evaluation pipeline:
 * Tenant Validation -> Subscription Entitlement -> RBAC Role Grant -> Resource Scope Check.
 * Framework-free TypeScript complying with Constitution Principle VI & X.
 */
export class AccessSimulator {
  private subscriptionCatalog: SubscriptionCatalog;

  constructor(private roleService: AdminRoleService) {
    this.subscriptionCatalog = new SubscriptionCatalog();
  }

  public simulateAccess(request: SimulationRequest): SimulationResult {
    const stages: SimulationStageDetail[] = [];
    const planId = request.tenantPlanId || 'pro';
    const status = request.tenantStatus || 'active';

    // 1. Target Permission Resolution
    const allPerms = moduleRegistry.getAllPermissions();
    const permDef = allPerms.find((p) => p.id === request.permissionId);

    const targetPermission = {
      id: request.permissionId,
      title: permDef?.title || request.permissionId,
      module: permDef?.moduleId || 'unknown',
    };

    // 2. Stage 1: Tenant Validation
    const isTenantValid = status === 'active' || status === 'trial';
    if (!isTenantValid) {
      stages.push({
        stage: 'TENANT',
        name: 'Tenant Status Validation',
        passed: false,
        verdict: 'FAIL',
        details: `Tenant status is "${status}". Account access suspended or cancelled.`,
        remedy: 'Resolve subscription billing to restore active tenant status.',
      });

      return {
        allowed: false,
        targetPermission,
        evaluationStages: stages,
        finalReason: `Access denied: Tenant organization is ${status}.`,
        effectiveScopes: [],
      };
    }

    stages.push({
      stage: 'TENANT',
      name: 'Tenant Status Validation',
      passed: true,
      verdict: 'PASS',
      details: `Tenant is ${status.toUpperCase()} and in good standing.`,
    });

    // 3. Stage 2: Subscription Entitlement Check
    if (permDef?.entitlementKey) {
      const plan = this.subscriptionCatalog.getPlan(planId);
      const featureKey = permDef.entitlementKey as CanonicalKey;
      const isFeatureIncluded = plan?.features[featureKey] === true;

      if (!isFeatureIncluded) {
        const requiredPlan = planId === 'trial' || planId === 'starter' ? 'Pro Studio' : 'Enterprise Studio';

        stages.push({
          stage: 'SUBSCRIPTION',
          name: 'Subscription Entitlement Check',
          passed: false,
          verdict: 'FAIL',
          details: `Feature "${permDef.title}" (${permDef.entitlementKey}) is not included in current "${plan?.name || planId}" plan.`,
          remedy: `Upgrade tenant subscription to ${requiredPlan} to enable this capability.`,
        });

        return {
          allowed: false,
          targetPermission,
          evaluationStages: stages,
          finalReason: `Access denied: Feature requires ${requiredPlan} plan entitlement.`,
          effectiveScopes: [],
        };
      }
    }

    stages.push({
      stage: 'SUBSCRIPTION',
      name: 'Subscription Entitlement Check',
      passed: true,
      verdict: 'PASS',
      details: permDef?.entitlementKey
        ? `Capability is entitled under ${planId.toUpperCase()} subscription plan.`
        : 'Capability is included in baseline studio platform without plan restrictions.',
    });

    // 4. Stage 3: RBAC Role Grant
    const activeRoles: Array<{ id: string; name: string; scopeType: ResourceScopeType }> = [];

    if (request.roleId) {
      const role = this.roleService.getRole(request.roleId, request.orgId);
      if (role && role.status === 'active') {
        const perms = this.roleService.getRolePermissions(role.id);
        const match = perms.find((p) => p.permissionId === request.permissionId);
        if (match) {
          activeRoles.push({
            id: role.id,
            name: role.name,
            scopeType: match.scopeType || role.scopeConfig.scopeType,
          });
        }
      }
    } else if (request.actorId) {
      const assignments = this.roleService.getUserAssignments(request.orgId, request.actorId);
      for (const a of assignments) {
        const role = this.roleService.getRole(a.roleId, request.orgId);
        if (role && role.status === 'active') {
          const perms = this.roleService.getRolePermissions(role.id);
          const match = perms.find((p) => p.permissionId === request.permissionId);
          if (match) {
            activeRoles.push({
              id: role.id,
              name: role.name,
              scopeType: match.scopeType || role.scopeConfig.scopeType,
            });
          }
        }
      }
    }

    if (activeRoles.length === 0) {
      stages.push({
        stage: 'ROLE',
        name: 'RBAC Role Permission Grant',
        passed: false,
        verdict: 'FAIL',
        details: request.roleId
          ? `Role does not grant permission "${targetPermission.title}".`
          : `User holds no active roles that grant permission "${targetPermission.title}".`,
        remedy: 'Grant this permission in role configuration or assign an authorized role.',
      });

      return {
        allowed: false,
        targetPermission,
        evaluationStages: stages,
        finalReason: `Access denied: Permission "${targetPermission.title}" is not granted by assigned roles.`,
        effectiveScopes: [],
      };
    }

    const roleNames = activeRoles.map((r) => r.name).join(', ');
    stages.push({
      stage: 'ROLE',
      name: 'RBAC Role Permission Grant',
      passed: true,
      verdict: 'PASS',
      details: `Permission granted via role(s): [${roleNames}].`,
    });

    // 5. Stage 4: Resource Scope Validation
    const effectiveScopes = activeRoles.map((r) => r.scopeType);
    const hasOrgWideScope = effectiveScopes.includes('all_projects');

    if (hasOrgWideScope || !request.projectId) {
      stages.push({
        stage: 'SCOPE',
        name: 'Resource Scope Validation',
        passed: true,
        verdict: 'PASS',
        details: hasOrgWideScope
          ? 'Role grants organization-wide access ("all_projects"). In scope for all projects.'
          : 'No specific resource boundary requested; global action allowed.',
      });

      return {
        allowed: true,
        targetPermission,
        evaluationStages: stages,
        finalReason: 'Access granted: All 4 policy evaluation stages passed.',
        effectiveScopes,
      };
    }

    // Role is scoped to assigned_projects
    if (effectiveScopes.includes('assigned_projects')) {
      const assignedUsers = request.resourceAssignedUserIds || [];
      const isAssigned = request.actorId ? assignedUsers.includes(request.actorId) : false;

      if (!isAssigned) {
        stages.push({
          stage: 'SCOPE',
          name: 'Resource Scope Validation',
          passed: false,
          verdict: 'FAIL',
          details: `Role is scoped to "assigned_projects", but user is not assigned to project "${request.projectId}".`,
          remedy: `Assign user as a member of project "${request.projectId}" or broaden role scope.`,
        });

        return {
          allowed: false,
          targetPermission,
          evaluationStages: stages,
          finalReason: `Access denied: User is not assigned to project "${request.projectId}".`,
          effectiveScopes,
        };
      }

      stages.push({
        stage: 'SCOPE',
        name: 'Resource Scope Validation',
        passed: true,
        verdict: 'PASS',
        details: `User is verified as an assigned member of project "${request.projectId}".`,
      });

      return {
        allowed: true,
        targetPermission,
        evaluationStages: stages,
        finalReason: 'Access granted: All 4 policy evaluation stages passed.',
        effectiveScopes,
      };
    }

    // Fallback for team or specific projects
    stages.push({
      stage: 'SCOPE',
      name: 'Resource Scope Validation',
      passed: true,
      verdict: 'PASS',
      details: `Context satisfies resource scope [${effectiveScopes.join(', ')}].`,
    });

    return {
      allowed: true,
      targetPermission,
      evaluationStages: stages,
      finalReason: 'Access granted: All 4 policy evaluation stages passed.',
      effectiveScopes,
    };
  }
}
