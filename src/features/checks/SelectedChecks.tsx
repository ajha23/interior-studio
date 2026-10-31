import { AlertTriangle } from 'lucide-react';
import { PanelSection } from '@/components/layout/PanelSection';
import { useSelectedChecks } from './useDesignChecks';

/** The selected unit's design-check warnings, shown in the inspector. */
export function SelectedChecks() {
  const warnings = useSelectedChecks().filter((c) => c.severity === 'warning');
  if (!warnings.length) return null;
  return (
    <PanelSection title="Design checks">
      <ul className="flex flex-col gap-1.5" data-testid="selected-checks">
        {warnings.map((c) => (
          <li key={c.id} className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {c.message}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">The amber area in the plan and 3D view shows the space involved.</p>
    </PanelSection>
  );
}
