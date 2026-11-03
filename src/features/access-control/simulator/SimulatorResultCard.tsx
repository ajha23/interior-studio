import type { FC } from 'react';
import { CheckCircle2, ShieldX, Key, Layers } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SimulationResult } from '@/domain/platform/authorization/accessSimulator';

interface SimulatorResultCardProps {
  result: SimulationResult;
}

export const SimulatorResultCard: FC<SimulatorResultCardProps> = ({ result }) => {
  const isAllowed = result.allowed;

  return (
    <Card
      className={`p-5 border-2 shadow-sm transition-all ${
        isAllowed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'
      }`}
      data-testid="simulator-result-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`size-12 rounded-full flex items-center justify-center shrink-0 ${
              isAllowed ? 'bg-emerald-500/20 text-emerald-600' : 'bg-destructive/20 text-destructive'
            }`}
          >
            {isAllowed ? <CheckCircle2 className="size-6" /> : <ShieldX className="size-6" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Authoritative Verdict
              </span>
              <Badge
                className={
                  isAllowed
                    ? 'bg-emerald-500 text-white font-bold'
                    : 'bg-destructive text-white font-bold'
                }
                data-testid="sim-verdict-badge"
              >
                {isAllowed ? 'ACCESS ALLOWED' : 'ACCESS DENIED'}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-foreground mt-1" data-testid="sim-final-reason">
              {result.finalReason}
            </p>
          </div>
        </div>

        {/* Details tags */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-card border text-muted-foreground">
            <Key className="size-3 text-primary" />
            <span className="font-medium text-foreground">{result.targetPermission.title}</span>
          </span>

          {result.effectiveScopes.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-card border text-muted-foreground">
              <Layers className="size-3 text-primary" />
              <span className="font-medium text-foreground">{result.effectiveScopes.join(', ')}</span>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};
