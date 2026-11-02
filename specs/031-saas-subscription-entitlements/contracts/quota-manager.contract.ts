/**
 * Contract: Usage & Quantitative Quota Manager
 * Layer: Pure domain / framework-free TypeScript + Transactional Persistence
 */

import type { CanonicalKey } from '../data-model';

export interface QuotaReservationResult {
  success: boolean;
  reservationId?: string;
  remainingQuota?: number;
  reason?: string;
}

export interface IUsageQuotaManager {
  /**
   * Concurrency-safe atomic quota reservation before operation execution.
   */
  reserveQuota(
    orgId: string,
    quotaKey: CanonicalKey,
    amount: number
  ): Promise<QuotaReservationResult>;

  /**
   * Commits a reserved quota upon successful operation completion.
   */
  commitQuota(reservationId: string): Promise<void>;

  /**
   * Releases a reserved quota if the operation failed or was cancelled.
   */
  releaseQuota(reservationId: string): Promise<void>;

  /**
   * Retrieves current consumed count and remaining quota for an organization.
   */
  getQuotaRemaining(
    orgId: string,
    quotaKey: CanonicalKey
  ): Promise<{ consumed: number; limit: number; remaining: number }>;
}
