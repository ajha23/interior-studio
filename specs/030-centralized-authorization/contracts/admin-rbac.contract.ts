/**
 * Contract: Administrative Role & Permission Management API
 * Layer: Platform / Storage / Admin Interface
 */

import {
  CustomRole,
  RolePermissionMapping,
  ResourceScopeType,
} from '../data-model';

export interface CreateRoleInput {
  orgId: string;
  name: string;
  description: string;
  rank: number;
  initialPermissions?: Array<{
    permissionId: string;
    scopeType?: ResourceScopeType;
  }>;
}

export interface CloneRoleInput {
  orgId: string;
  sourceRoleId: string;
  newRoleName: string;
  newDescription: string;
}

export interface UpdateRolePermissionsInput {
  orgId: string;
  roleId: string;
  permissions: Array<{
    permissionId: string;
    scopeType: ResourceScopeType;
  }>;
}

export interface IAdminRoleService {
  /**
   * Retrieves all roles available in the organization (system templates + custom tenant roles).
   */
  listRoles(orgId: string): Promise<CustomRole[]>;

  /**
   * Retrieves permissions and configured scopes for a specific role.
   */
  getRolePermissions(orgId: string, roleId: string): Promise<RolePermissionMapping[]>;

  /**
   * Creates a new custom tenant role. System roles cannot be created via this endpoint.
   */
  createRole(actorId: string, input: CreateRoleInput): Promise<CustomRole>;

  /**
   * Clones an existing system or custom role with its permission set as a starting point.
   */
  cloneRole(actorId: string, input: CloneRoleInput): Promise<CustomRole>;

  /**
   * Updates permission assignments and scopes for a custom role.
   * System roles are immutable and will reject modification.
   */
  updateRolePermissions(actorId: string, input: UpdateRolePermissionsInput): Promise<void>;

  /**
   * Deactivates a custom role. Prevents new assignments while maintaining existing project links.
   */
  deactivateRole(actorId: string, orgId: string, roleId: string): Promise<void>;

  /**
   * Deletes a custom role, safely reassigning affected users to a fallback role.
   * Enforces safety guards against deleting the last owner or system roles.
   */
  deleteRole(
    actorId: string,
    orgId: string,
    roleId: string,
    fallbackRoleId: string
  ): Promise<void>;

  /**
   * Assigns a role to an organization member.
   */
  assignRoleToMember(
    actorId: string,
    orgId: string,
    userId: string,
    roleId: string
  ): Promise<void>;
}
