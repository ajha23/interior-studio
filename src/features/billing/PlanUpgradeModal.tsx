/**
 * PlanUpgradeModal Component.
 * Commercial upgrade CTA dialog for missing capabilities or exhausted quotas.
 * Conforms to Constitution Principle X (FR-001, FR-004, Principle III).
 */

import { Check, Sparkles, X, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { defaultSubscriptionCatalog } from '@/domain/platform/saas/subscriptionCatalog';
import { EntitlementRegistry } from '@/domain/platform/saas/entitlementRegistry';
import type { CanonicalKey } from '@/domain/platform/saas/types';

export interface PlanUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (targetTier: string) => void;
  currentTier?: string;
  targetTier?: string;
  featureKey?: CanonicalKey;
  quotaKey?: CanonicalKey;
  reason?: string;
}

export function PlanUpgradeModal({
  isOpen,
  onClose,
  onUpgrade,
  currentTier = 'starter',
  targetTier = 'pro',
  featureKey,
  quotaKey,
  reason,
}: PlanUpgradeModalProps) {
  if (!isOpen) return null;

  const targetPlan = defaultSubscriptionCatalog.getPlan(targetTier) || defaultSubscriptionCatalog.getPlan('pro');
  const capability = featureKey ? EntitlementRegistry.getCapability(featureKey) : undefined;
  const quota = quotaKey ? EntitlementRegistry.getCapability(quotaKey) : undefined;

  const priceRupees = targetPlan ? Math.round(targetPlan.priceMonthlyPaise / 100) : 12999;
  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(priceRupees);

  return (
    <div
      data-testid="plan-upgrade-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Badge className="gap-1 border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Commercial Upgrade</span>
          </Badge>
          <span className="text-xs text-muted-foreground">Current: {currentTier.toUpperCase()}</span>
        </div>

        <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground">
          Upgrade to {targetPlan?.name || 'Pro Studio'}
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {reason || 'Unlock advanced modeling, manufacturing export, and expanded team quotas.'}
        </p>

        {(capability || quota) && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Required Capability
            </span>
            <h4 className="mt-0.5 text-sm font-semibold text-foreground">
              {capability?.displayName || quota?.displayName}
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {capability?.description || quota?.description}
            </p>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Plan Pricing</span>
            <div className="text-right">
              <span className="text-2xl font-extrabold text-foreground">{formattedPrice}</span>
              <span className="text-xs text-muted-foreground"> / month</span>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Instant entitlement unlock with zero downtime</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Full project design preservation & non-destructive migration</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>GST compliant Indian e-invoicing & tax deduction certificates</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="gap-2 font-semibold shadow-sm"
            onClick={() => onUpgrade(targetPlan?.id || 'pro')}
          >
            <span>Confirm Upgrade</span>
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
