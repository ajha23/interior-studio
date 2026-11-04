import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminRoleService } from './adminRoleService';
import { bootstrapModuleRegistry } from './bootstrap';
import { moduleRegistry } from './moduleRegistry';

describe('AdminRoleService (FR-003, FR-004, US1, US2, US4, US6)', () => {
  let service: AdminRoleService;
  const auditSpy = vi.fn();
  const orgId = 'org_test';

  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    auditSpy.mockClear();
    service = new AdminRoleService(auditSpy);
  });

  it('lists default system roles as immutable templates', () => {
    const roles = service.listRoles(orgId);
    expect(roles.length).toBeGreaterThanOrEqual(5);

    const owner = roles.find((r) => r.id === 'owner');
    expect(owner).toBeDefined();
    expect(owner?.isSystemRole).toBe(true);
    expect(owner?.rank).toBe(100);
  });

  it('creates a custom role within an organization', () => {
    const role = service.createRole(100, {
      orgId,
      name: 'Junior Drafter',
      description: 'Assists with 2D drawings',
      rank: 30,
      scopeConfig: {
        scopeType: 'assigned_projects',
        specificProjectIds: [],
        teamIds: [],
      },
      initialPermissions: [
        { permissionId: 'designs.2d.view', scopeType: 'assigned_projects' },
      ],
    });

    expect(role.id).toBeDefined();
    expect(role.name).toBe('Junior Drafter');
    expect(role.isSystemRole).toBe(false);
    expect(role.status).toBe('active');
    expect(role.scopeConfig.scopeType).toBe('assigned_projects');

    const perms = service.getRolePermissions(role.id);
    expect(perms).toHaveLength(1);
    expect(perms[0]?.scopeType).toBe('assigned_projects');

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventAction: 'roles.created', resourceId: role.id })
    );

    const events = service.getRoleAuditEvents(orgId, role.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.actionType).toBe('created');
  });

  it('clones an existing role with all its permissions', () => {
    const cloned = service.cloneRole(100, {
      orgId,
      sourceRoleId: 'designer',
      newRoleName: 'Senior Designer Custom',
      newDescription: 'Cloned designer with extra capabilities',
    });

    expect(cloned.name).toBe('Senior Designer Custom');
    expect(cloned.isSystemRole).toBe(false);

    const perms = service.getRolePermissions(cloned.id);
    expect(perms.map((p) => p.permissionId)).toContain('projects:write');
    expect(perms.map((p) => p.permissionId)).toContain('quotes:send');

    const events = service.getRoleAuditEvents(orgId, cloned.id);
    expect(events.some((e) => e.actionType === 'cloned')).toBe(true);
  });

  it('rejects editing immutable system roles', () => {
    expect(() => {
      service.updateRolePermissions(100, {
        orgId,
        roleId: 'designer',
        permissions: [{ permissionId: 'projects:read', scopeType: 'all_projects' }],
      });
    }).toThrowError(/immutable template/);
  });

  it('updates permissions and scopes on a custom role', () => {
    const customRole = service.createRole(100, {
      orgId,
      name: 'Custom Estimator',
      rank: 45,
    });

    service.updateRole(100, {
      orgId,
      roleId: customRole.id,
      name: 'Senior Estimator',
      scopeConfig: {
        scopeType: 'all_projects',
        specificProjectIds: [],
        teamIds: [],
      },
      permissions: [
        { permissionId: 'quotes:view_costs', scopeType: 'all_projects' },
        { permissionId: 'quotes:edit_margins', scopeType: 'all_projects' },
      ],
    });

    const updated = service.getRole(customRole.id, orgId);
    expect(updated?.name).toBe('Senior Estimator');

    const perms = service.getRolePermissions(customRole.id);
    expect(perms).toHaveLength(2);
    expect(perms.map((p) => p.permissionId)).toContain('quotes:edit_margins');

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventAction: 'roles.updated', resourceId: customRole.id })
    );
  });

  it('calculates pre-commit change impact diffs accurately (US4, FR-009)', () => {
    const role = service.createRole(100, {
      orgId,
      name: 'Specialist',
      rank: 50,
      initialPermissions: [
        { permissionId: 'projects:read', scopeType: 'all_projects' },
        { permissionId: 'designs.3d.view', scopeType: 'all_projects' },
      ],
    });

    // Assign 2 users
    service.assignUserRole(100, {
      orgId,
      userId: 'user_priya',
      userName: 'Priya',
      roleId: role.id,
    });
    service.assignUserRole(100, {
      orgId,
      userId: 'user_aarav',
      userName: 'Aarav',
      roleId: role.id,
    });

    // Calculate impact of adding quotes:edit_margins (high risk) and removing designs.3d.view
    const impact = service.calculateChangeImpact(
      orgId,
      role.id,
      ['projects:read', 'quotes:edit_margins'],
      'team_projects'
    );

    expect(impact.affectedUserCount).toBe(2);
    expect(impact.affectedUserNames).toContain('Priya');
    expect(impact.affectedUserNames).toContain('Aarav');
    expect(impact.addedPermissions).toHaveLength(1);
    expect(impact.addedPermissions[0]?.id).toBe('quotes:edit_margins');
    expect(impact.highRiskPermissionsAdded).toContain('Edit Profit Margins');
    expect(impact.removedPermissions).toHaveLength(1);
    expect(impact.removedPermissions[0]?.id).toBe('designs.3d.view');
    expect(impact.isScopeChanged).toBe(true);
    expect(impact.newScope).toBe('team_projects');
  });

  it('enforces Last-Owner safeguard when unassigning owner roles (FR-011, US6)', () => {
    // Seed 1 owner assignment
    service.assignUserRole(100, {
      orgId,
      userId: 'user_founder',
      userName: 'Sole Founder',
      roleId: 'owner',
    });

    // Attempting to remove the sole owner must throw CANNOT_REMOVE_LAST_OWNER
    expect(() => {
      service.unassignUserRole(100, orgId, 'user_founder', 'owner');
    }).toThrowError(/CANNOT_REMOVE_LAST_OWNER/);

    // Add a second owner
    service.assignUserRole(100, {
      orgId,
      userId: 'user_co_founder',
      userName: 'Co-Founder',
      roleId: 'owner',
    });

    // Now removing one owner should succeed because another remains
    expect(() => {
      service.unassignUserRole(100, orgId, 'user_founder', 'owner');
    }).not.toThrow();

    const remaining = service.listRoleMembers(orgId, 'owner');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.userId).toBe('user_co_founder');
  });

  it('deactivates and reactivates custom roles with audit records', () => {
    const role = service.createRole(100, {
      orgId,
      name: 'Contractor',
      rank: 25,
    });

    service.deactivateRole(100, orgId, role.id);
    expect(service.getRole(role.id, orgId)?.status).toBe('deactivated');

    service.reactivateRole(100, orgId, role.id);
    expect(service.getRole(role.id, orgId)?.status).toBe('active');

    const events = service.getRoleAuditEvents(orgId, role.id);
    expect(events.some((e) => e.actionType === 'deactivated')).toBe(true);
    expect(events.some((e) => e.actionType === 'reactivated')).toBe(true);
  });
});
