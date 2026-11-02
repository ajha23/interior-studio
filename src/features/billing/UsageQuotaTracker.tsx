/**
 * UsageQuotaTracker Component.
 * Visual meters with warning thresholds for seats, projects, and rendering credits.
 * Conforms to Constitution Principle X (FR-006, US3).
 */

import { AlertTriangle, ArrowUpRight, CheckCircle2, Infinity as InfinityIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface QuotaMeterItem {
  key: string;
  label: string;
  consumed: number;
  limit: number; // -1 for unlimited
  unit?: string;
}

export interface UsageQuotaTrackerProps {
  quotas: QuotaMeterItem[];
  onUpgradeClick?: (quotaKey: string) => void;
  className?: string;
}

export function UsageQuotaTracker({ quotas, onUpgradeClick, className = '' }: UsageQuotaTrackerProps) {
  return (
    <div className={`space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Usage & Quotas</h3>
          <p className="text-xs text-muted-foreground">Real-time resource allocation and plan limits</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quotas.map((item) => {
          const isUnlimited = item.limit === -1;
          const percent = isUnlimited ? 0 : Math.min(100, Math.round((item.consumed / item.limit) * 100));
          const isFull = !isUnlimited && item.consumed >= item.limit;
          const isWarning = !isUnlimited && percent >= 80 && !isFull;

          return (
            <div
              key={item.key}
              data-testid={`quota-meter-${item.key}`}
              className="flex flex-col justify-between rounded-lg border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">{item.label}</span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-lg font-bold tracking-tight text-foreground">{item.consumed}</span>
                    <span className="text-xs text-muted-foreground">
                      / {isUnlimited ? 'Unlimited' : item.limit} {item.unit || ''}
                    </span>
                  </div>
                </div>

                {isUnlimited ? (
                  <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <InfinityIcon className="h-3 w-3" />
                    <span>Unlimited</span>
                  </Badge>
                ) : isFull ? (
                  <Badge className="gap-1 text-[10px] uppercase font-semibold text-rose-600 bg-rose-50 border-rose-200">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Limit Reached</span>
                  </Badge>
                ) : isWarning ? (
                  <Badge className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                    <span>{percent}%</span>
                  </Badge>
                ) : (
                  <Badge className="gap-1 text-muted-foreground text-[10px]">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <span>{percent}%</span>
                  </Badge>
                )}
              </div>

              {!isUnlimited && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isFull ? 'bg-destructive' : isWarning ? 'bg-amber-500' : 'bg-primary'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )}

              {isFull && onUpgradeClick && (
                <div className="mt-3 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1 text-xs font-medium hover:bg-primary hover:text-primary-foreground"
                    onClick={() => onUpgradeClick(item.key)}
                  >
                    <span>Upgrade</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
