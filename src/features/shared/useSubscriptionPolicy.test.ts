import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSubscriptionPolicy } from './useSubscriptionPolicy';
import type { TenantSubscription, TenantUsageQuota } from '@/domain/platform/saas/types';
import type { ActorRole } from '@/domain/platform/authorization/types';

describe('useSubscriptionPolicy React hook', () => {
  const orgId = '33333333-3333-3333-3333-333333333333';
  const userId = 'usr_designer_1';

  const mockStarterSub: TenantSubscription = {
    id: 'sub_starter',
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

  const mockRoles: ActorRole[] = [
    {
      roleId: 'designer',
      permissions: [
        { permissionId: 'projects:read', scopeType: 'all_projects' },
        { permissionId: 'projects:write', scopeType: 'all_projects' },
      ],
    },
  ];

  const mockQuotas: TenantUsageQuota[] = [
    {
      id: 'q_render',
      orgId,
      quotaKey: 'quota.renderings.monthly.max',
      periodAnchor: '2026-11-01',
      consumedCount: 50,
      reservedCount: 0,
      effectiveLimit: 50,
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  it('evaluates permitted feature correctly on starter plan', () => {
    const { result } = renderHook(() =>
      useSubscriptionPolicy({
        featureKey: 'feature.design.3d.render',
        subscription: mockStarterSub,
        roles: mockRoles,
        userId,
        orgId,
      })
    );

    expect(result.current.allowed).toBe(true);
    expect(result.current.isEntitled).toBe(true);
  });

  it('identifies unentitled feature and specifies required upgrade tier', () => {
    const { result } = renderHook(() =>
      useSubscriptionPolicy({
        featureKey: 'feature.design.3d.export_cad',
        subscription: mockStarterSub,
        roles: mockRoles,
        userId,
        orgId,
      })
    );

    expect(result.current.allowed).toBe(false);
    expect(result.current.isEntitled).toBe(false);
    expect(result.current.requiredUpgradeTier).toBe('pro');
    expect(result.current.reason).toBe('SUBSCRIPTION_UNENTITLED');
  });

  it('identifies denied RBAC permission', () => {
    const { result } = renderHook(() =>
      useSubscriptionPolicy({
        permission: 'billing:manage',
        subscription: mockStarterSub,
        roles: mockRoles,
        userId,
        orgId,
      })
    );

    expect(result.current.allowed).toBe(false);
    expect(result.current.isPermitted).toBe(false);
    expect(result.current.reason).toBe('RBAC_PERMISSION_DENIED');
  });

  it('identifies quota exhaustion', () => {
    const { result } = renderHook(() =>
      useSubscriptionPolicy({
        quotaMetric: { key: 'quota.renderings.monthly.max', amount: 1 },
        subscription: mockStarterSub,
        roles: mockRoles,
        quotas: mockQuotas,
        userId,
        orgId,
      })
    );

    expect(result.current.allowed).toBe(false);
    expect(result.current.isQuotaAvailable).toBe(false);
    expect(result.current.quotaRemaining).toBe(0);
    expect(result.current.reason).toBe('QUOTA_EXCEEDED');
  });
});
