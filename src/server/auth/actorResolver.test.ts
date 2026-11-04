// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveVerifiedActor } from './actorResolver';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';

function createMockJwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.signature`;
}

describe('Verified Actor Resolver (Feature 034.1 FR-01)', () => {
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';
  const user1 = 'user_valid_123';

  it('resolves actor correctly from valid Bearer JWT', async () => {
    const token = createMockJwt({
      sub: user1,
      org_id: orgA,
      roles: [{ roleId: 'role_architect', permissions: [{ permissionId: 'projects:read', scopeType: 'all_projects' }] }],
    });

    const req = new Request('http://localhost/api/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const actor = await resolveVerifiedActor(req);
    expect(actor).not.toBeNull();
    expect(actor?.id).toBe(user1);
    expect(actor?.orgId).toBe(orgA);
    expect(actor?.roles[0]?.roleId).toBe('role_architect');
  });

  it('rejects unverified caller-supplied identity headers by default', async () => {
    const req = new Request('http://localhost/api/projects', {
      headers: {
        'x-user-id': 'forged_user',
        'x-org-id': orgA,
        'x-user-roles': JSON.stringify([{ roleId: 'super_admin' }]),
      },
    });

    const actor = await resolveVerifiedActor(req);
    expect(actor).toBeNull();
  });

  it('verifies active organization membership and rejects inactive/suspended members', async () => {
    const token = createMockJwt({ sub: user1, org_id: orgA });
    const req = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Lookup returns suspended status
    const membershipLookup = async (_userId: string, _orgId: string) => ({
      userId: user1,
      orgId: orgA,
      status: 'suspended' as const,
      roles: [],
    });

    await expect(
      resolveVerifiedActor(req, { membershipLookup })
    ).rejects.toThrow(CloudPersistenceError);
  });

  it('allows active member from verified database lookup', async () => {
    const token = createMockJwt({ sub: user1, org_id: orgA });
    const req = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const membershipLookup = async () => ({
      userId: user1,
      orgId: orgA,
      status: 'active' as const,
      roles: [{ roleId: 'designer', permissions: [{ permissionId: 'designs:edit', scopeType: 'assigned_projects' as const }] }],
    });

    const actor = await resolveVerifiedActor(req, { membershipLookup });
    expect(actor).not.toBeNull();
    expect(actor?.id).toBe(user1);
    expect(actor?.orgId).toBe(orgA);
    expect(actor?.roles[0]?.roleId).toBe('designer');
  });

  it('prevents cross-tenant spoofing when token belongs to different org', async () => {
    const token = createMockJwt({ sub: user1, org_id: orgB }); // token is for orgB
    const req = new Request('http://localhost/api/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': orgA, // trying to access orgA
      },
    });

    // Membership lookup for user in orgA returns null
    const membershipLookup = async (_userId: string, orgId: string) => {
      if (orgId === orgB) {
        return { userId: user1, orgId: orgB, status: 'active' as const, roles: [] };
      }
      return null;
    };

    await expect(
      resolveVerifiedActor(req, { membershipLookup })
    ).rejects.toThrow(CloudPersistenceError);
  });

  it('cryptographically verifies JWT when secret is configured', async () => {
    const { signJwtHs256 } = await import('./jwtVerifier');
    const secret = 'test_secret_12345';
    const validToken = await signJwtHs256({ sub: user1, org_id: orgA }, secret);

    const reqValid = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const actor = await resolveVerifiedActor(reqValid, { jwtSecret: secret });
    expect(actor?.id).toBe(user1);

    // Tampered token must fail
    const parts = validToken.split('.');
    const tampered = `${parts[0]}.eyBzdWIiOiAiaGFja2VyIiB9.${parts[2]}`;
    const reqTampered = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${tampered}` },
    });

    await expect(resolveVerifiedActor(reqTampered, { jwtSecret: secret })).rejects.toThrow(CloudPersistenceError);
  });
});
