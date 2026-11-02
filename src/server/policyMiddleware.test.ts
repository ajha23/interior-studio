import { describe, expect, it } from 'vitest';
import { withPolicyGuard, type PolicyGuardOptions } from './policyMiddleware';
import { SubscriptionCatalog } from '@/domain/platform/saas/subscriptionCatalog';
import type { TenantSubscription, TenantUsageQuota } from '@/domain/platform/saas/types';
import type { ActorContext } from '@/domain/platform/authorization/types';

describe('withPolicyGuard server middleware', () => {
  const catalog = new SubscriptionCatalog();
  const orgId = '22222222-2222-2222-2222-222222222222';
  const userId = 'usr_test_1';

  const starterSub: TenantSubscription = {
    id: 'sub_1',
    orgId,
    planId: 'starter',
    planVersion: 1,
    cycle: 'monthly',
    status: 'active',
    currentPeriodStart: '2026-11-01T00:00:00.000Z',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    gracePeriodEndsAt: null,
    cancelAtPeriodEnd: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const proSub: TenantSubscription = {
    ...starterSub,
    planId: 'pro',
  };

  const designerActor: ActorContext = {
    id: userId,
    orgId,
    roles: [
      {
        roleId: 'designer',
        permissions: [
          { permissionId: 'designs:export', scopeType: 'all_projects' },
          { permissionId: 'projects:read', scopeType: 'all_projects' },
        ],
      },
    ],
  };

  const quotas: TenantUsageQuota[] = [
    {
      id: 'q1',
      orgId,
      quotaKey: 'quota.renderings.monthly.max',
      periodAnchor: '2026-11-01',
      consumedCount: 50,
      reservedCount: 0,
      effectiveLimit: 50,
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  it('returns 401 when actor or tenant context is missing', async () => {
    const options: PolicyGuardOptions = {
      featureKey: 'feature.design.3d.render',
      catalog,
      resolveActor: () => null,
      resolveSubscription: () => starterSub,
    };

    const handler = withPolicyGuard(options)(async () => new Response('OK'));
    const req = new Request('https://api.interiorstudio.in/render');
    const res = await handler(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('returns 403 when subscription does not entitle the requested feature', async () => {
    // Starter does not have CAD export
    const options: PolicyGuardOptions = {
      featureKey: 'feature.design.3d.export_cad',
      catalog,
      resolveActor: () => designerActor,
      resolveSubscription: () => starterSub,
    };

    const handler = withPolicyGuard(options)(async () => new Response('OK'));
    const req = new Request('https://api.interiorstudio.in/export-cad');
    const res = await handler(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
    expect(body.reason).toBe('SUBSCRIPTION_UNENTITLED');
    expect(body.requiredUpgradeTier).toBe('pro');
  });

  it('returns 403 when user lacks RBAC permission', async () => {
    const options: PolicyGuardOptions = {
      permission: 'billing:manage',
      catalog,
      resolveActor: () => designerActor, // Designer lacks billing:manage
      resolveSubscription: () => proSub,
    };

    const handler = withPolicyGuard(options)(async () => new Response('OK'));
    const req = new Request('https://api.interiorstudio.in/billing');
    const res = await handler(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
    expect(body.reason).toBe('RBAC_PERMISSION_DENIED');
  });

  it('returns 402 Payment Required when quota is exhausted', async () => {
    const options: PolicyGuardOptions = {
      quotaMetric: { key: 'quota.renderings.monthly.max', amount: 1 },
      catalog,
      resolveActor: () => designerActor,
      resolveSubscription: () => starterSub,
      resolveQuotas: () => quotas,
    };

    const handler = withPolicyGuard(options)(async () => new Response('OK'));
    const req = new Request('https://api.interiorstudio.in/render');
    const res = await handler(req);

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_REQUIRED');
    expect(body.reason).toBe('QUOTA_EXCEEDED');
  });

  it('executes handler and returns 200 when all policy checks succeed', async () => {
    const options: PolicyGuardOptions = {
      featureKey: 'feature.design.3d.export_cad',
      permission: 'designs:export',
      catalog,
      resolveActor: () => designerActor,
      resolveSubscription: () => proSub,
    };

    const handler = withPolicyGuard(options)(async () => new Response(JSON.stringify({ success: true })));
    const req = new Request('https://api.interiorstudio.in/export-cad');
    const res = await handler(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
