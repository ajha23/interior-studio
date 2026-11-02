import { describe, expect, it } from 'vitest';
import { UsageQuotaManager } from './quotaManager';

describe('UsageQuotaManager (Atomic Concurrency-Safe Reservations)', () => {
  const orgId = '44444444-4444-4444-4444-444444444444';
  const quotaKey = 'quota.projects.active.max';

  it('reserves quota atomically when within limits', async () => {
    const manager = new UsageQuotaManager();
    manager.setQuotaLimit(orgId, quotaKey, 15);

    const result = await manager.reserveQuota(orgId, quotaKey, 1);
    expect(result.success).toBe(true);
    expect(result.reservationId).toBeDefined();
    expect(result.remainingQuota).toBe(14);

    const status = await manager.getQuotaRemaining(orgId, quotaKey);
    expect(status.consumed).toBe(0);
    expect(status.reserved).toBe(1);
    expect(status.remaining).toBe(14);
  });

  it('commits reserved quota upon operation completion', async () => {
    const manager = new UsageQuotaManager();
    manager.setQuotaLimit(orgId, quotaKey, 15);

    const reservation = await manager.reserveQuota(orgId, quotaKey, 1);
    expect(reservation.success).toBe(true);

    await manager.commitQuota(reservation.reservationId!);

    const status = await manager.getQuotaRemaining(orgId, quotaKey);
    expect(status.consumed).toBe(1);
    expect(status.reserved).toBe(0);
    expect(status.remaining).toBe(14);
  });

  it('releases reserved quota if operation fails or aborts', async () => {
    const manager = new UsageQuotaManager();
    manager.setQuotaLimit(orgId, quotaKey, 15);

    const reservation = await manager.reserveQuota(orgId, quotaKey, 1);
    expect(reservation.success).toBe(true);

    await manager.releaseQuota(reservation.reservationId!);

    const status = await manager.getQuotaRemaining(orgId, quotaKey);
    expect(status.consumed).toBe(0);
    expect(status.reserved).toBe(0);
    expect(status.remaining).toBe(15);
  });

  it('rejects reservation when quota is exhausted', async () => {
    const manager = new UsageQuotaManager();
    manager.setQuotaLimit(orgId, quotaKey, 2);

    const res1 = await manager.reserveQuota(orgId, quotaKey, 1);
    const res2 = await manager.reserveQuota(orgId, quotaKey, 1);
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    // 3rd request should fail
    const res3 = await manager.reserveQuota(orgId, quotaKey, 1);
    expect(res3.success).toBe(false);
    expect(res3.reason).toBe('QUOTA_EXCEEDED');
    expect(res3.remainingQuota).toBe(0);
  });

  it('prevents over-allocation under concurrent parallel requests (SC-004)', async () => {
    const manager = new UsageQuotaManager();
    // Only 3 seats left
    manager.setQuotaLimit(orgId, 'quota.seats.designers.max', 3);

    // Launch 10 concurrent reservation requests
    const promises = Array.from({ length: 10 }).map(() =>
      manager.reserveQuota(orgId, 'quota.seats.designers.max', 1)
    );

    const results = await Promise.all(promises);
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    expect(successful.length).toBe(3);
    expect(failed.length).toBe(7);

    const finalStatus = await manager.getQuotaRemaining(orgId, 'quota.seats.designers.max');
    expect(finalStatus.remaining).toBe(0);
    expect(finalStatus.reserved).toBe(3);
  });

  it('allows unlimited consumption when limit is -1', async () => {
    const manager = new UsageQuotaManager();
    manager.setQuotaLimit(orgId, quotaKey, -1);

    const res = await manager.reserveQuota(orgId, quotaKey, 100);
    expect(res.success).toBe(true);
    expect(res.remainingQuota).toBe(-1);
  });

  it('supports mid-cycle quota delta upgrades (Clarification 4)', async () => {
    const manager = new UsageQuotaManager();
    // Starter: 50 renders
    manager.setQuotaLimit(orgId, 'quota.renderings.monthly.max', 50);
    const r1 = await manager.reserveQuota(orgId, 'quota.renderings.monthly.max', 30);
    await manager.commitQuota(r1.reservationId!);

    // Upgraded mid-cycle to Pro (200 renders) -> delta is +150
    manager.applyQuotaDelta(orgId, 'quota.renderings.monthly.max', 150);

    const status = await manager.getQuotaRemaining(orgId, 'quota.renderings.monthly.max');
    expect(status.limit).toBe(200);
    expect(status.consumed).toBe(30);
    expect(status.remaining).toBe(170);
  });
});
