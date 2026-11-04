import { describe, expect, it } from 'vitest';
import { AuthorizationEvaluator, evaluateAuthorization } from './evaluator';
import type { ActorContext, ResourceContext } from './types';

describe('evaluateAuthorization (Additive Union Engine)', () => {
  const actorBase: ActorContext = {
    id: 'user_designer_01',
    orgId: 'org_inhouse_01',
    teamId: 'team_residential',
    clientId: 'client_acme',
    roles: [],
  };

  it('denies by default when actor has no roles', () => {
    const result = evaluateAuthorization(actorBase, 'designs.2d.edit');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No active roles');
  });

  it('denies when all actor roles are deactivated', () => {
    const actor: ActorContext = {
      ...actorBase,
      roles: [
        {
          roleId: 'role_draftsman',
          status: 'deactivated',
          permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'all_projects' }],
        },
      ],
    };

    const result = evaluateAuthorization(actor, 'designs.2d.edit');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No active roles');
  });

  it('denies when actor has active roles but permission is not granted', () => {
    const actor: ActorContext = {
      ...actorBase,
      roles: [
        {
          roleId: 'role_draftsman',
          status: 'active',
          permissions: [{ permissionId: 'designs.2d.view', scopeType: 'all_projects' }],
        },
      ],
    };

    const result = evaluateAuthorization(actor, 'designs.2d.edit');
    expect(result.allowed).toBe(false);
    expect(result.missingPermissions).toContain('designs.2d.edit');
  });

  it('allows global access when a single role grants all_projects', () => {
    const actor: ActorContext = {
      ...actorBase,
      roles: [
        {
          roleId: 'role_lead_designer',
          status: 'active',
          permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'all_projects' }],
        },
      ],
    };

    const result = evaluateAuthorization(actor, 'designs.2d.edit');
    expect(result.allowed).toBe(true);
    expect(result.applicableScope).toBe('all_projects');
  });

  describe('Additive Union of Multi-Role Scopes', () => {
    it('promotes to all_projects if ANY assigned role grants all_projects', () => {
      const actor: ActorContext = {
        ...actorBase,
        roles: [
          {
            roleId: 'role_contractor',
            status: 'active',
            permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'assigned_projects' }],
          },
          {
            roleId: 'role_senior_reviewer',
            status: 'active',
            permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'all_projects' }],
          },
        ],
      };

      const unassignedResource: ResourceContext = {
        projectId: 'project_unassigned',
        assignedUserIds: ['user_other'],
      };

      const result = evaluateAuthorization(actor, 'designs.2d.edit', unassignedResource);
      expect(result.allowed).toBe(true);
      expect(result.applicableScope).toBe('all_projects');
    });

    it('unions multiple narrower scopes (team_projects OR client_projects)', () => {
      const actor: ActorContext = {
        ...actorBase,
        teamId: 'team_residential',
        clientId: 'client_acme',
        roles: [
          {
            roleId: 'role_team_lead',
            status: 'active',
            permissions: [{ permissionId: 'estimates.view', scopeType: 'team_projects' }],
          },
          {
            roleId: 'role_account_rep',
            status: 'active',
            permissions: [{ permissionId: 'estimates.view', scopeType: 'client_projects' }],
          },
        ],
      };

      // Match via client only
      const clientResource: ResourceContext = {
        projectId: 'proj_commercial',
        teamId: 'team_commercial',
        clientId: 'client_acme',
      };
      const res1 = evaluateAuthorization(actor, 'estimates.view', clientResource);
      expect(res1.allowed).toBe(true);
      expect(res1.applicableScope).toBe('client_projects');

      // Match via team only
      const teamResource: ResourceContext = {
        projectId: 'proj_villa',
        teamId: 'team_residential',
        clientId: 'client_other',
      };
      const res2 = evaluateAuthorization(actor, 'estimates.view', teamResource);
      expect(res2.allowed).toBe(true);
      expect(res2.applicableScope).toBe('team_projects');

      // Match neither
      const neitherResource: ResourceContext = {
        projectId: 'proj_external',
        teamId: 'team_hospitality',
        clientId: 'client_other',
      };
      const res3 = evaluateAuthorization(actor, 'estimates.view', neitherResource);
      expect(res3.allowed).toBe(false);
      expect(res3.reason).toContain('Insufficient resource scope');
    });
  });

  describe('Resource Context Scoping (assigned_projects)', () => {
    const contractorActor: ActorContext = {
      ...actorBase,
      id: 'contractor_bob',
      roles: [
        {
          roleId: 'role_contractor',
          status: 'active',
          permissions: [{ permissionId: 'designs.3d.export', scopeType: 'assigned_projects' }],
        },
      ],
    };

    it('allows access when user ID is in project assignedUserIds', () => {
      const resource: ResourceContext = {
        projectId: 'project_alpha',
        assignedUserIds: ['contractor_bob', 'lead_alice'],
      };

      const result = evaluateAuthorization(contractorActor, 'designs.3d.export', resource);
      expect(result.allowed).toBe(true);
      expect(result.applicableScope).toBe('assigned_projects');
    });

    it('denies access when user ID is NOT in project assignedUserIds', () => {
      const resource: ResourceContext = {
        projectId: 'project_beta',
        assignedUserIds: ['lead_alice'],
      };

      const result = evaluateAuthorization(contractorActor, 'designs.3d.export', resource);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient resource scope');
    });

    it('allows general check when no specific resource is provided', () => {
      const result = evaluateAuthorization(contractorActor, 'designs.3d.export');
      expect(result.allowed).toBe(true);
      expect(result.applicableScope).toBe('assigned_projects');
    });
  });

  describe('AuthorizationEvaluator Class', () => {
    it('implements IAuthorizationEvaluator interface can() method', () => {
      const evaluator = new AuthorizationEvaluator();
      const actor: ActorContext = {
        ...actorBase,
        roles: [
          {
            roleId: 'role_admin',
            status: 'active',
            permissions: [{ permissionId: 'projects.create', scopeType: 'all_projects' }],
          },
        ],
      };

      const res = evaluator.can(actor, 'projects.create');
      expect(res.allowed).toBe(true);
    });
  });
});
