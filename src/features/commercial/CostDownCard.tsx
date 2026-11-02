import { Sparkles, ArrowRight, Check } from 'lucide-react';
import type { CostDownSuggestion } from '@/engine/commercial/costDown';
import { Button } from '@/components/ui/button';

interface CostDownCardProps {
  suggestions: CostDownSuggestion[];
  onApply?: (suggestion: CostDownSuggestion) => void;
  appliedIds?: string[];
}

export function CostDownCard({ suggestions, onApply, appliedIds = [] }: CostDownCardProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-4 text-xs" data-testid="cost-down-card">
      <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-600" />
          <span className="font-semibold text-emerald-950 dark:text-emerald-100">
            Cost-Down Advisor (AI-03 / CP-05)
          </span>
        </div>
        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          {suggestions.length} Recommendation{suggestions.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {suggestions.map((s) => {
          const isApplied = appliedIds.includes(s.id);
          return (
            <div
              key={s.id}
              className="rounded-md border bg-card/60 p-3 flex flex-col gap-1.5"
              data-testid={`cost-down-item-${s.id}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{s.title}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Save {s.formattedSavings}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{s.description}</p>
              <p className="text-[10px] text-muted-foreground/80 italic">{s.explanation}</p>

              <div className="mt-1 flex justify-end">
                <Button
                  size="sm"
                  variant={isApplied ? 'outline' : 'default'}
                  className={`h-7 text-xs ${isApplied ? 'text-emerald-600' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                  disabled={isApplied}
                  onClick={() => onApply?.(s)}
                  data-testid={`apply-cost-down-${s.id}`}
                >
                  {isApplied ? (
                    <>
                      <Check className="size-3.5 mr-1" /> Applied
                    </>
                  ) : (
                    <>
                      Apply Optimization <ArrowRight className="size-3.5 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

