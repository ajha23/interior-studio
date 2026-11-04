import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthorizationStore } from './authorizationStore';
import { useAuthorize } from '@/features/shared/useAuthorize';
import type { ActorContext } from '@/domain/platform/authorization/types';
import type { ProjectMember } from '@/domain/platform/authorization/projectMembership';

describe('useAuthorizationStore & useAuthorize hook', () => {
  beforeEach(() => {
    act(() => {
      useAuthorizationStore.getState().reset();
    });
  });

  it('defaults to null actor and denies all checks by default', () => {
    const store = useAuthorizationStore.getState();
    expect(store.actor).toBeNull();
    const result = store.can('designs.2d.edit');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No actor authenticated');
  });

  it('allows access when actor with matching permission is set', () => {
    const actor: ActorContext = {
      id: 'user_lead',
      orgId: 'org_inhouse_01',
      roles: [
        {
          roleId: 'role_lead_designer',
          status: 'active',
          permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'all_projects' }],
        },
      ],
    };

    act(() => {
      useAuthorizationStore.getState().setActor(actor);
    });

    const store = useAuthorizationStore.getState();
    expect(store.can('designs.2d.edit').allowed).toBe(true);
    expect(store.can('designs.3d.export').allowed).toBe(false);
  });

  it('dynamically reflects updated roles', () => {
    const actor: ActorContext = {
      id: 'user_lead',
      orgId: 'org_inhouse_01',
      roles: [
        {
          roleId: 'role_lead_designer',
          status: 'active',
          permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'all_projects' }],
        },
      ],
    };

    act(() => {
      useAuthorizationStore.getState().setActor(actor);
    });

    expect(useAuthorizationStore.getState().can('materials.manage').allowed).toBe(false);

    // Update roles to add materials.manage
    act(() => {
      useAuthorizationStore.getState().updateActorRoles([
        ...actor.roles,
        {
          roleId: 'role_procurement',
          status: 'active',
          permissions: [{ permissionId: 'materials.manage', scopeType: 'all_projects' }],
        },
      ]);
    });

    expect(useAuthorizationStore.getState().can('materials.manage').allowed).toBe(true);
  });

  it('automatically resolves assigned_projects using store projectMemberships', () => {
    const actor: ActorContext = {
      id: 'user_contractor',
      orgId: 'org_inhouse_01',
      roles: [
        {
          roleId: 'role_external_drafter',
          status: 'active',
          permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'assigned_projects' }],
        },
      ],
    };

    const memberships: ProjectMember[] = [
      {
        projectId: 'project_assigned',
        userId: 'user_contractor',
        assignedAt: '2026-11-01T10:00:00Z',
        assignedBy: 'admin',
      },
      {
        projectId: 'project_other',
        userId: 'user_someone_else',
        assignedAt: '2026-11-01T10:00:00Z',
        assignedBy: 'admin',
      },
    ];

    act(() => {
      useAuthorizationStore.getState().setActor(actor);
      useAuthorizationStore.getState().setProjectMemberships(memberships);
    });

    const store = useAuthorizationStore.getState();

    // Assigned project
    const resAssigned = store.can('designs.2d.edit', { projectId: 'project_assigned' });
    expect(resAssigned.allowed).toBe(true);
    expect(resAssigned.applicableScope).toBe('assigned_projects');

    // Unassigned project
    const resUnassigned = store.can('designs.2d.edit', { projectId: 'project_other' });
    expect(resUnassigned.allowed).toBe(false);
  });

  describe('useAuthorize hook', () => {
    it('returns allowed: false when actor has no permissions', () => {
      const { result } = renderHook(() => useAuthorize('designs.2d.edit'));
      expect(result.current.allowed).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('returns allowed: true and scope when authorized', () => {
      const actor: ActorContext = {
        id: 'user_lead',
        orgId: 'org_inhouse_01',
        roles: [
          {
            roleId: 'role_lead_designer',
            status: 'active',
            permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'all_projects' }],
          },
        ],
      };

      act(() => {
        useAuthorizationStore.getState().setActor(actor);
      });

      const { result } = renderHook(() => useAuthorize('designs.2d.edit'));
      expect(result.current.allowed).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.scope).toBe('all_projects');
    });

    it('reacts dynamically to resource context scoping', () => {
      const actor: ActorContext = {
        id: 'user_contractor',
        orgId: 'org_inhouse_01',
        roles: [
          {
            roleId: 'role_drafter',
            status: 'active',
            permissions: [{ permissionId: 'designs.2d.edit', scopeType: 'assigned_projects' }],
          },
        ],
      };

      act(() => {
        useAuthorizationStore.getState().setActor(actor);
        useAuthorizationStore.getState().setProjectMemberships([
          {
            projectId: 'p_mine',
            userId: 'user_contractor',
            assignedAt: '2026-11-01T10:00:00Z',
            assignedBy: 'admin',
          },
        ]);
      });

      const { result: allowedResult } = renderHook(() =>
        useAuthorize('designs.2d.edit', { projectId: 'p_mine' })
      );
      expect(allowedResult.current.allowed).toBe(true);

      const { result: deniedResult } = renderHook(() =>
        useAuthorize('designs.2d.edit', { projectId: 'p_other' })
      );
      expect(deniedResult.current.allowed).toBe(false);
    });
  });
});
