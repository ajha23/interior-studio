import { describe, expect, it } from 'vitest';
import {
  computeHmacSha256Hex,
  InMemoryBillingAdapter,
  RazorpayBillingAdapter,
  verifyRazorpaySignature,
} from './billing';

describe('Billing Engine & Razorpay Verification (BIL-01..03)', () => {
  it('InMemoryBillingAdapter creates, retrieves, and cancels subscriptions', async () => {
    const adapter = new InMemoryBillingAdapter();
    const sub = await adapter.createSubscription({
      orgId: 'org_test_123',
      planId: 'pro',
      cycle: 'monthly',
      customerEmail: 'studio@example.com',
    });

    expect(sub.id).toContain('sub_mock_');
    expect(sub.planId).toBe('pro');
    expect(sub.status).toBe('active');
    expect(sub.cycle).toBe('monthly');

    const fetched = await adapter.getSubscription(sub.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(sub.id);

    const cancelled = await adapter.cancelSubscription(sub.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
  });

  it('verifies HMAC-SHA256 signature correctly', async () => {
    const secret = 'rzp_wh_secret_xyz123';
    const payload = JSON.stringify({
      event: 'subscription.charged',
      payload: {
        subscription: { id: 'sub_test_01', status: 'active' },
      },
    });

    const validSignature = await computeHmacSha256Hex(secret, payload);
    expect(typeof validSignature).toBe('string');
    expect(validSignature.length).toBe(64); // SHA-256 hex is 64 chars

    const isValid = await verifyRazorpaySignature(payload, validSignature, secret);
    expect(isValid).toBe(true);

    const isTampered = await verifyRazorpaySignature(
      payload + 'tampered',
      validSignature,
      secret
    );
    expect(isTampered).toBe(false);

    const isBadSecret = await verifyRazorpaySignature(
      payload,
      validSignature,
      'wrong_secret'
    );
    expect(isBadSecret).toBe(false);
  });

  it('RazorpayBillingAdapter generates client checkout options', () => {
    const adapter = new RazorpayBillingAdapter('rzp_test_key_01', 'sec_01', 'wh_sec_01');
    const opts = adapter.getCheckoutOptions({
      subscriptionId: 'sub_123',
      studioName: 'Mihir Interiors',
      customerEmail: 'mihir@example.com',
      customerMobile: '9876543210',
    });

    expect(opts.key).toBe('rzp_test_key_01');
    expect(opts.subscription_id).toBe('sub_123');
    expect(opts.description).toContain('Mihir Interiors');
    expect(opts.prefill.email).toBe('mihir@example.com');
  });
});

