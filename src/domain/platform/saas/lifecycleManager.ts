/**
 * Pure domain LifecycleManager & Downgrade Retention Service.
 * Manages 8 subscription states, past_due grace periods, and non-destructive project rosters.
 * Conforms to Constitution Principle X (FR-007, FR-008, Clarification 1).
 */

import type { SubscriptionStatus, TenantSubscription } from './types';

export type AccessMode = 'read_write' | 'read_only' | 'read_only_export' | 'blocked';

export interface ProjectRosterItem {
  id: string;
  name: string;
  orgId: string;
  status: 'active' | 'archived_read_only';
  lastModifiedAt: string;
}

export interface DowngradeImpactCheck {
  rosterSelectionRequired: boolean;
  totalProjects: number;
  allowedActiveCount: number;
  excessCount: number;
}

export class LifecycleManager {
  /**
   * Transitions subscription to past_due with a 7-day grace period upon payment failure.
   */
  public handlePaymentFailure(subscription: TenantSubscription): TenantSubscription {
    const graceEnds = new Date(Date.now() + 7 * 86400000).toISOString();
    return {
      ...subscription,
      status: 'past_due',
      gracePeriodEndsAt: graceEnds,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Recovers subscription to active upon successful charge/re-attempt.
   */
  public handlePaymentSuccess(subscription: TenantSubscription): TenantSubscription {
    return {
      ...subscription,
      status: 'active',
      gracePeriodEndsAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Requests cancellation at current billing period end.
   */
  public requestCancellation(subscription: TenantSubscription): TenantSubscription {
    return {
      ...subscription,
      cancelAtPeriodEnd: true,
      status: 'cancelled_at_period_end',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates lifecycle state transitions against time boundaries.
   */
  public evaluateLifecycleState(subscription: TenantSubscription): TenantSubscription {
    const now = Date.now();

    // Check past_due grace period expiration
    if (subscription.status === 'past_due' && subscription.gracePeriodEndsAt) {
      if (new Date(subscription.gracePeriodEndsAt).getTime() <= now) {
        return {
          ...subscription,
          status: 'paused',
          updatedAt: new Date().toISOString(),
        };
      }
    }

    // Check cancelled_at_period_end expiration
    if (subscription.status === 'cancelled_at_period_end' && subscription.currentPeriodEnd) {
      if (new Date(subscription.currentPeriodEnd).getTime() <= now) {
        return {
          ...subscription,
          status: 'expired',
          updatedAt: new Date().toISOString(),
        };
      }
    }

    return subscription;
  }

  /**
   * Determines operational read/write permissions based on lifecycle state.
   */
  public getAccessMode(status: SubscriptionStatus): AccessMode {
    switch (status) {
      case 'active':
      case 'trial':
      case 'past_due':
      case 'grace_period':
        return 'read_write';
      case 'paused':
        return 'read_only';
      case 'expired':
        return 'read_only_export';
      case 'unpaid':
      default:
        return 'blocked';
    }
  }
}

export class ProjectRosterService {
  /**
   * Checks whether a plan downgrade requires the studio owner to designate active projects.
   */
  public checkDowngradeImpact(
    projects: ProjectRosterItem[],
    newActiveQuota: number
  ): DowngradeImpactCheck {
    if (newActiveQuota === -1) {
      return {
        rosterSelectionRequired: false,
        totalProjects: projects.length,
        allowedActiveCount: -1,
        excessCount: 0,
      };
    }

    const currentActiveCount = projects.filter((p) => p.status === 'active').length;
    const excess = Math.max(0, currentActiveCount - newActiveQuota);

    return {
      rosterSelectionRequired: excess > 0,
      totalProjects: projects.length,
      allowedActiveCount: newActiveQuota,
      excessCount: excess,
    };
  }

  /**
   * Non-destructive roster selection:
   * Keeps selected projects as 'active', transitions unselected projects to 'archived_read_only'.
   * ZERO items are deleted.
   */
  public applyRosterSelection(
    projects: ProjectRosterItem[],
    selectedActiveIds: string[],
    newActiveQuota: number
  ): { updatedProjects: ProjectRosterItem[]; archivedCount: number } {
    if (newActiveQuota !== -1 && selectedActiveIds.length > newActiveQuota) {
      throw new Error(
        `Cannot select more active projects than the allowed quota of ${newActiveQuota}. Selected: ${selectedActiveIds.length}.`
      );
    }

    const selectedSet = new Set(selectedActiveIds);
    let archivedCount = 0;

    const updatedProjects = projects.map((project) => {
      if (selectedSet.has(project.id)) {
        return { ...project, status: 'active' as const };
      }
      archivedCount++;
      return { ...project, status: 'archived_read_only' as const };
    });

    return { updatedProjects, archivedCount };
  }
}
