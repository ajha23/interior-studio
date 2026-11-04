import type { FC } from 'react';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PlanRestrictedBadgeProps {
  requiredPlanTier?: string;
  className?: string;
}

export const PlanRestrictedBadge: FC<PlanRestrictedBadgeProps> = ({
  requiredPlanTier = 'Pro Studio',
  className,
}) => {
  return (
    <div className="relative group inline-flex items-center" data-testid="plan-restricted-badge">
      <Badge
        className={`bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1 text-[11px] font-medium cursor-help ${
          className || ''
        }`}
      >
        <Lock className="size-3" />
        <span>Plan restricted</span>
      </Badge>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex flex-col items-center z-50 pointer-events-none">
        <div className="bg-popover text-popover-foreground text-xs rounded-md shadow-md border px-2.5 py-1 whitespace-nowrap max-w-xs text-center">
          <p className="font-semibold text-amber-600">Upgrade Required</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Requires <span className="font-medium text-foreground">{requiredPlanTier}</span> plan or higher.
          </p>
        </div>
        <div className="w-2 h-1 border-x-4 border-x-transparent border-t-4 border-t-popover" />
      </div>
    </div>
  );
};
