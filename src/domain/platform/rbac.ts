/**
 * Pure domain logic for Data-Driven Role-Based Access Control (RBAC).
 * Enforces zero-trust permissions, role hierarchies, and privilege escalation guards.
 */

export type Role = 'owner' | 'admin' | 'designer' | 'production' | 'viewer';

export type PermissionKey =
  | 'org:manage'
  | 'members:manage'
  | 'projects:read'
  | 'projects:write'
  | 'projects:delete'
  | 'quotes:view_costs'
  | 'quotes:edit_margins'
  | 'quotes:send'
  | 'production:download_cutlist'
  | 'clients:view_pii'
  | 'clients:manage';

export interface OrgMember {
  userId: string;
  orgId: string;
  role: Role;
}

/**
 * Numeric role ranking. Higher number indicates higher privilege.
 */
export const ROLE_RANK: Record<Role, number> = {
  owner: 100,
  admin: 80,
  designer: 60,
  production: 40,
  viewer: 20,
};

/**
 * Static mapping of base permissions granted to each role.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  owner: [
    'org:manage',
    'members:manage',
    'projects:read',
    'projects:write',
    'projects:delete',
    'quotes:view_costs',
    'quotes:edit_margins',
    'quotes:send',
    'production:download_cutlist',
    'clients:view_pii',
    'clients:manage',
  ],
  admin: [
    'members:manage',
    'projects:read',
    'projects:write',
    'projects:delete',
    'quotes:view_costs',
    'quotes:edit_margins',
    'quotes:send',
    'production:download_cutlist',
    'clients:view_pii',
    'clients:manage',
  ],
  designer: [
    'projects:read',
    'projects:write',
    'quotes:send',
    'clients:view_pii',
    'clients:manage',
  ],
  production: [
    'projects:read',
    'production:download_cutlist',
  ],
  viewer: [
    'projects:read',
  ],
};

/**
 * Checks if a member has a specific permission.
 */
export function hasPermission(
  member: OrgMember | null | undefined,
  permission: PermissionKey,
  customOverrides?: Record<PermissionKey, boolean>
): boolean {
  if (!member) return false;
  if (customOverrides && typeof customOverrides[permission] === 'boolean') {
    return customOverrides[permission];
  }
  const perms = ROLE_PERMISSIONS[member.role] || [];
  return perms.includes(permission);
}

/**
 * Enforces role hierarchy: actor cannot assign a role with a rank
 * higher than or equal to their own, unless the actor is an owner.
 */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'owner') return true;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

/**
 * Enforces actor cannot edit or remove a member whose rank is
 * greater than or equal to their own, unless the actor is an owner.
 */
export function canModifyMember(actorRole: Role, targetMemberRole: Role): boolean {
  if (actorRole === 'owner') return true;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetMemberRole];
}

