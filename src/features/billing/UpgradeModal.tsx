/**
 * Upgrade Modal for Feature Gating (ENT-07, BIL-04).
 * Appears when a studio attempts to execute a capability above their current plan tier.
 */

import { Check, Sparkles, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PLANS } from '@/domain/platform/entitlements';
import { useBillingStore } from '@/state/billingStore';

export function UpgradeModal() {
  const isOpen = useBillingStore((s) => s.upgradeModalOpen);
  const feature = useBillingStore((s) => s.upgradeModalFeature);
  const targetTier = useBillingStore((s) => s.upgradeModalTargetTier) || 'pro';
  const currentTier = useBillingStore((s) => s.currentTier);
  const cycle = useBillingStore((s) => s.cycle);
  const { closeUpgradeModal, upgradePlan } = useBillingStore.getState();

  if (!isOpen) return null;

  const targetPlan = PLANS[targetTier];
  const pricePaise =
    cycle === 'annual' ? targetPlan.priceAnnualPaise : targetPlan.priceMonthlyPaise;
  const priceRupees = (pricePaise / 100).toLocaleString('en-IN');
  const cycleLabel = cycle === 'annual' ? '/ year' : '/ month';

  const featureNames: Record<string, string> = {
    'drawings.dxf': 'AutoCAD 2D DXF Export',
    'accounting.export': 'Tally / Zoho Accounting CSV',
    'cutlist.export': 'Factory Panel Saw Cut Lists',
    'projects.max_active': 'Unlimited Active Projects',
    'seats.designers': 'Additional Designer Seats',
    'ai.layout': 'AI Copilot Layout Engine',
    'custom_rulepack': 'Custom Manufacturing Rule Pack',
  };

  const featureTitle = feature ? featureNames[feature] || feature : 'Premium Feature';

  const perks = [
    'Unlimited active studio projects & revisions',
    'AutoCAD DXF 2D CAD floor plans with layers',
    'Tally Prime & Zoho Books GST sales voucher CSVs',
    'OptiCut & Cut Rite panel saw export with 32mm boring',
    'Up to 5 designer seats with full collaboration',
  ];

  const handleUpgrade = async () => {
    await upgradePlan(targetTier);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 animate-in fade-in"
      role="dialog"
      aria-label="Upgrade Plan"
      data-testid="upgrade-modal-dialog"
      onClick={closeUpgradeModal}
    >
      <div
        className="flex w-[min(540px,100%)] flex-col overflow-hidden rounded-xl bg-card shadow-2xl border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {targetPlan.name} Required
              </h2>
              <p className="text-xs text-muted-foreground">
                Current Plan:{' '}
                <span className="font-semibold uppercase">{currentTier}</span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={closeUpgradeModal}
            aria-label="Close upgrade dialog"
          >
            <X className="size-4" />
          </Button>
        </header>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3.5 text-xs text-foreground flex items-start gap-2.5">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-primary">{featureTitle}</span> is a{' '}
              {targetPlan.name} capability. Upgrade your subscription to unlock this feature for
              your studio team and factory production.
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-card space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xl font-bold">₹{priceRupees}</span>
                <span className="text-xs text-muted-foreground ml-1">{cycleLabel}</span>
              </div>
              <Badge className="bg-primary text-primary-foreground text-[10px]">
                GST INVOICE INCLUDED
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">{targetPlan.tagline}</p>

            <div className="pt-2 border-t space-y-2">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Included with {targetPlan.name}:
              </span>
              <ul className="space-y-1.5 text-xs">
                {perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-muted-foreground">
                    <Check className="size-3.5 text-emerald-600 shrink-0" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t px-6 py-3.5 bg-muted/10">
          <Button variant="ghost" size="sm" onClick={closeUpgradeModal}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpgrade}
            data-testid="upgrade-now-btn"
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" /> Upgrade to {targetPlan.name}
          </Button>
        </footer>
      </div>
    </div>
  );
}
