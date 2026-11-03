import type {
  CustomRole,
  RolePermissionMapping,
  ResourceScopeType,
  UserRoleAssignment,
  ChangeImpactAnalysis,
  RoleAuditEvent,
  RoleResourceScopeConfig,
} from './types';
import { type AuditRecord, createAuditEvent } from '../audit';
import { moduleRegistry } from './moduleRegistry';

export interface CreateRoleInput {
  orgId: string;
  name: string;
  description?: string;
  rank: number;
  actorId?: string;
  scopeConfig?: RoleResourceScopeConfig;
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
  scopeType?: ResourceScopeType;
}

export interface UpdateRoleInput {
  orgId: string;
  roleId: string;
  actorId?: string;
  name?: string;
  description?: string;
  scopeConfig?: RoleResourceScopeConfig;
  permissions: Array<{
    permissionId: string;
    scopeType?: ResourceScopeType;
  }>;
}

export interface AssignRoleInput {
  orgId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  roleId: string;
  assignedBy?: string;
}

export type AuditEventCallback = (record: AuditRecord) => void;

/**
 * Pure domain service for Custom Role Lifecycle, Governance, and Auditability (FR-003, FR-004, US1, US2, US4, US6).
 * Framework-free TypeScript complying with Constitution Principle VI.
 */
export class AdminRoleService {
  private roles = new Map<string, CustomRole>();
  private rolePermissions = new Map<string, Map<string, RolePermissionMapping>>();
  private userAssignments = new Map<string, UserRoleAssignment>();
  private auditLogs: AuditRecord[] = [];
  private roleAuditEvents: RoleAuditEvent[] = [];
  private auditCallback?: AuditEventCallback;

  constructor(auditCallback?: AuditEventCallback) {
    this.auditCallback = auditCallback;
    this.seedSystemRoles();
  }

