/**
 * Pure domain BillingWebhookHandler & Audit Record Emitter.
 * Processes webhook events, executes lifecycle state changes, and records tamper-evident audit records.
 * Conforms to Constitution Principle X (FR-010, SC-005) and Principle VII.
 */

import { type AuditRecord } from '../audit';
import { createSaaSAuditEvent } from './auditTypes';
import { LifecycleManager } from './lifecycleManager';
import type { TenantSubscription } from './types';

export interface WebhookPayload {
  eventId: string;
  eventType:
    | 'subscription.activated'
    | 'subscription.charged'
    | 'subscription.charge_failed'
    | 'subscription.cancelled'
    | 'subscription.upgraded';
  orgId: string;
  timestamp: string;
  data: {
    toPlanId?: string;
    toPlanVersion?: number;
    priceMonthlyPaise?: number;
    failureReason?: string;
    gatewayCustomerId?: string;
    gatewaySubscriptionId?: string;
  };
}

export interface WebhookProcessResult {
  updatedSubscription: TenantSubscription;
  auditRecord: AuditRecord;
}

export class BillingWebhookHandler {
  private lifecycleManager = new LifecycleManager();

  public processWebhook(
    currentSubscription: TenantSubscription,
    payload: WebhookPayload
  ): WebhookProcessResult {
    let updatedSubscription = { ...currentSubscription };
    let auditRecord: AuditRecord;

    switch (payload.eventType) {
      case 'subscription.upgraded': {
        const fromPlanId = currentSubscription.planId;
        const fromVersion = currentSubscription.planVersion;
        const toPlanId = payload.data.toPlanId ?? 'pro';
        const toPlanVersion = payload.data.toPlanVersion ?? 1;

        updatedSubscription = {
          ...currentSubscription,
          planId: toPlanId,
          planVersion: toPlanVersion,
          updatedAt: payload.timestamp,
        };

        auditRecord = createSaaSAuditEvent({
          orgId: currentSubscription.orgId,
          actorId: 'system_webhook',
          action: 'subscriptions.plan_changed',
          resourceId: currentSubscription.id,
          metadata: {
            fromPlanId,
            toPlanId,
            fromVersion,
            toVersion: toPlanVersion,
            billingCycle: currentSubscription.cycle,
            priceMonthlyPaise: payload.data.priceMonthlyPaise ?? 0,
          },
        });
        break;
      }

      case 'subscription.charge_failed': {
        const fromStatus = currentSubscription.status;
        updatedSubscription = this.lifecycleManager.handlePaymentFailure(currentSubscription);

        auditRecord = createSaaSAuditEvent({
          orgId: currentSubscription.orgId,
          actorId: 'system_webhook',
          action: 'subscriptions.status_changed',
          resourceId: currentSubscription.id,
          metadata: {
            fromStatus,
            toStatus: updatedSubscription.status,
            reason: payload.data.failureReason ?? 'PAYMENT_FAILED',
            gracePeriodEndsAt: updatedSubscription.gracePeriodEndsAt,
          },
        });
        break;
      }

      case 'subscription.charged':
      case 'subscription.activated': {
        const fromStatus = currentSubscription.status;
        updatedSubscription = this.lifecycleManager.handlePaymentSuccess(currentSubscription);

        auditRecord = createSaaSAuditEvent({
          orgId: currentSubscription.orgId,
          actorId: 'system_webhook',
          action: 'subscriptions.status_changed',
          resourceId: currentSubscription.id,
          metadata: {
            fromStatus,
            toStatus: 'active',
            gatewayCustomerId: payload.data.gatewayCustomerId,
            gatewaySubscriptionId: payload.data.gatewaySubscriptionId,
          },
        });
        break;
      }

      case 'subscription.cancelled': {
        const fromStatus = currentSubscription.status;
        updatedSubscription = this.lifecycleManager.requestCancellation(currentSubscription);

        auditRecord = createSaaSAuditEvent({
          orgId: currentSubscription.orgId,
          actorId: 'system_webhook',
          action: 'subscriptions.status_changed',
          resourceId: currentSubscription.id,
          metadata: {
            fromStatus,
            toStatus: updatedSubscription.status,
            cancelAtPeriodEnd: true,
          },
        });
        break;
      }

      default: {
        auditRecord = createSaaSAuditEvent({
          orgId: currentSubscription.orgId,
          actorId: 'system_webhook',
          action: 'subscriptions.status_changed',
          resourceId: currentSubscription.id,
          metadata: {
            unhandledEventType: payload.eventType,
          },
        });
      }
    }

    return { updatedSubscription, auditRecord };
  }
}
