import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';
import { useDesignChecks } from './useDesignChecks';

/** Every design check, warnings first; "Show" selects the unit and frames it. */
export function ChecksPanel() {
  const checks = useDesignChecks();
  const { select, focusSelection } = useEditorStore.getState();
  const view = useEditorStore((s) => s.view);
  const sorted = [...checks].sort((a, b) => Number(a.severity === 'info') - Number(b.severity === 'info'));
  const warnings = checks.filter((c) => c.severity === 'warning').length;
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-4" aria-label="Design checks" data-testid="checks-panel">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Design checks · {warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : 'no warnings'}
      </h3>
      <p className="text-[11px] text-muted-foreground">Kitchen-planning guidance: warnings never block an edit. Clearances use each door and drawer opened fully.</p>
      <ul className="flex flex-col gap-1">
        {sorted.map((c) => (
          <li key={c.id} className={cn('flex items-start gap-2 rounded-md border p-2 text-[13px]', c.severity === 'warning' ? 'border-amber-500/40 bg-amber-500/5' : 'bg-muted/40')} data-testid={`check-${c.code}`}>
            {c.severity === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="flex-1">{c.message}</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                select(c.entityIds[0] ?? null);
                if (view === '3d') focusSelection();
              }}
            >
              Show
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
