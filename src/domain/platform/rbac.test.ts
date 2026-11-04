import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  canAssignRole,
  canModifyMember,
  ROLE_RANK,
  type OrgMember,
} from './rbac';

describe('RBAC Evaluation & Hierarchy (Step A)', () => {
  const owner: OrgMember = { userId: 'u1', orgId: 'org1', role: 'owner' };
  const admin: OrgMember = { userId: 'u2', orgId: 'org1', role: 'admin' };
  const designer: OrgMember = { userId: 'u3', orgId: 'org1', role: 'designer' };
  const production: OrgMember = { userId: 'u4', orgId: 'org1', role: 'production' };
  const viewer: OrgMember = { userId: 'u5', orgId: 'org1', role: 'viewer' };

  it('verifies owner has all permissions', () => {
    expect(hasPermission(owner, 'org:manage')).toBe(true);
    expect(hasPermission(owner, 'members:manage')).toBe(true);
    expect(hasPermission(owner, 'projects:write')).toBe(true);
    expect(hasPermission(owner, 'quotes:view_costs')).toBe(true);
    expect(hasPermission(owner, 'production:download_cutlist')).toBe(true);
    expect(hasPermission(owner, 'clients:view_pii')).toBe(true);
  });

  it('verifies admin has operational permissions but not org:manage', () => {
    expect(hasPermission(admin, 'org:manage')).toBe(false);
    expect(hasPermission(admin, 'members:manage')).toBe(true);
    expect(hasPermission(admin, 'projects:write')).toBe(true);
    expect(hasPermission(admin, 'quotes:view_costs')).toBe(true);
  });

  it('verifies designer cannot view raw production costs or manage org', () => {
    expect(hasPermission(designer, 'projects:write')).toBe(true);
    expect(hasPermission(designer, 'quotes:send')).toBe(true);
    expect(hasPermission(designer, 'clients:view_pii')).toBe(true);
    expect(hasPermission(designer, 'quotes:view_costs')).toBe(false);
    expect(hasPermission(designer, 'quotes:edit_margins')).toBe(false);
    expect(hasPermission(designer, 'production:download_cutlist')).toBe(false);
  });

  it('verifies production role cannot view client PII or costs, but can download cut list', () => {
    expect(hasPermission(production, 'production:download_cutlist')).toBe(true);
    expect(hasPermission(production, 'projects:read')).toBe(true);
    expect(hasPermission(production, 'projects:write')).toBe(false);
    expect(hasPermission(production, 'clients:view_pii')).toBe(false);
    expect(hasPermission(production, 'quotes:view_costs')).toBe(false);
  });

  it('verifies viewer is strictly read-only', () => {
    expect(hasPermission(viewer, 'projects:read')).toBe(true);
    expect(hasPermission(viewer, 'projects:write')).toBe(false);
    expect(hasPermission(viewer, 'clients:view_pii')).toBe(false);
    expect(hasPermission(viewer, 'production:download_cutlist')).toBe(false);
  });

  it('prevents privilege escalation during role assignment', () => {
    // Owner can assign anything
    expect(canAssignRole('owner', 'owner')).toBe(true);
    expect(canAssignRole('owner', 'admin')).toBe(true);

    // Admin cannot assign owner or admin (must be strictly lower rank)
    expect(canAssignRole('admin', 'owner')).toBe(false);
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'designer')).toBe(true);
    expect(canAssignRole('admin', 'production')).toBe(true);

    // Designer cannot assign roles
    expect(canAssignRole('designer', 'designer')).toBe(false);
    expect(canAssignRole('designer', 'production')).toBe(true);
  });

  it('prevents demotion or modification of equal or higher rank members', () => {
    // Admin cannot modify an Owner or another Admin
    expect(canModifyMember('admin', 'owner')).toBe(false);
    expect(canModifyMember('admin', 'admin')).toBe(false);
    expect(canModifyMember('admin', 'designer')).toBe(true);

    // Owner can modify anyone
    expect(canModifyMember('owner', 'admin')).toBe(true);
    expect(canModifyMember('owner', 'owner')).toBe(true);
  });

  it('validates strictly ordered role ranks', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.designer);
    expect(ROLE_RANK.designer).toBeGreaterThan(ROLE_RANK.production);
    expect(ROLE_RANK.production).toBeGreaterThan(ROLE_RANK.viewer);
  });
});

