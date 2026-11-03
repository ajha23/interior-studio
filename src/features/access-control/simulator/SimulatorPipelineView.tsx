import type { FC } from 'react';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SimulationStageDetail } from '@/domain/platform/authorization/accessSimulator';

interface SimulatorPipelineViewProps {
  stages: SimulationStageDetail[];
}

export const SimulatorPipelineView: FC<SimulatorPipelineViewProps> = ({ stages }) => {
  return (
    <div className="space-y-3" data-testid="simulator-pipeline-view">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        4-Stage Policy Evaluation Pipeline
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {stages.map((stage, idx) => {
          const isPassed = stage.passed;

          return (
            <div
              key={stage.stage}
              className={`p-3.5 rounded-lg border flex flex-col justify-between transition-all ${
                isPassed
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-destructive/30 bg-destructive/5'
              }`}
              data-testid={`stage-card-${stage.stage.toLowerCase()}`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Stage {idx + 1}
                  </span>
                  <Badge
                    className={
                      isPassed
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]'
                        : 'bg-destructive/10 text-destructive border-destructive/20 text-[10px]'
                    }
                  >
                    {isPassed ? 'PASS' : 'DENIED'}
                  </Badge>
                </div>

                <div className="flex items-start gap-2">
                  {isPassed ? (
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h5 className="font-semibold text-xs text-foreground">{stage.name}</h5>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {stage.details}
                    </p>
                  </div>
                </div>
              </div>

              {stage.remedy && !isPassed && (
                <div className="mt-3 p-2 rounded bg-destructive/10 text-[10px] text-destructive flex items-start gap-1.5 font-medium">
                  <AlertCircle className="size-3 shrink-0 mt-0.5" />
                  <span>{stage.remedy}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
