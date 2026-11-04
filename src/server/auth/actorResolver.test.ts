// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveVerifiedActor } from './actorResolver';
import { signJwtHs256 } from './jwtVerifier';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';

describe('Verified Actor Resolver (Feature 034.2.1)', () => {
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';
  const user1 = 'user_valid_123';
  const testSecret = 'secure_actor_resolver_secret_key_999';

  const defaultMembershipLookup = async (userId: string, orgId: string) => {
    if (userId === user1 && orgId === orgA) {
      return {
        userId,
        orgId,
        status: 'active' as const,
        roles: [{ roleId: 'role_architect', permissions: [{ permissionId: 'projects:read', scopeType: 'all_projects' as const }] }],
      };
    }
    return null;
  };

  it('resolves actor correctly from cryptographically verified Bearer JWT with active membership', async () => {
    const token = await signJwtHs256({
      sub: user1,
      org_id: orgA,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, testSecret);

    const req = new Request('http://localhost/api/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const actor = await resolveVerifiedActor(req, {
      jwtSecret: testSecret,
      membershipLookup: defaultMembershipLookup,
    });
    expect(actor).not.toBeNull();
    expect(actor?.id).toBe(user1);
    expect(actor?.orgId).toBe(orgA);
    expect(actor?.roles[0]?.roleId).toBe('role_architect');
  });

  it('fails closed when jwtSecret is not configured', async () => {
    const token = await signJwtHs256({
      sub: user1,
      org_id: orgA,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, testSecret);

    const req = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(
      resolveVerifiedActor(req, {
        jwtSecret: undefined,
        membershipLookup: defaultMembershipLookup,
      })
    ).rejects.toThrow(CloudPersistenceError);
  });

  it('fails closed when membershipLookup is missing for cloud bearer tokens', async () => {
    const token = await signJwtHs256({
      sub: user1,
      org_id: orgA,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, testSecret);

    const req = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(
      resolveVerifiedActor(req, {
        jwtSecret: testSecret,
        membershipLookup: undefined,
      })
    ).rejects.toThrow('Active organization membership lookup is required');
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
    const token = await signJwtHs256({
      sub: user1,
      org_id: orgA,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, testSecret);

    const req = new Request('http://localhost/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const membershipLookup = async (_userId: string, _orgId: string) => ({
      userId: user1,
      orgId: orgA,
      status: 'suspended' as const,
      roles: [],
    });

    await expect(
      resolveVerifiedActor(req, {
        jwtSecret: testSecret,
        membershipLookup,
      })
    ).rejects.toThrow(CloudPersistenceError);
  });

  it('prevents cross-tenant spoofing when token belongs to different org', async () => {
    const token = await signJwtHs256({
      sub: user1,
      org_id: orgB, // token claim is orgB
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, testSecret);

    const req = new Request('http://localhost/api/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': orgA, // requesting orgA
      },
    });

    await expect(
      resolveVerifiedActor(req, {
        jwtSecret: testSecret,
        membershipLookup: defaultMembershipLookup,
      })
    ).rejects.toThrow('Token tenant claim does not match requested organization');
  });
});