  private seedSystemRoles(): void {
    const now = new Date().toISOString();
    const systemRoles: Array<{
      id: string;
      name: string;
      rank: number;
      perms: string[];
      defaultScope: ResourceScopeType;
    }> = [
      {
        id: 'owner',
        name: 'Owner',
        rank: 100,
        defaultScope: 'all_projects',
        perms: [
          'org:manage',
          'members:manage',
          'projects:read',
          'projects:write',
          'projects:delete',
          'floor_plans:read',
          'floor_plans:write',
          'designs.2d.view',
          'designs.3d.view',
          'designs.3d.edit',
          'designs.3d.export',
          'furniture:browse',
          'furniture:custom_param',
          'materials:browse',
          'materials:manage',
          'quotes:view_costs',
          'quotes:edit_margins',
          'quotes:send',
          'production:download_cutlist',
          'deliverables:generate',
          'deliverables:share',
          'clients:view_pii',
          'clients:manage',
        ],
      },
      {
        id: 'admin',
        name: 'Admin',
        rank: 80,
        defaultScope: 'all_projects',
        perms: [
          'members:manage',
          'projects:read',
          'projects:write',
          'projects:delete',
          'floor_plans:read',
          'floor_plans:write',
          'designs.2d.view',
          'designs.3d.view',
          'designs.3d.edit',
          'designs.3d.export',
          'furniture:browse',
          'furniture:custom_param',
          'materials:browse',
          'materials:manage',
          'quotes:view_costs',
          'quotes:edit_margins',
          'quotes:send',
          'production:download_cutlist',
          'deliverables:generate',
          'deliverables:share',
          'clients:view_pii',
          'clients:manage',
        ],
      },
      {
        id: 'designer',
        name: 'Designer',
        rank: 60,
        defaultScope: 'assigned_projects',
        perms: [
          'projects:read',
          'projects:write',
          'floor_plans:read',
          'floor_plans:write',
          'designs.2d.view',
          'designs.3d.view',
          'designs.3d.edit',
          'furniture:browse',
          'furniture:custom_param',
          'materials:browse',
          'quotes:send',
          'deliverables:generate',
          'clients:view_pii',
        ],
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        rank: 40,
        defaultScope: 'all_projects',
        perms: [
          'projects:read',
          'floor_plans:read',
          'designs.2d.view',
          'designs.3d.view',
          'materials:browse',
          'deliverables:generate',
          'deliverables:share',
          'quotes:view_costs',
        ],
      },
      {
        id: 'client_viewer',
        name: 'Client Viewer',
        rank: 20,
        defaultScope: 'assigned_projects',
        perms: [
          'designs.3d.view',
          'deliverables:generate',
        ],
      },
      {
        id: 'production',
        name: 'Production',
        rank: 40,
        defaultScope: 'all_projects',
        perms: [
          'projects:read',
          'production:download_cutlist',
        ],
      },
      {
        id: 'viewer',
        name: 'Viewer',
        rank: 20,
        defaultScope: 'all_projects',
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
        scopeConfig: {
          scopeType: sys.defaultScope,
          specificProjectIds: [],
          teamIds: [],
        },
        createdAt: now,
        updatedAt: now,
      });

      const pMap = new Map<string, RolePermissionMapping>();
      for (const p of sys.perms) {
        pMap.set(p, {
          roleId: sys.id,
          permissionId: p,
          scopeType: sys.defaultScope,
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

  private recordRoleAuditEvent(event: RoleAuditEvent): void {
    this.roleAuditEvents.push(event);
  }

  public getAuditLogs(): AuditRecord[] {
    return [...this.auditLogs];
  }

  public getRoleAuditEvents(orgId: string, roleId?: string): RoleAuditEvent[] {
    return this.roleAuditEvents
      .filter((e) => e.orgId === orgId && (!roleId || e.roleId === roleId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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

  public getRoleMemberCount(orgId: string, roleId: string): number {
    let count = 0;
    for (const assignment of this.userAssignments.values()) {
      if (assignment.orgId === orgId && assignment.roleId === roleId) {
        count++;
      }
    }
    return count;
  }

  public listRoleMembers(orgId: string, roleId: string): UserRoleAssignment[] {
    const members: UserRoleAssignment[] = [];
    for (const assignment of this.userAssignments.values()) {
      if (assignment.orgId === orgId && assignment.roleId === roleId) {
        members.push(assignment);
      }
    }
    return members;
  }

  public listOrgAssignments(orgId: string): UserRoleAssignment[] {
    const assignments: UserRoleAssignment[] = [];
    for (const assignment of this.userAssignments.values()) {
      if (assignment.orgId === orgId) {
        assignments.push(assignment);
      }
    }
    return assignments;
  }

  /**
   * Pre-commit impact analysis (US4, FR-009).
   * Calculates diffs, affected user counts, and high-risk flags.
   */
  public calculateChangeImpact(
    orgId: string,
    roleId: string,
    newPermissionIds: string[],
    newScopeType?: ResourceScopeType
  ): ChangeImpactAnalysis {
    const role = this.getRole(roleId, orgId);
    if (!role) {
      throw new Error(`Role "${roleId}" not found.`);
    }

    const currentMappings = this.getRolePermissions(roleId);
    const currentPermIds = new Set(currentMappings.map((m) => m.permissionId));
    const newPermIdSet = new Set(newPermissionIds);

    const allRegistryPerms = new Map(
      moduleRegistry.getAllPermissions().map((p) => [p.id, p])
    );

    const addedPermissions: Array<{ id: string; title: string; module: string }> = [];
    const highRiskPermissionsAdded: string[] = [];

    for (const id of newPermissionIds) {
      if (!currentPermIds.has(id)) {
        const def = allRegistryPerms.get(id);
        const title = def?.title || id;
        const module = def?.moduleId || 'unknown';
        addedPermissions.push({ id, title, module });
        if (def?.isHighRisk) {
          highRiskPermissionsAdded.push(title);
        }
      }
    }

    const removedPermissions: Array<{ id: string; title: string; module: string }> = [];
    for (const id of currentPermIds) {
      if (!newPermIdSet.has(id)) {
        const def = allRegistryPerms.get(id);
        removedPermissions.push({
          id,
          title: def?.title || id,
          module: def?.moduleId || 'unknown',
        });
      }
    }

    const currentScope = role.scopeConfig.scopeType;
    const isScopeChanged = Boolean(newScopeType && newScopeType !== currentScope);

    const members = this.listRoleMembers(orgId, roleId);
    const affectedUserNames = members
      .map((m) => m.userName || m.userId)
      .filter(Boolean);

    return {
      roleId,
      affectedUserCount: members.length,
      affectedUserNames,
      addedPermissions,
      removedPermissions,
      isScopeChanged,
      previousScope: currentScope,
      newScope: newScopeType || currentScope,
      highRiskPermissionsAdded,
    };
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

    const scopeConfig: RoleResourceScopeConfig = input.scopeConfig || {
      scopeType: 'all_projects',
      specificProjectIds: [],
      teamIds: [],
    };

    const newRole: CustomRole = {
      id: roleId,
      orgId: input.orgId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      rank: Math.max(1, Math.min(99, input.rank)), // Custom roles capped at 99
      isSystemRole: false,
      status: 'active',
      scopeConfig,
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
          scopeType: p.scopeType || scopeConfig.scopeType,
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

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId: input.orgId,
      actorId: input.actorId || 'admin',
      actorName: 'Admin',
      roleId,
      roleName: newRole.name,
      actionType: 'created',
      changesSummary: `Created role "${newRole.name}" with ${pMap.size} permissions`,
      addedPermissions: Array.from(pMap.keys()),
      removedPermissions: [],
      newScope: scopeConfig.scopeType,
      affectedUserCount: 0,
      timestamp: now,
    });

    return newRole;
  }

  public cloneRole(actorRank: number, input: CloneRoleInput): CustomRole {
    const sourceRole = this.roles.get(input.sourceRoleId);
    if (!sourceRole) {
      throw new Error(`Source role "${input.sourceRoleId}" not found.`);
    }

    const sourcePerms = this.getRolePermissions(input.sourceRoleId);
    const scopeType = input.scopeType || sourceRole.scopeConfig.scopeType;

    const cloned = this.createRole(actorRank, {
      orgId: input.orgId,
      actorId: input.actorId,
      name: input.newRoleName,
      description: input.newDescription || `Cloned from ${sourceRole.name}`,
      rank: Math.min(sourceRole.rank, actorRank - 1 > 0 ? actorRank - 1 : actorRank),
      scopeConfig: {
        scopeType,
        specificProjectIds: [...sourceRole.scopeConfig.specificProjectIds],
        teamIds: [...sourceRole.scopeConfig.teamIds],
      },
      initialPermissions: sourcePerms.map((p) => ({
        permissionId: p.permissionId,
        scopeType: p.scopeType,
      })),
    });

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId: input.orgId,
      actorId: input.actorId || 'admin',
      actorName: 'Admin',
      roleId: cloned.id,
      roleName: cloned.name,
      actionType: 'cloned',
      changesSummary: `Cloned from role "${sourceRole.name}"`,
      addedPermissions: sourcePerms.map((p) => p.permissionId),
      removedPermissions: [],
      newScope: scopeType,
      affectedUserCount: 0,
      timestamp: new Date().toISOString(),
    });

    return cloned;
  }

  public updateRole(actorRank: number, input: UpdateRoleInput): CustomRole {
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

    const impact = this.calculateChangeImpact(
      input.orgId,
      input.roleId,
      input.permissions.map((p) => p.permissionId),
      input.scopeConfig?.scopeType
    );

    if (input.name && input.name.trim()) {
      role.name = input.name.trim();
    }
    if (input.description !== undefined) {
      role.description = input.description.trim();
    }
    if (input.scopeConfig) {
      role.scopeConfig = { ...input.scopeConfig };
    }

    const effectiveScope = role.scopeConfig.scopeType;
    const pMap = new Map<string, RolePermissionMapping>();
    for (const p of input.permissions) {
      pMap.set(p.permissionId, {
        roleId: input.roleId,
        permissionId: p.permissionId,
        scopeType: p.scopeType || effectiveScope,
      });
    }
    this.rolePermissions.set(input.roleId, pMap);
    const now = new Date().toISOString();
    role.updatedAt = now;

    this.emitAudit(
      input.orgId,
      input.actorId || 'admin',
      'roles.updated',
      'role',
      input.roleId,
      {
        permissionsCount: input.permissions.length,
        orgId: input.orgId,
        scope: role.scopeConfig.scopeType,
      }
    );

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId: input.orgId,
      actorId: input.actorId || 'admin',
      actorName: 'Admin',
      roleId: input.roleId,
      roleName: role.name,
      actionType: 'updated',
      changesSummary: `Updated permissions: +${impact.addedPermissions.length}, -${impact.removedPermissions.length}`,
      addedPermissions: impact.addedPermissions.map((p) => p.id),
      removedPermissions: impact.removedPermissions.map((p) => p.id),
      previousScope: impact.previousScope,
      newScope: impact.newScope,
      affectedUserCount: impact.affectedUserCount,
      timestamp: now,
    });

    return role;
  }

  public updateRolePermissions(
    actorRank: number,
    input: {
      orgId: string;
      roleId: string;
      actorId?: string;
      permissions: Array<{
        permissionId: string;
        scopeType: ResourceScopeType;
      }>;
    }
  ): void {
    this.updateRole(actorRank, {
      orgId: input.orgId,
      roleId: input.roleId,
      actorId: input.actorId,
      permissions: input.permissions,
    });
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
    const now = new Date().toISOString();
    role.updatedAt = now;

    this.emitAudit(orgId, actorId, 'roles.deactivated', 'role', roleId, { orgId });

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId,
      actorId,
      actorName: 'Admin',
      roleId,
      roleName: role.name,
      actionType: 'deactivated',
      changesSummary: `Deactivated role "${role.name}"`,
      addedPermissions: [],
      removedPermissions: [],
      timestamp: now,
      affectedUserCount: this.getRoleMemberCount(orgId, roleId),
    });
  }

