import type {
  CustomRole,
  RolePermissionMapping,
  ResourceScopeType,
  UserRoleAssignment,
} from './types';
import { type AuditRecord, createAuditEvent } from '../audit';

export interface CreateRoleInput {
  orgId: string;
  name: string;
  description?: string;
  rank: number;
  actorId?: string;
  initialPermissions?: Array<{
    permissionId: string;
    scopeType?: ResourceScopeType;
  }>;
}

export interface CloneRoleInput {
  orgId: string;
  sourceRoleId: string;
  newRoleName: string;
  newDescription?: string;
  actorId?: string;
}

export interface UpdateRolePermissionsInput {
  orgId: string;
  roleId: string;
  actorId?: string;
  permissions: Array<{
    permissionId: string;
    scopeType: ResourceScopeType;
  }>;
}

export interface AssignRoleInput {
  orgId: string;
  userId: string;
  roleId: string;
  assignedBy?: string;
}

export type AuditEventCallback = (record: AuditRecord) => void;

/**
 * Pure domain service for Custom Role Lifecycle, Governance, and Auditability (FR-003, FR-004, US2, US5).
 * Framework-free TypeScript complying with Constitution Principle VI.
 */
export class AdminRoleService {
  private roles = new Map<string, CustomRole>();
  private rolePermissions = new Map<string, Map<string, RolePermissionMapping>>();
  private userAssignments = new Map<string, UserRoleAssignment>();
  private auditLogs: AuditRecord[] = [];
  private auditCallback?: AuditEventCallback;

  constructor(auditCallback?: AuditEventCallback) {
    this.auditCallback = auditCallback;
    this.seedSystemRoles();
  }

