import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminRoleService } from './adminRoleService';

describe('AdminRoleService (FR-003, FR-004, US2)', () => {
  let service: AdminRoleService;
  const auditSpy = vi.fn();

  beforeEach(() => {
    auditSpy.mockClear();
    service = new AdminRoleService(auditSpy);
  });

  it('lists default system roles as immutable templates', () => {
    const roles = service.listRoles('org_test');
    expect(roles.length).toBeGreaterThanOrEqual(5);

    const owner = roles.find((r) => r.id === 'owner');
    expect(owner).toBeDefined();
    expect(owner?.isSystemRole).toBe(true);
    expect(owner?.rank).toBe(100);
  });

  it('creates a custom role within an organization', () => {
    const role = service.createRole(100, {
      orgId: 'org_test',
      name: 'Junior Drafter',
      description: 'Assists with 2D drawings',
      rank: 30,
      initialPermissions: [
        { permissionId: 'designs.2d.view', scopeType: 'assigned_projects' },
      ],
    });

    expect(role.id).toBeDefined();
    expect(role.name).toBe('Junior Drafter');
    expect(role.isSystemRole).toBe(false);
    expect(role.status).toBe('active');

    const perms = service.getRolePermissions(role.id);
    expect(perms).toHaveLength(1);
    expect(perms[0]?.scopeType).toBe('assigned_projects');

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventAction: 'roles.created', resourceId: role.id })
    );
  });

  it('clones an existing role with all its permissions', () => {
    const cloned = service.cloneRole(100, {
      orgId: 'org_test',
      sourceRoleId: 'designer',
      newRoleName: 'Senior Designer Custom',
      newDescription: 'Cloned designer with extra capabilities',
    });

    expect(cloned.name).toBe('Senior Designer Custom');
    expect(cloned.isSystemRole).toBe(false);

    const perms = service.getRolePermissions(cloned.id);
    expect(perms.map((p) => p.permissionId)).toContain('projects:write');
    expect(perms.map((p) => p.permissionId)).toContain('quotes:send');
  });

  it('rejects editing immutable system roles', () => {
    expect(() => {
      service.updateRolePermissions(100, {
        orgId: 'org_test',
        roleId: 'designer',
        permissions: [{ permissionId: 'projects:read', scopeType: 'all_projects' }],
      });
    }).toThrowError(/immutable template/);
  });

  it('updates permissions and scopes on a custom role', () => {
    const customRole = service.createRole(100, {
      orgId: 'org_test',
      name: 'Custom Estimator',
      rank: 45,
    });

    service.updateRolePermissions(100, {
      orgId: 'org_test',
      roleId: customRole.id,
      permissions: [
        { permissionId: 'quotes:view_costs', scopeType: 'all_projects' },
        { permissionId: 'quotes:edit_margins', scopeType: 'all_projects' },
      ],
    });

    const perms = service.getRolePermissions(customRole.id);
    expect(perms).toHaveLength(2);
    expect(perms.map((p) => p.permissionId)).toContain('quotes:edit_margins');

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventAction: 'roles.updated', resourceId: customRole.id })
    );
  });

  it('enforces privilege escalation guards (cannot create or edit role with higher rank)', () => {
    // Designer rank = 60
    expect(() => {
      service.createRole(60, {
        orgId: 'org_test',
        name: 'Super Admin',
        rank: 80,
      });
    }).toThrowError(/Privilege escalation denied/);
  });

  it('deactivates and deletes custom roles', () => {
    const role = service.createRole(100, {
      orgId: 'org_test',
      name: 'Temporary Assistant',
      rank: 25,
    });

    service.deactivateRole(100, 'org_test', role.id);
    expect(service.getRole(role.id, 'org_test')?.status).toBe('deactivated');

    service.deleteRole(100, 'org_test', role.id);
    expect(service.getRole(role.id, 'org_test')).toBeUndefined();
  });
});
