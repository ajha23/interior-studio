import { describe, expect, it } from 'vitest';
import { PolicyEvaluationEngine, type UserRoleInput } from './policyEngine';
import { SubscriptionCatalog } from './subscriptionCatalog';
import type {
  PolicyEvaluationContext,
  TenantSubscription,
  TenantUsageQuota,
} from './types';

describe('PolicyEvaluationEngine (Unified Access Check)', () => {
  const catalog = new SubscriptionCatalog();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const userId = 'user_designer_01';

  const starterSubscription: TenantSubscription = {
    id: 'sub_starter_01',
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

  const proSubscription: TenantSubscription = {
    ...starterSubscription,
    id: 'sub_pro_01',
    planId: 'pro',
  };

  const activeQuotas: TenantUsageQuota[] = [
    {
      id: 'quota_projects_01',
      orgId,
      quotaKey: 'quota.projects.active.max',
      periodAnchor: '2026-11-01',
      consumedCount: 15,
      reservedCount: 0,
      effectiveLimit: 15,
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'quota_renders_01',
      orgId,
      quotaKey: 'quota.renderings.monthly.max',
      periodAnchor: '2026-11-01',
      consumedCount: 30,
      reservedCount: 5,
      effectiveLimit: 50,
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  const designerRoles: UserRoleInput[] = [
    {
      roleId: 'designer',
      scopeType: 'all_projects',
    },
  ];

  it('rejects with TENANT_SUBSCRIPTION_NOT_FOUND if subscription is missing', () => {
    const engine = new PolicyEvaluationEngine(catalog, undefined, designerRoles);
    const context: PolicyEvaluationContext = {
      orgId,
      userId,
      featureKey: 'feature.design.3d.render',
    };

    const result = engine.evaluatePolicySync(context);
    expect(result.allowed).toBe(false);
    expect(result.failedStage).toBe('tenant');
    expect(result.reason).toBe('TENANT_SUBSCRIPTION_NOT_FOUND');
  });

  it('rejects with SUBSCRIPTION_INACTIVE if subscription status is expired', () => {
    const expiredSub: TenantSubscription = {
      ...starterSubscription,
      status: 'expired',
    };
    const engine = new PolicyEvaluationEngine(catalog, expiredSub, designerRoles);
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      featureKey: 'feature.design.3d.render',
    });

    expect(result.allowed).toBe(false);
    expect(result.failedStage).toBe('subscription');
    expect(result.reason).toBe('SUBSCRIPTION_INACTIVE');
  });

  it('allows access during past_due within grace_period', () => {
    const graceSub: TenantSubscription = {
      ...starterSubscription,
      status: 'grace_period',
    };
    const engine = new PolicyEvaluationEngine(catalog, graceSub, designerRoles);
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      featureKey: 'feature.design.3d.render',
    });

    expect(result.allowed).toBe(true);
  });

  it('rejects unentitled feature and specifies required upgrade tier', () => {
    // Starter does NOT have CAD DXF export (requires Pro)
    const engine = new PolicyEvaluationEngine(catalog, starterSubscription, designerRoles);
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      featureKey: 'feature.design.3d.export_cad',
    });

    expect(result.allowed).toBe(false);
    expect(result.failedStage).toBe('subscription');
    expect(result.reason).toBe('SUBSCRIPTION_UNENTITLED');
    expect(result.requiredUpgradeTier).toBe('pro');
  });

  it('allows entitled feature on Pro plan', () => {
    const engine = new PolicyEvaluationEngine(catalog, proSubscription, designerRoles);
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      featureKey: 'feature.design.3d.export_cad',
    });

    expect(result.allowed).toBe(true);
  });

  it('rejects when RBAC permission is denied even if subscription is entitled', () => {
    // Viewer role lacks 'projects:delete'
    const viewerRoles: UserRoleInput[] = [{ roleId: 'viewer', scopeType: 'all_projects' }];
    const engine = new PolicyEvaluationEngine(catalog, proSubscription, viewerRoles);

    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      featureKey: 'feature.design.3d.export_cad',
      permissionId: 'projects:delete',
    });

    expect(result.allowed).toBe(false);
    expect(result.failedStage).toBe('rbac');
    expect(result.reason).toBe('RBAC_PERMISSION_DENIED');
  });

  it('rejects when resource scope is violated for assigned_projects', () => {
    const assignedRoles: UserRoleInput[] = [
      {
        roleId: 'designer',
        scopeType: 'assigned_projects',
      },
    ];
    const engine = new PolicyEvaluationEngine(catalog, proSubscription, assignedRoles);

    // User is NOT in assignedUserIds of project
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      permissionId: 'projects:edit',
      resource: {
        projectId: 'proj_alpha',
        assignedUserIds: ['user_other_designer'],
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.failedStage).toBe('scope');
    expect(result.reason).toBe('RESOURCE_OUT_OF_SCOPE');
  });

  it('rejects when quantitative quota limit is reached (QUOTA_EXCEEDED)', () => {
    const engine = new PolicyEvaluationEngine(
      catalog,
      starterSubscription,
      designerRoles,
      [],
      activeQuotas
    );

    // 15 / 15 projects already consumed; requesting 1 more
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      quotaMetric: {
        key: 'quota.projects.active.max',
        amount: 1,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.failedStage).toBe('quota');
    expect(result.reason).toBe('QUOTA_EXCEEDED');
    expect(result.quotaRemaining).toBe(0);
    expect(result.requiredUpgradeTier).toBe('pro');
  });

  it('allows operation when all 6 terms succeed with remaining quota', () => {
    const engine = new PolicyEvaluationEngine(
      catalog,
      starterSubscription,
      designerRoles,
      [],
      activeQuotas
    );

    // Rendering credits: consumed 30 + reserved 5 = 35 / 50 limit. Requesting 5 renders
    const result = engine.evaluatePolicySync({
      orgId,
      userId,
      featureKey: 'feature.design.3d.render',
      permissionId: 'projects:view',
      resource: {
        projectId: 'proj_alpha',
      },
      quotaMetric: {
        key: 'quota.renderings.monthly.max',
        amount: 5,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.quotaRemaining).toBe(15);
  });

  it('executes in under 5 milliseconds (SC-001 in-memory benchmark)', async () => {
    const engine = new PolicyEvaluationEngine(
      catalog,
      proSubscription,
      designerRoles,
      [],
      activeQuotas
    );

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      engine.evaluatePolicySync({
        orgId,
        userId,
        featureKey: 'feature.design.3d.export_cad',
        permissionId: 'projects:view',
      });
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 100;

    expect(avgMs).toBeLessThan(5);
  });
});