  private seedSystemRoles(): void {
    const now = new Date().toISOString();
    const systemRoles: Array<{ id: string; name: string; rank: number; perms: string[] }> = [
      {
        id: 'owner',
        name: 'Owner',
        rank: 100,
        perms: [
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
      },
      {
        id: 'admin',
        name: 'Admin',
        rank: 80,
        perms: [
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
      },
      {
        id: 'designer',
        name: 'Designer',
        rank: 60,
        perms: ['projects:read', 'projects:write', 'quotes:send', 'clients:view_pii'],
      },
      {
        id: 'production',
        name: 'Production',
        rank: 40,
        perms: ['projects:read', 'production:download_cutlist'],
      },
      {
        id: 'viewer',
        name: 'Viewer',
        rank: 20,
        perms: ['projects:read'],
      },
    ];

    for (const sys of systemRoles) {
      this.roles.set(sys.id, {
        id: sys.id,
        orgId: null,
        name: sys.name,
        description: `Built-in immutable ${sys.name} role template`,
        rank: sys.rank,
        isSystemRole: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const pMap = new Map<string, RolePermissionMapping>();
      for (const p of sys.perms) {
        pMap.set(p, {
          roleId: sys.id,
          permissionId: p,
          scopeType: 'all_projects',
        });
      }
      this.rolePermissions.set(sys.id, pMap);
    }
  }

  private emitAudit(
    orgId: string,
    actorId: string,
    eventAction: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>
  ): AuditRecord {
    const record = createAuditEvent({
      orgId,
      actorId: actorId || 'admin',
      eventFamily: 'members',
      eventAction,
      resourceType,
      resourceId,
      metadata,
    });
    this.auditLogs.push(record);
    this.auditCallback?.(record);
    return record;
  }

  public getAuditLogs(): AuditRecord[] {
    return [...this.auditLogs];
  }

  public listRoles(orgId: string): CustomRole[] {
    const result: CustomRole[] = [];
    for (const role of this.roles.values()) {
      if (role.orgId === null || role.orgId === orgId) {
        result.push(role);
      }
    }
    return result.sort((a, b) => b.rank - a.rank);
  }

  public getRole(roleId: string, orgId?: string): CustomRole | undefined {
    const role = this.roles.get(roleId);
    if (!role) return undefined;
    if (role.orgId !== null && orgId && role.orgId !== orgId) {
      return undefined; // Tenant isolation
    }
    return role;
  }

  public getRolePermissions(roleId: string): RolePermissionMapping[] {
    const pMap = this.rolePermissions.get(roleId);
    if (!pMap) return [];
    return Array.from(pMap.values());
  }

  public createRole(actorRank: number, input: CreateRoleInput): CustomRole {
    if (!input.name.trim()) {
      throw new Error('Role name cannot be empty.');
    }
    if (input.rank >= actorRank && actorRank < 100) {
      throw new Error(
        'Privilege escalation denied: Cannot create a role with rank equal to or greater than your own.'
      );
    }

    const roleId = `role_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const newRole: CustomRole = {
      id: roleId,
      orgId: input.orgId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      rank: Math.max(1, Math.min(99, input.rank)), // Custom roles capped at 99
      isSystemRole: false,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    this.roles.set(roleId, newRole);

    const pMap = new Map<string, RolePermissionMapping>();
    if (input.initialPermissions) {
      for (const p of input.initialPermissions) {
        pMap.set(p.permissionId, {
          roleId,
          permissionId: p.permissionId,
          scopeType: p.scopeType || 'all_projects',
        });
      }
    }
    this.rolePermissions.set(roleId, pMap);

    this.emitAudit(
      input.orgId,
      input.actorId || 'admin',
      'roles.created',
      'role',
      roleId,
      { name: newRole.name, rank: newRole.rank, orgId: input.orgId }
    );

    return newRole;
  }

  public cloneRole(actorRank: number, input: CloneRoleInput): CustomRole {
    const sourceRole = this.roles.get(input.sourceRoleId);
    if (!sourceRole) {
      throw new Error(`Source role "${input.sourceRoleId}" not found.`);
    }

    const sourcePerms = this.getRolePermissions(input.sourceRoleId);

    return this.createRole(actorRank, {
      orgId: input.orgId,
      actorId: input.actorId,
      name: input.newRoleName,
      description: input.newDescription || `Cloned from ${sourceRole.name}`,
      rank: Math.min(sourceRole.rank, actorRank - 1 > 0 ? actorRank - 1 : actorRank),
      initialPermissions: sourcePerms.map((p) => ({
        permissionId: p.permissionId,
        scopeType: p.scopeType,
      })),
    });
  }

  public updateRolePermissions(
    actorRank: number,
    input: UpdateRolePermissionsInput
  ): void {
    const role = this.roles.get(input.roleId);
    if (!role) {
      throw new Error(`Role "${input.roleId}" not found.`);
    }
    if (role.isSystemRole) {
      throw new Error(
        `Default system role "${role.name}" is an immutable template and cannot be modified. Clone this role to customize.`
      );
    }
    if (role.orgId !== input.orgId) {
      throw new Error('Tenant isolation violation.');
    }
    if (role.rank >= actorRank && actorRank < 100) {
      throw new Error('Privilege escalation denied: Cannot edit a role of equal or greater rank.');
    }

    const pMap = new Map<string, RolePermissionMapping>();
    for (const p of input.permissions) {
      pMap.set(p.permissionId, {
        roleId: input.roleId,
        permissionId: p.permissionId,
        scopeType: p.scopeType,
      });
    }
    this.rolePermissions.set(input.roleId, pMap);
    role.updatedAt = new Date().toISOString();

    this.emitAudit(
      input.orgId,
      input.actorId || 'admin',
      'roles.updated',
      'role',
      input.roleId,
      {
        permissionsCount: input.permissions.length,
        orgId: input.orgId,
      }
    );
  }

  public deactivateRole(
    actorRank: number,
    orgId: string,
    roleId: string,
    actorId = 'admin'
  ): void {
    const role = this.roles.get(roleId);
    if (!role) throw new Error(`Role "${roleId}" not found.`);
    if (role.isSystemRole) {
      throw new Error('Default system roles cannot be deactivated.');
    }
    if (role.orgId !== orgId) throw new Error('Tenant isolation violation.');
    if (role.rank >= actorRank && actorRank < 100) {
      throw new Error('Privilege escalation denied: Cannot deactivate a role of equal or greater rank.');
    }

    role.status = 'deactivated';
    role.updatedAt = new Date().toISOString();

    this.emitAudit(orgId, actorId, 'roles.deactivated', 'role', roleId, { orgId });
  }

  public deleteRole(
    actorRank: number,
    orgId: string,
    roleId: string,
    actorId = 'admin'
  ): void {
    const role = this.roles.get(roleId);
    if (!role) throw new Error(`Role "${roleId}" not found.`);
    if (role.isSystemRole) {
      throw new Error('Default system roles cannot be deleted.');
    }
    if (role.orgId !== orgId) throw new Error('Tenant isolation violation.');
    if (role.rank >= actorRank && actorRank < 100) {
      throw new Error('Privilege escalation denied.');
    }

    this.roles.delete(roleId);
    this.rolePermissions.delete(roleId);

    this.emitAudit(orgId, actorId, 'roles.deleted', 'role', roleId, { orgId });
  }

  public assignUserRole(
    actorRank: number,
    input: AssignRoleInput
  ): UserRoleAssignment {
    const role = this.roles.get(input.roleId);
    if (!role) {
      throw new Error(`Role "${input.roleId}" not found.`);
    }
    if (role.status === 'deactivated') {
      throw new Error(`Cannot assign deactivated role "${role.name}".`);
    }
    if (role.orgId !== null && role.orgId !== input.orgId) {
      throw new Error('Tenant isolation violation.');
    }
    if (role.rank >= actorRank && actorRank < 100) {
      throw new Error(
        'Privilege escalation denied: Cannot assign a role of equal or greater rank than your own.'
      );
    }

    const assignmentId = `assign_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const assignment: UserRoleAssignment = {
      id: assignmentId,
      orgId: input.orgId,
      userId: input.userId,
      roleId: input.roleId,
      assignedBy: input.assignedBy || 'admin',
      assignedAt: now,
    };

    this.userAssignments.set(
      `${input.orgId}:${input.userId}:${input.roleId}`,
      assignment
    );

    this.emitAudit(
      input.orgId,
      input.assignedBy || 'admin',
      'members.role_assigned',
      'member',
      input.userId,
      { roleId: input.roleId, roleName: role.name, rank: role.rank }
    );

    return assignment;
  }

  public getUserAssignments(orgId: string, userId: string): UserRoleAssignment[] {
    const result: UserRoleAssignment[] = [];
    for (const assignment of this.userAssignments.values()) {
      if (assignment.orgId === orgId && assignment.userId === userId) {
        result.push(assignment);
      }
    }
    return result;
  }
}
