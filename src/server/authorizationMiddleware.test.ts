// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  authorizeRequest,
  withAuthorization,
} from './authorizationMiddleware';
import type { ActorContext } from '@/domain/platform/authorization/types';

describe('Server Authorization Middleware (Universal Deny-by-Default)', () => {
  const actorGlobal: ActorContext = {
    id: 'user_admin_01',
    orgId: 'org_inhouse_01',
    roles: [
      {
        roleId: 'role_admin',
        status: 'active',
        permissions: [{ permissionId: 'designs.3d.export', scopeType: 'all_projects' }],
      },
    ],
  };

  const actorScoped: ActorContext = {
    id: 'user_contractor_01',
    orgId: 'org_inhouse_01',
    roles: [
      {
        roleId: 'role_drafter',
        status: 'active',
        permissions: [{ permissionId: 'designs.3d.export', scopeType: 'assigned_projects' }],
      },
    ],
  };

  const dummyHandler = async (_req: Request) =>
    new Response(JSON.stringify({ ok: true, data: 'exported_3d_model' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('rejects with 401 Unauthorized when actor cannot be resolved', async () => {
    const handler = withAuthorization(dummyHandler, {
      permission: 'designs.3d.export',
      resolveActor: () => null,
    });

    const req = new Request('http://localhost/api/export-3d', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('unauthorized');
  });

  it('rejects with 403 Forbidden when actor lacks the required permission', async () => {
    const unauthorizedActor: ActorContext = {
      id: 'user_viewer_01',
      orgId: 'org_inhouse_01',
      roles: [
        {
          roleId: 'role_viewer',
          status: 'active',
          permissions: [{ permissionId: 'designs.2d.view', scopeType: 'all_projects' }],
        },
      ],
    };

    const handler = withAuthorization(dummyHandler, {
      permission: 'designs.3d.export',
      resolveActor: () => unauthorizedActor,
    });

    const req = new Request('http://localhost/api/export-3d', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('forbidden');
    expect(json.error.missingPermissions).toContain('designs.3d.export');
  });

  it('rejects with 403 Forbidden when scoped actor is not assigned to the requested resource', async () => {
    const handler = withAuthorization(dummyHandler, {
      permission: 'designs.3d.export',
      resolveActor: () => actorScoped,
      getResourceContext: () => ({
        projectId: 'project_secret_villa',
        assignedUserIds: ['user_other_designer'],
      }),
    });

    const req = new Request('http://localhost/api/export-3d', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('forbidden');
    expect(json.error.reason).toContain('Insufficient resource scope');
  });

  it('allows access (200 OK) when actor has all_projects scope', async () => {
    const handler = withAuthorization(dummyHandler, {
      permission: 'designs.3d.export',
      resolveActor: () => actorGlobal,
      getResourceContext: () => ({
        projectId: 'project_any',
      }),
    });

    const req = new Request('http://localhost/api/export-3d', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toBe('exported_3d_model');
  });

  it('allows access (200 OK) when scoped actor is assigned to the resource', async () => {
    const handler = withAuthorization(dummyHandler, {
      permission: 'designs.3d.export',
      resolveActor: () => actorScoped,
      getResourceContext: () => ({
        projectId: 'project_assigned_01',
        assignedUserIds: ['user_contractor_01', 'user_lead_01'],
      }),
    });

    const req = new Request('http://localhost/api/export-3d', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('supports direct authorizeRequest helper', async () => {
    const authResult = await authorizeRequest(
      new Request('http://localhost/api/test'),
      'designs.3d.export',
      { projectId: 'project_assigned_01', assignedUserIds: ['user_contractor_01'] },
      () => actorScoped
    );

    expect(authResult.authorized).toBe(true);
    if (authResult.authorized) {
      expect(authResult.actor.id).toBe('user_contractor_01');
    }
  });
});
