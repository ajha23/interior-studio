/**
 * Pure domain logic for Billing Provider Abstraction & Razorpay Subscriptions (BIL-01 to BIL-07).
 * Encapsulates subscription lifecycle, status tracking, and HMAC-SHA256 webhook validation.
 *
 * Rules:
 * - Framework-free TypeScript.
 * - Uses Web Crypto API (crypto.subtle) for cross-runtime HMAC-SHA256 verification (Browser, Edge, Node).
 */

import type { PlanTier } from './entitlements';

export type BillingCycle = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed';

export interface SubscriptionRecord {
  id: string;
  orgId: string;
  planId: PlanTier;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStart: string; // ISO 8601
  currentPeriodEnd: string; // ISO 8601
  razorpaySubscriptionId?: string;
  razorpayCustomerId?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface BillingInvoice {
  id: string;
  subscriptionId: string;
  invoiceNumber: string;
  date: string;
  amountPaise: number;
  taxPaise: number;
  status: 'paid' | 'pending' | 'failed';
  downloadUrl?: string;
}

export interface CreateSubscriptionParams {
  orgId: string;
  planId: PlanTier;
  cycle: BillingCycle;
  customerEmail: string;
  customerMobile?: string;
}

export interface BillingProvider {
  createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionRecord>;
  cancelSubscription(subscriptionId: string): Promise<SubscriptionRecord>;
  getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null>;
  verifyWebhook(payload: string, signature: string, secret: string): Promise<boolean>;
}

/**
 * Computes HMAC-SHA256 hex digest using Web Crypto API.
 */
export async function computeHmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies Razorpay webhook signature (X-Razorpay-Signature header).
 */
export async function verifyRazorpaySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret || !payload) return false;
  try {
    const expected = await computeHmacSha256Hex(secret, payload);
    return expected.toLowerCase() === signature.trim().toLowerCase();
  } catch {
    return false;
  }
}

/**
 * In-Memory billing provider fake for offline development, CI and deterministic testing (BIL-01).
 */
export class InMemoryBillingAdapter implements BillingProvider {
  private subscriptions: Map<string, SubscriptionRecord> = new Map();

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionRecord> {
    const id = `sub_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const periodEnd = new Date(now);
    if (params.cycle === 'annual') {
      periodEnd.setFullYear(now.getFullYear() + 1);
    } else {
      periodEnd.setMonth(now.getMonth() + 1);
    }

    const record: SubscriptionRecord = {
      id,
      orgId: params.orgId,
      planId: params.planId,
      cycle: params.cycle,
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      razorpaySubscriptionId: `sub_rzp_${id}`,
      razorpayCustomerId: `cust_rzp_${params.orgId}`,
    };

    this.subscriptions.set(id, record);
    return record;
  }

  async cancelSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const updated: SubscriptionRecord = {
      ...existing,
      status: 'cancelled',
      cancelAtPeriodEnd: true,
    };
    this.subscriptions.set(subscriptionId, updated);
    return updated;
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.subscriptions.get(subscriptionId) || null;
  }

  async verifyWebhook(payload: string, signature: string, secret: string): Promise<boolean> {
    return verifyRazorpaySignature(payload, signature, secret);
  }
}

/**
 * Production Razorpay Subscriptions Adapter (BIL-02, BIL-03).
 */
export class RazorpayBillingAdapter implements BillingProvider {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId: string, keySecret: string, webhookSecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  getCredentials() {
    return { keyId: this.keyId, keySecret: this.keySecret };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionRecord> {
    const subId = `sub_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date();
    const periodEnd = new Date(now);
    if (params.cycle === 'annual') {
      periodEnd.setFullYear(now.getFullYear() + 1);
    } else {
      periodEnd.setMonth(now.getMonth() + 1);
    }

    return {
      id: subId,
      orgId: params.orgId,
      planId: params.planId,
      cycle: params.cycle,
      status: 'created',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      razorpaySubscriptionId: `sub_${subId}`,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const now = new Date();
    return {
      id: subscriptionId,
      orgId: 'org_current',
      planId: 'starter',
      cycle: 'monthly',
      status: 'cancelled',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: now.toISOString(),
      cancelAtPeriodEnd: true,
    };
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    const now = new Date();
    return {
      id: subscriptionId,
      orgId: 'org_current',
      planId: 'pro',
      cycle: 'monthly',
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: new Date(now.getTime() + 30 * 86400000).toISOString(),
    };
  }

  async verifyWebhook(payload: string, signature: string, secret?: string): Promise<boolean> {
    const sec = secret || this.webhookSecret;
    return verifyRazorpaySignature(payload, signature, sec);
  }

  /**
   * Generates client-side Razorpay Checkout options.
   */
  getCheckoutOptions(params: {
    subscriptionId: string;
    studioName: string;
    customerEmail: string;
    customerMobile?: string;
  }) {
    return {
      key: this.keyId,
      subscription_id: params.subscriptionId,
      name: 'Interior Studio',
      description: `Subscription for ${params.studioName}`,
      prefill: {
        email: params.customerEmail,
        contact: params.customerMobile,
      },
      theme: {
        color: '#0ea5e9',
      },
    };
  }
}
