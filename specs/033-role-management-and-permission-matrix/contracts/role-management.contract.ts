/**
 * Role Management Service Contract
 * specs/033-role-management-and-permission-matrix/contracts/role-management.contract.ts
 */

import type {
  CustomRole,
  RolePermissionMapping,
  ResourceScopeType,
  UserRoleAssignment,
  RoleTemplate,
  RoleAuditEvent,
} from '../data-model';

export interface CreateRoleRequest {
  orgId: string;
  name: string;
  description: string;
  rank?: number;
  templateId?: string;
  scopeType: ResourceScopeType;
  specificProjectIds?: string[];
  permissionIds: string[];
  actorId: string;
}

export interface UpdateRoleRequest {
  orgId: string;
  roleId: string;
  name: string;
  description: string;
  scopeType: ResourceScopeType;
  specificProjectIds?: string[];
  permissionIds: string[];
  actorId: string;
}

export interface CloneRoleRequest {
  orgId: string;
  sourceRoleId: string;
  newRoleName: string;
  newDescription?: string;
  actorId: string;
}

export interface ChangeImpactAnalysis {
  roleId: string;
  affectedUserCount: number;
  affectedUserNames: string[];
  addedPermissions: Array<{ id: string; title: string; module: string }>;
  removedPermissions: Array<{ id: string; title: string; module: string }>;
  isScopeChanged: boolean;
  previousScope?: ResourceScopeType;
  newScope?: ResourceScopeType;
  highRiskPermissionsAdded: string[];
}

export interface IRoleManagementService {
  /** List all roles (system + custom) for a tenant */
  getRoles(orgId: string): Promise<CustomRole[]>;

  /** Get single role by ID with granted permissions and assigned member count */
  getRoleDetails(orgId: string, roleId: string): Promise<{
    role: CustomRole;
    permissions: RolePermissionMapping[];
    assignedMembers: UserRoleAssignment[];
  }>;

  /** Predefined role templates */
  getRoleTemplates(): RoleTemplate[];

  /** Calculate impact of role changes before committing */
  calculateChangeImpact(
    orgId: string,
    roleId: string,
    newPermissionIds: string[],
    newScopeType: ResourceScopeType
  ): Promise<ChangeImpactAnalysis>;

  /** Create custom role */
  createRole(request: CreateRoleRequest): Promise<CustomRole>;

  /** Update existing custom role permissions and scope */
  updateRole(request: UpdateRoleRequest): Promise<CustomRole>;

  /** Clone system or custom role into new custom role */
  cloneRole(request: CloneRoleRequest): Promise<CustomRole>;

  /** Deactivate role */
  deactivateRole(orgId: string, roleId: string, actorId: string): Promise<void>;

  /** Reactivate role */
  reactivateRole(orgId: string, roleId: string, actorId: string): Promise<void>;

  /** Assign role to user */
  assignRole(orgId: string, userId: string, roleId: string, actorId: string): Promise<UserRoleAssignment>;

  /** Unassign role from user (enforcing last-owner safeguard) */
  unassignRole(orgId: string, userId: string, roleId: string, actorId: string): Promise<void>;

  /** Get audit trail for roles */
  getAuditLog(orgId: string, roleId?: string): Promise<RoleAuditEvent[]>;
}
