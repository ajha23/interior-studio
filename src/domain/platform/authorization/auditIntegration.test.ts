import { describe, expect, it } from 'vitest';
import { AdminRoleService } from './adminRoleService';
import type { AuditRecord } from '../audit';

describe('Role & Permission Audit Integration (US5, SEC-06, SEC-07)', () => {
  const orgId = 'org_test_audit_01';
  const actorRank = 100; // Owner

  it('emits roles.created audit event on role creation', () => {
    const received: AuditRecord[] = [];
    const service = new AdminRoleService((event) => received.push(event));

    const role = service.createRole(actorRank, {
      orgId,
      name: 'Site Estimator',
      description: 'Custom role for quoting on-site',
      rank: 55,
      actorId: 'user_owner_01',
      initialPermissions: [
        { permissionId: 'quotes:view_costs', scopeType: 'all_projects' },
      ],
    });

    expect(received).toHaveLength(1);
    const event = received[0]!;
    expect(event.eventFamily).toBe('members');
    expect(event.eventAction).toBe('roles.created');
    expect(event.resourceType).toBe('role');
    expect(event.resourceId).toBe(role.id);
    expect(event.actorId).toBe('user_owner_01');
    expect(event.metadata).toMatchObject({
      name: 'Site Estimator',
      rank: 55,
      orgId,
    });

    expect(service.getAuditLogs()).toContainEqual(event);
  });

  it('emits roles.updated audit event when permissions are updated', () => {
    const service = new AdminRoleService();
    const role = service.createRole(actorRank, {
      orgId,
      name: 'Drafter',
      rank: 45,
    });

    service.updateRolePermissions(actorRank, {
      orgId,
      roleId: role.id,
      actorId: 'user_owner_01',
      permissions: [
        { permissionId: 'designs.2d.view', scopeType: 'all_projects' },
        { permissionId: 'designs.2d.edit', scopeType: 'assigned_projects' },
      ],
    });

    const logs = service.getAuditLogs();
    const updateEvent = logs.find((l) => l.eventAction === 'roles.updated');
    expect(updateEvent).toBeDefined();
    expect(updateEvent?.resourceId).toBe(role.id);
    expect(updateEvent?.metadata).toMatchObject({
      permissionsCount: 2,
      orgId,
    });
  });

  it('emits roles.deactivated audit event when a role is deactivated', () => {
    const service = new AdminRoleService();
    const role = service.createRole(actorRank, {
      orgId,
      name: 'Temporary Intern',
      rank: 25,
    });

    service.deactivateRole(actorRank, orgId, role.id, 'user_owner_01');

    const logs = service.getAuditLogs();
    const deactivateEvent = logs.find((l) => l.eventAction === 'roles.deactivated');
    expect(deactivateEvent).toBeDefined();
    expect(deactivateEvent?.resourceId).toBe(role.id);
  });

  it('emits roles.deleted audit event when a custom role is removed', () => {
    const service = new AdminRoleService();
    const role = service.createRole(actorRank, {
      orgId,
      name: 'Obsolete Role',
      rank: 30,
    });

    service.deleteRole(actorRank, orgId, role.id, 'user_owner_01');

    const logs = service.getAuditLogs();
    const deleteEvent = logs.find((l) => l.eventAction === 'roles.deleted');
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent?.resourceId).toBe(role.id);
  });

  it('emits members.role_assigned audit event when a role is assigned to a user', () => {
    const service = new AdminRoleService();
    const role = service.createRole(actorRank, {
      orgId,
      name: 'Workshop Foreman',
      rank: 50,
    });

    const assignment = service.assignUserRole(actorRank, {
      orgId,
      userId: 'user_foreman_01',
      roleId: role.id,
      assignedBy: 'user_admin_01',
    });

    expect(assignment.userId).toBe('user_foreman_01');
    expect(assignment.roleId).toBe(role.id);

    const logs = service.getAuditLogs();
    const assignEvent = logs.find((l) => l.eventAction === 'members.role_assigned');
    expect(assignEvent).toBeDefined();
    expect(assignEvent?.eventFamily).toBe('members');
    expect(assignEvent?.resourceType).toBe('member');
    expect(assignEvent?.resourceId).toBe('user_foreman_01');
    expect(assignEvent?.actorId).toBe('user_admin_01');
    expect(assignEvent?.metadata).toMatchObject({
      roleId: role.id,
      roleName: 'Workshop Foreman',
    });
  });
});
