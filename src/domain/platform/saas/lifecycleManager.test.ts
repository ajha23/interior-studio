import { describe, expect, it } from 'vitest';
import { LifecycleManager } from './lifecycleManager';
import type { TenantSubscription } from './types';

describe('LifecycleManager (Subscription State Machine & Grace Policies)', () => {
  const orgId = '66666666-6666-6666-6666-666666666666';

  const baseSubscription: TenantSubscription = {
    id: 'sub_lifecycle',
    orgId,
    planId: 'pro',
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

  it('transitions from active to past_due with 7-day grace period on payment failure', () => {
    const manager = new LifecycleManager();
    const updated = manager.handlePaymentFailure(baseSubscription);

    expect(updated.status).toBe('past_due');
    expect(updated.gracePeriodEndsAt).toBeDefined();

    // 7 days from now
    const graceEnd = new Date(updated.gracePeriodEndsAt!).getTime();
    const expected = Date.now() + 7 * 86400000;
    expect(Math.abs(graceEnd - expected)).toBeLessThan(5000);
  });

  it('transitions from past_due to paused when grace period lapses', () => {
    const manager = new LifecycleManager();
    const pastDueSub: TenantSubscription = {
      ...baseSubscription,
      status: 'past_due',
      gracePeriodEndsAt: new Date(Date.now() - 1000).toISOString(), // Lapsed
    };

    const evaluated = manager.evaluateLifecycleState(pastDueSub);
    expect(evaluated.status).toBe('paused');
  });

  it('transitions from past_due to active upon successful payment recovery', () => {
    const manager = new LifecycleManager();
    const pastDueSub: TenantSubscription = {
      ...baseSubscription,
      status: 'past_due',
      gracePeriodEndsAt: new Date(Date.now() + 4 * 86400000).toISOString(),
    };

    const recovered = manager.handlePaymentSuccess(pastDueSub);
    expect(recovered.status).toBe('active');
    expect(recovered.gracePeriodEndsAt).toBeNull();
  });

  it('marks subscription for cancellation at period end', () => {
    const manager = new LifecycleManager();
    const cancelled = manager.requestCancellation(baseSubscription);

    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect(cancelled.status).toBe('cancelled_at_period_end');
  });

  it('transitions cancelled subscription to expired once period end arrives', () => {
    const manager = new LifecycleManager();
    const cancelledPastPeriod: TenantSubscription = {
      ...baseSubscription,
      status: 'cancelled_at_period_end',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() - 5000).toISOString(), // Expired
    };

    const evaluated = manager.evaluateLifecycleState(cancelledPastPeriod);
    expect(evaluated.status).toBe('expired');
  });

  it('determines access modes accurately across lifecycle states', () => {
    const manager = new LifecycleManager();

    expect(manager.getAccessMode('active')).toBe('read_write');
    expect(manager.getAccessMode('trial')).toBe('read_write');
    expect(manager.getAccessMode('past_due')).toBe('read_write'); // in grace
    expect(manager.getAccessMode('paused')).toBe('read_only');
    expect(manager.getAccessMode('expired')).toBe('read_only_export'); // DPDP retention
    expect(manager.getAccessMode('unpaid')).toBe('blocked');
  });
});