  public reactivateRole(
    actorRank: number,
    orgId: string,
    roleId: string,
    actorId = 'admin'
  ): void {
    const role = this.roles.get(roleId);
    if (!role) throw new Error(`Role "${roleId}" not found.`);
    if (role.orgId !== orgId) throw new Error('Tenant isolation violation.');
    if (role.rank >= actorRank && actorRank < 100) {
      throw new Error('Privilege escalation denied.');
    }

    role.status = 'active';
    const now = new Date().toISOString();
    role.updatedAt = now;

    this.emitAudit(orgId, actorId, 'roles.reactivated', 'role', roleId, { orgId });

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId,
      actorId,
      actorName: 'Admin',
      roleId,
      roleName: role.name,
      actionType: 'reactivated',
      changesSummary: `Reactivated role "${role.name}"`,
      addedPermissions: [],
      removedPermissions: [],
      timestamp: now,
      affectedUserCount: this.getRoleMemberCount(orgId, roleId),
    });
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

    // Remove assignments to deleted role
    for (const [key, assignment] of this.userAssignments.entries()) {
      if (assignment.orgId === orgId && assignment.roleId === roleId) {
        this.userAssignments.delete(key);
      }
    }

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
      userName: input.userName || input.userId,
      userEmail: input.userEmail,
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

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId: input.orgId,
      actorId: input.assignedBy || 'admin',
      actorName: 'Admin',
      roleId: input.roleId,
      roleName: role.name,
      actionType: 'assigned',
      changesSummary: `Assigned role "${role.name}" to member ${input.userName || input.userId}`,
      addedPermissions: [],
      removedPermissions: [],
      timestamp: now,
      affectedUserCount: 1,
    });

    return assignment;
  }

  /**
   * Unassign role from user with Last-Owner safeguard (FR-011, US6).
   */
  public unassignUserRole(
    actorRank: number,
    orgId: string,
    userId: string,
    roleId: string,
    actorId = 'admin'
  ): void {
    const role = this.roles.get(roleId);
    if (!role) throw new Error(`Role "${roleId}" not found.`);

    if (role.rank >= actorRank && actorRank < 100) {
      throw new Error('Privilege escalation denied.');
    }

    // Last-Owner Safeguard
    if (roleId === 'owner' || role.rank === 100) {
      let ownerCount = 0;
      for (const a of this.userAssignments.values()) {
        if (a.orgId === orgId && (a.roleId === 'owner' || this.roles.get(a.roleId)?.rank === 100)) {
          ownerCount++;
        }
      }
      if (ownerCount <= 1) {
        throw new Error(
          'CANNOT_REMOVE_LAST_OWNER: Organization must retain at least one active Owner.'
        );
      }
    }

    const key = `${orgId}:${userId}:${roleId}`;
    if (!this.userAssignments.has(key)) {
      return;
    }
    this.userAssignments.delete(key);

    const now = new Date().toISOString();
    this.emitAudit(orgId, actorId, 'members.role_unassigned', 'member', userId, {
      roleId,
      roleName: role.name,
    });

    this.recordRoleAuditEvent({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      orgId,
      actorId,
      actorName: 'Admin',
      roleId,
      roleName: role.name,
      actionType: 'unassigned',
      changesSummary: `Unassigned role "${role.name}" from user ${userId}`,
      addedPermissions: [],
      removedPermissions: [],
      timestamp: now,
      affectedUserCount: 1,
    });
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
