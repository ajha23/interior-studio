/**
 * Reusable Offcut Salvage Inventory Card
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/features/manufacturing/
 */

import { Sparkles, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OffcutRectangle } from '@/engine/production/nesting/types';

interface OffcutSummaryCardProps {
  offcuts: OffcutRectangle[];
  className?: string;
}

export function OffcutSummaryCard({ offcuts, className }: OffcutSummaryCardProps) {
  const reusable = offcuts.filter((o) => o.isReusable);
  const totalAreaM2 = reusable.reduce((sum, o) => sum + o.areaMm2, 0) / 1e6;

  if (reusable.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card p-3 text-xs text-muted-foreground', className)}>
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Layers className="size-3.5 text-muted-foreground" />
          <span>Salvage Offcuts</span>
        </div>
        <p className="mt-1 text-[11px]">No reusable offcuts (≥ 600×600 mm) produced in this layout.</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-3 text-xs shadow-xs', className)}>
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Sparkles className="size-3.5 text-emerald-600" />
          <span>Reusable Offcut Inventory</span>
        </div>
        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
          {totalAreaM2.toFixed(2)} m² Salvage
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {reusable.map((offcut, idx) => {
          const areaM2 = (offcut.areaMm2 / 1e6).toFixed(2);
          return (
            <div
              key={idx}
              className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-[11px]"
            >
              <span className="font-medium text-foreground">
                Offcut #{idx + 1}
              </span>
              <span className="font-mono text-muted-foreground">
                {offcut.length} × {offcut.width} mm ({areaM2} m²)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
