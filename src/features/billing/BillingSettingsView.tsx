/**
 * Studio Billing Settings & Subscription Management (BIL-07).
 * Displays active plan tier, billing cycle toggle, upgrade cards, and GST invoice history.
 */

import { useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  Receipt,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type BillingCycle } from '@/domain/platform/billing';
import { PLANS, type PlanTier } from '@/domain/platform/entitlements';
import { useBillingStore } from '@/state/billingStore';
import { useSubscriptionStore } from '@/state/subscriptionStore';
import { UsageQuotaTracker, type QuotaMeterItem } from './UsageQuotaTracker';
import { PlanUpgradeModal } from './PlanUpgradeModal';

export function BillingSettingsView() {
  const currentTier = useBillingStore((s) => s.currentTier);
  const cycle = useBillingStore((s) => s.cycle);
  const subscription = useBillingStore((s) => s.subscription);
  const invoices = useBillingStore((s) => s.invoices);
  const { setCycle, upgradePlan, cancelSubscription } = useBillingStore.getState();

  const upgradeModalOpen = useSubscriptionStore((s) => s.upgradeModalOpen);
  const upgradeModalTargetTier = useSubscriptionStore((s) => s.upgradeModalTargetTier);
  const upgradeModalFeatureKey = useSubscriptionStore((s) => s.upgradeModalFeatureKey);
  const upgradeModalQuotaKey = useSubscriptionStore((s) => s.upgradeModalQuotaKey);
  const upgradeModalReason = useSubscriptionStore((s) => s.upgradeModalReason);
  const { openUpgradeModal, closeUpgradeModal, upgradePlan: upgradeSaasPlan } = useSubscriptionStore.getState();

  const [notification, setNotification] = useState<string | null>(null);

  const activePlan = PLANS[currentTier];
  const isCancelled = subscription?.status === 'cancelled';

  const liveQuotas: QuotaMeterItem[] = [
    {
      key: 'quota.projects.active.max',
      label: 'Active Projects',
      consumed: 4,
      limit: activePlan.features.maxActiveProjects,
      unit: 'projects',
    },
    {
      key: 'quota.seats.designers.max',
      label: 'Designer Seats',
      consumed: 2,
      limit: activePlan.features.maxDesigners,
      unit: 'seats',
    },
    {
      key: 'quota.renderings.monthly.max',
      label: 'Monthly Renders',
      consumed: 30,
      limit: currentTier === 'starter' ? 50 : currentTier === 'pro' ? 200 : -1,
      unit: 'renders',
    },
  ];

  const handleCycleChange = (newCycle: BillingCycle) => {
    setCycle(newCycle);
  };

  const handleSelectPlan = async (tier: PlanTier) => {
    if (tier === currentTier) return;
    await upgradePlan(tier, cycle);
    setNotification(`Successfully switched subscription to ${PLANS[tier].name}!`);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel your studio subscription? You will retain access until the end of the current billing period.')) {
      return;
    }
    await cancelSubscription();
    setNotification('Subscription cancelled. Access will remain active until the end of the billing period.');
    setTimeout(() => setNotification(null), 5000);
  };

  const displayTiers: PlanTier[] = ['starter', 'pro', 'enterprise'];

  return (
    <div className="space-y-6" data-testid="billing-settings-view">
      {/* Feedback Banner */}
      {notification && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs font-medium text-primary animate-in fade-in">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Active Subscription Overview Card */}
      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CreditCard className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{activePlan.name}</h3>
                <Badge className="bg-primary text-primary-foreground text-[10px]">
                  {isCancelled ? 'CANCELLED (ACTIVE UNTIL RENEWAL)' : 'ACTIVE SUBSCRIPTION'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{activePlan.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCancelled && currentTier !== 'trial' && currentTier !== 'inhouse' && (
              <Button size="xs" variant="outline" onClick={handleCancel} className="text-rose-600 hover:text-rose-700">
                Cancel Subscription
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-3">
            <Calendar className="size-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground block text-[11px]">Next Debit / Renewal</span>
              <span className="font-medium font-mono">
                {subscription ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN') : 'N/A'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-3">
            <Receipt className="size-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground block text-[11px]">Billing Cadence</span>
              <span className="font-medium capitalize">{cycle} recurring</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-3">
            <Zap className="size-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground block text-[11px]">Payment Gateway</span>
              <span className="font-medium">Razorpay Subscriptions (eMandate)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Commercial Quota Meters */}
      <UsageQuotaTracker
        quotas={liveQuotas}
        onUpgradeClick={(key) => openUpgradeModal('pro', undefined, key as never)}
      />

      {/* Plan Selection Section */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Available Studio Plans</h4>
            <p className="text-xs text-muted-foreground">
              Select the optimal capacity for your designers, factory production, and ERP exports
            </p>
          </div>

          {/* Billing Cycle Switcher */}
          <div className="flex items-center rounded-lg border p-1 bg-muted/40 text-xs">
            <button
              type="button"
              onClick={() => handleCycleChange('monthly')}
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                cycle === 'monthly' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => handleCycleChange('annual')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                cycle === 'annual' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Annual
              <span className="rounded bg-emerald-500/15 px-1 py-0.2 text-[10px] text-emerald-600 font-semibold">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {displayTiers.map((tier) => {
            const plan = PLANS[tier];
            const isCurrent = currentTier === tier;
            const pricePaise = cycle === 'annual' ? plan.priceAnnualPaise : plan.priceMonthlyPaise;
            const priceRupees = (pricePaise / 100).toLocaleString('en-IN');
            const cycleSuffix = cycle === 'annual' ? '/ year' : '/ month';

            const perksMap: Record<PlanTier, string[]> = {
              trial: ['5 active projects', 'Standard cut list', 'Watermarked exports'],
              starter: [
                '15 active projects',
                '2 designer seats',
                'Standard cut-list export',
                'AI design assistant',
              ],
              pro: [
                'Unlimited active projects',
                '5 designer seats + unlimited production viewers',
                'AutoCAD 2D DXF CAD export',
                'OptiCut & Cut Rite panel saw CSV',
                'Tally Prime & Zoho Books accounting CSV',
              ],
              enterprise: [
                'Unlimited active projects',
                '25+ designer seats',
                'Custom tenant rule packs',
                'Dedicated ERP integration',
                'Custom CNC post-processors',
              ],
              inhouse: ['All features unlocked'],
            };

            return (
              <div
                key={tier}
                data-testid={`plan-card-${tier}`}
                className={`flex flex-col justify-between rounded-xl border p-5 transition-all ${
                  isCurrent ? 'border-primary ring-1 ring-primary bg-primary/5' : 'bg-card hover:border-muted-foreground/30'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{plan.name}</span>
                    {isCurrent && (
                      <Badge className="bg-primary text-primary-foreground text-[10px]">CURRENT</Badge>
                    )}
                  </div>

                  <div className="flex items-baseline">
                    <span className="text-2xl font-bold">₹{priceRupees}</span>
                    <span className="text-xs text-muted-foreground ml-1">{cycleSuffix}</span>
                  </div>

                  <p className="text-xs text-muted-foreground min-h-[32px]">{plan.tagline}</p>

                  <div className="border-t pt-3 space-y-2">
                    <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Features:
                    </span>
                    <ul className="space-y-1.5 text-xs">
                      {perksMap[tier].map((perk) => (
                        <li key={perk} className="flex items-center gap-2 text-muted-foreground">
                          <Check className="size-3.5 text-emerald-600 shrink-0" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t mt-4">
                  <Button
                    size="sm"
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={isCurrent}
                    onClick={() => handleSelectPlan(tier)}
                    className="w-full gap-1.5"
                    data-testid={`select-plan-${tier}`}
                  >
                    {isCurrent ? (
                      'Current Plan'
                    ) : (
                      <>
                        <Sparkles className="size-3.5" /> Select {plan.name}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GST Tax Invoices List */}
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Tax Invoices & Receipts</h4>
          <p className="text-xs text-muted-foreground">
            Download statutory GST tax invoices for input tax credit (ITC) claims
          </p>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-left text-xs" data-testid="invoices-table">
            <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Invoice Number</th>
                <th className="py-2.5 px-3">Amount (₹)</th>
                <th className="py-2.5 px-3">GST Paid (₹)</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/10">
                  <td className="py-2.5 px-3 text-muted-foreground">{inv.date}</td>
                  <td className="py-2.5 px-3 font-mono font-medium">{inv.invoiceNumber}</td>
                  <td className="py-2.5 px-3 font-mono">₹{(inv.amountPaise / 100).toFixed(2)}</td>
                  <td className="py-2.5 px-3 font-mono text-muted-foreground">
                    ₹{(inv.taxPaise / 100).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge className="text-emerald-600 border-emerald-300 text-[10px]">PAID</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => alert(`Downloading statutory GST invoice ${inv.invoiceNumber}...`)}
                      className="h-6 gap-1"
                    >
                      <Download className="size-3" /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Upgrade Modal Dialog */}
      <PlanUpgradeModal
        isOpen={upgradeModalOpen}
        onClose={closeUpgradeModal}
        onUpgrade={(tier) => {
          handleSelectPlan(tier as PlanTier);
          upgradeSaasPlan(tier);
        }}
        currentTier={currentTier}
        targetTier={upgradeModalTargetTier}
        featureKey={upgradeModalFeatureKey}
        quotaKey={upgradeModalQuotaKey}
        reason={upgradeModalReason}
      />
    </div>
  );
}
