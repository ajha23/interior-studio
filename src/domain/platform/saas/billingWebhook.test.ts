import { describe, expect, it } from 'vitest';
import { BillingWebhookHandler, type WebhookPayload } from './billingWebhook';
import type { TenantSubscription } from './types';

describe('BillingWebhookHandler & Tamper-Evident Audit Generation (US6, FR-010)', () => {
  const orgId = '88888888-8888-8888-8888-888888888888';

  const baseSubscription: TenantSubscription = {
    id: 'sub_wh_01',
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

  it('processes subscription.upgraded event and emits audit record', () => {
    const handler = new BillingWebhookHandler();

    const payload: WebhookPayload = {
      eventId: 'evt_upgrade_999',
      eventType: 'subscription.upgraded',
      orgId,
      timestamp: '2026-11-15T12:00:00.000Z',
      data: {
        toPlanId: 'pro',
        toPlanVersion: 1,
        priceMonthlyPaise: 1299900,
      },
    };

    const result = handler.processWebhook(baseSubscription, payload);

    expect(result.updatedSubscription.planId).toBe('pro');
    expect(result.auditRecord).toBeDefined();
    expect(result.auditRecord.eventFamily).toBe('commercial');
    expect(result.auditRecord.eventAction).toBe('subscriptions.plan_changed');
    expect(result.auditRecord.metadata.fromPlanId).toBe('starter');
    expect(result.auditRecord.metadata.toPlanId).toBe('pro');
  });

  it('processes payment failure event, sets past_due grace period, and audits status transition', () => {
    const handler = new BillingWebhookHandler();

    const payload: WebhookPayload = {
      eventId: 'evt_fail_123',
      eventType: 'subscription.charge_failed',
      orgId,
      timestamp: '2026-11-01T10:00:00.000Z',
      data: {
        failureReason: 'INSUFFICIENT_FUNDS',
      },
    };

    const result = handler.processWebhook(baseSubscription, payload);

    expect(result.updatedSubscription.status).toBe('past_due');
    expect(result.updatedSubscription.gracePeriodEndsAt).toBeDefined();

    expect(result.auditRecord.eventAction).toBe('subscriptions.status_changed');
    expect(result.auditRecord.metadata.fromStatus).toBe('active');
    expect(result.auditRecord.metadata.toStatus).toBe('past_due');
  });

  it('processes under 500ms (SC-005)', () => {
    const handler = new BillingWebhookHandler();
    const payload: WebhookPayload = {
      eventId: 'evt_perf',
      eventType: 'subscription.charged',
      orgId,
      timestamp: new Date().toISOString(),
      data: {},
    };

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      handler.processWebhook(baseSubscription, payload);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 50;

    expect(avgMs).toBeLessThan(10);
  });
});
