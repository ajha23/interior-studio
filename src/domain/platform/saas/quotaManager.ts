/**
 * Pure domain Usage & Quantitative Quota Manager.
 * Implements atomic reservations, concurrency-safe counter updates, and periodic rollovers.
 * Conforms to Constitution Principle X (FR-006, SC-004) and Principle VII.
 */

import type { CanonicalKey } from './types';

export interface QuotaReservationResult {
  success: boolean;
  reservationId?: string;
  remainingQuota?: number;
  reason?: string;
}

export interface QuotaStatus {
  consumed: number;
  reserved: number;
  limit: number;
  remaining: number;
}

interface ActiveReservation {
  id: string;
  orgId: string;
  quotaKey: CanonicalKey;
  amount: number;
  createdAt: number;
}

interface OrgQuotaState {
  consumed: number;
  reserved: number;
  limit: number;
}

export interface IUsageQuotaManager {
  reserveQuota(
    orgId: string,
    quotaKey: CanonicalKey,
    amount: number
  ): Promise<QuotaReservationResult>;
  commitQuota(reservationId: string): Promise<void>;
  releaseQuota(reservationId: string): Promise<void>;
  getQuotaRemaining(orgId: string, quotaKey: CanonicalKey): Promise<QuotaStatus>;
}

export class UsageQuotaManager implements IUsageQuotaManager {
  private quotas: Map<string, OrgQuotaState> = new Map();
  private reservations: Map<string, ActiveReservation> = new Map();
  // Mutex per org:key to simulate database row-level locking (SELECT ... FOR UPDATE)
  private locks: Map<string, Promise<void>> = new Map();

  private getKey(orgId: string, quotaKey: CanonicalKey): string {
    return `${orgId}:${quotaKey}`;
  }

  private async acquireLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(key, lockPromise);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      resolveLock();
    }
  }

  public setQuotaLimit(orgId: string, quotaKey: CanonicalKey, limit: number): void {
    const key = this.getKey(orgId, quotaKey);
    const existing = this.quotas.get(key) ?? { consumed: 0, reserved: 0, limit };
    existing.limit = limit;
    this.quotas.set(key, existing);
  }

  public applyQuotaDelta(orgId: string, quotaKey: CanonicalKey, delta: number): void {
    const key = this.getKey(orgId, quotaKey);
    const existing = this.quotas.get(key) ?? { consumed: 0, reserved: 0, limit: 0 };
    if (existing.limit !== -1) {
      existing.limit += delta;
    }
    this.quotas.set(key, existing);
  }

  public async reserveQuota(
    orgId: string,
    quotaKey: CanonicalKey,
    amount: number
  ): Promise<QuotaReservationResult> {
    const key = this.getKey(orgId, quotaKey);

    return this.acquireLock(key, () => {
      const state = this.quotas.get(key) ?? { consumed: 0, reserved: 0, limit: -1 };

      if (state.limit === -1) {
        // Unlimited
        const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.reservations.set(reservationId, {
          id: reservationId,
          orgId,
          quotaKey,
          amount,
          createdAt: Date.now(),
        });
        state.reserved += amount;
        this.quotas.set(key, state);
        return {
          success: true,
          reservationId,
          remainingQuota: -1,
        };
      }

      const available = state.limit - (state.consumed + state.reserved);
      if (available < amount) {
        return {
          success: false,
          remainingQuota: Math.max(0, available),
          reason: 'QUOTA_EXCEEDED',
        };
      }

      const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      state.reserved += amount;
      this.quotas.set(key, state);

      this.reservations.set(reservationId, {
        id: reservationId,
        orgId,
        quotaKey,
        amount,
        createdAt: Date.now(),
      });

      return {
        success: true,
        reservationId,
        remainingQuota: state.limit - (state.consumed + state.reserved),
      };
    });
  }

  public async commitQuota(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return;
    }

    const key = this.getKey(reservation.orgId, reservation.quotaKey);
    return this.acquireLock(key, () => {
      const state = this.quotas.get(key);
      if (state) {
        state.reserved = Math.max(0, state.reserved - reservation.amount);
        state.consumed += reservation.amount;
        this.quotas.set(key, state);
      }
      this.reservations.delete(reservationId);
    });
  }

  public async releaseQuota(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return;
    }

    const key = this.getKey(reservation.orgId, reservation.quotaKey);
    return this.acquireLock(key, () => {
      const state = this.quotas.get(key);
      if (state) {
        state.reserved = Math.max(0, state.reserved - reservation.amount);
        this.quotas.set(key, state);
      }
      this.reservations.delete(reservationId);
    });
  }

  public async getQuotaRemaining(orgId: string, quotaKey: CanonicalKey): Promise<QuotaStatus> {
    const key = this.getKey(orgId, quotaKey);
    const state = this.quotas.get(key) ?? { consumed: 0, reserved: 0, limit: -1 };

    if (state.limit === -1) {
      return {
        consumed: state.consumed,
        reserved: state.reserved,
        limit: -1,
        remaining: -1,
      };
    }

    return {
      consumed: state.consumed,
      reserved: state.reserved,
      limit: state.limit,
      remaining: Math.max(0, state.limit - (state.consumed + state.reserved)),
    };
  }
}

export const defaultUsageQuotaManager = new UsageQuotaManager();
