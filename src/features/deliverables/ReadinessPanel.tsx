import { AlertTriangle, CircleX, Info, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { KitchenProject } from '@/domain';
import { CONSTRUCTIONS } from '@/engine/deliverables/construction';
import type { OutputKind, Readiness, Severity } from '@/engine/deliverables/readiness';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';

const OUTPUT_LABEL: Record<OutputKind, string> = { presentation: 'Client presentation', drawings: 'Technical drawings', manufacturing: 'Manufacturing (BOM & cut list)' };
const SEVERITY: Record<Severity, { icon: typeof Info; className: string; label: string }> = {
  blocking: { icon: CircleX, className: 'text-destructive', label: 'Blocking' },
  warning: { icon: AlertTriangle, className: 'text-amber-600', label: 'Warning' },
  info: { icon: Info, className: 'text-muted-foreground', label: 'Info' },
};

/** Readiness of each kind of output, with the issues behind it and the settings that fix them. */
export function ReadinessPanel({ readiness, project, editable }: { readiness: Readiness; project: KitchenProject; editable: boolean }) {
  const select = useEditorStore((s) => s.select);
  const [filter, setFilter] = useState<OutputKind | 'all'>('all');
  const issues = readiness.issues.filter((i) => filter === 'all' || i.outputs.includes(filter));
  return (
    <div className="flex flex-col gap-4" data-testid="readiness-panel">
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(OUTPUT_LABEL) as OutputKind[]).map((o) => {
          const r = readiness.outputs[o];
          return (
            <button
              key={o}
              type="button"
              onClick={() => setFilter(filter === o ? 'all' : o)}
              aria-pressed={filter === o}
              className={cn('rounded-lg border p-3 text-left', filter === o && 'ring-2 ring-highlight/40', r.status === 'ready' ? 'border-success/40 bg-success/5' : r.status === 'warnings' ? 'border-amber-500/40 bg-amber-500/5' : 'border-destructive/40 bg-destructive/5')}
              data-testid={`readiness-${o}`}
            >
              <span className="text-[11px] text-muted-foreground uppercase">{OUTPUT_LABEL[o]}</span>
              <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                {r.status === 'ready' ? <ShieldCheck className="size-4 text-success" /> : r.status === 'warnings' ? <AlertTriangle className="size-4 text-amber-600" /> : <CircleX className="size-4 text-destructive" />}
                {r.label}
              </span>
            </button>
          );
        })}
      </div>
      <section aria-label="Readiness issues">
        <h3 className="mb-1 text-xs font-semibold">
          {issues.length} item{issues.length === 1 ? '' : 's'}
          {filter !== 'all' ? ` for ${OUTPUT_LABEL[filter].toLowerCase()}` : ''}
        </h3>
        <ul className="flex flex-col gap-1 text-[13px]" data-testid="readiness-issues">
          {(['blocking', 'warning', 'info'] as Severity[]).flatMap((sev) =>
            issues
              .filter((i) => i.severity === sev)
              .map((i, k) => {
                const S = SEVERITY[sev];
                return (
                  <li key={`${sev}${k}${i.code}`} className="flex items-start gap-1.5" data-severity={sev}>
                    <S.icon className={cn('mt-0.5 size-3.5 shrink-0', S.className)} aria-label={S.label} />
                    <span className="flex-1">{i.message}</span>
                    {i.entityIds[0] && editable && (
                      <Button size="xs" variant="ghost" onClick={() => select(i.entityIds[0]!)}>
                        Show
                      </Button>
                    )}
                  </li>
                );
              }),
          )}
        </ul>
      </section>
      {editable ? <ProductionSettings project={project} /> : <p className="text-xs text-muted-foreground">Showing an approved revision: switch to the current design to change settings.</p>}
    </div>
  );
}

/** Construction method, hardware products, waste and prices: what manufacturing outputs need. */
function ProductionSettings({ project }: { project: KitchenProject }) {
  const dispatch = useEditorStore((s) => s.dispatch);
  const p = project.production;
  const setText = (key: 'hinge' | 'drawerRunner' | 'handle') => (value: string) =>
    dispatch({ type: 'set_production_settings', settings: value.trim() ? { [key]: value.trim() } : { clear: [key] } });
  const setNumber = (value: string, apply: (v: number) => void, clear: () => void) => {
    const v = Number(value);
    if (value.trim() === '') clear();
    else if (Number.isFinite(v) && v >= 0) apply(v);
  };
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3" aria-label="Manufacturing settings" data-testid="production-settings">
      <h3 className="text-xs font-semibold">Manufacturing settings</h3>
      <label className="grid grid-cols-[10rem_1fr] items-center gap-2 text-[13px]">
        <span>Construction method</span>
        <Select aria-label="Construction method" value={p.constructionId ?? ''} onChange={(e) => dispatch({ type: 'set_production_settings', settings: e.target.value ? { constructionId: e.target.value } : { clear: ['constructionId'] } })} className="h-8">
          <option value="">Not chosen</option>
          {Object.values(CONSTRUCTIONS).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      {p.constructionId && CONSTRUCTIONS[p.constructionId] && (
        <p className="text-[11px] text-muted-foreground">
          {CONSTRUCTIONS[p.constructionId]!.description} Verified for: {CONSTRUCTIONS[p.constructionId]!.verified.join(', ')}.
        </p>
      )}
      {(
        [
          ['hinge', 'Hinge product'],
          ['drawerRunner', 'Drawer runner product'],
          ['handle', 'Handle product'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="grid grid-cols-[10rem_1fr] items-center gap-2 text-[13px]">
          <span>{label}</span>
          <Input aria-label={label} defaultValue={p[key] ?? ''} key={p[key] ?? ''} placeholder="Not specified" onBlur={(e) => e.target.value.trim() !== (p[key] ?? '') && setText(key)(e.target.value)} className="h-8" />
        </label>
      ))}
      <label className="grid grid-cols-[10rem_1fr] items-center gap-2 text-[13px]">
        <span>Waste allowance (%)</span>
        <Input aria-label="Waste allowance" inputMode="decimal" defaultValue={p.wastePercent ?? ''} key={`w${p.wastePercent ?? ''}`} placeholder="Not configured" onBlur={(e) => setNumber(e.target.value, (v) => dispatch({ type: 'set_production_settings', settings: { wastePercent: Math.min(50, v) } }), () => dispatch({ type: 'set_production_settings', settings: { clear: ['wastePercent'] } }))} className="h-8" />
      </label>
      <label className="grid grid-cols-[10rem_1fr] items-center gap-2 text-[13px]">
        <span>Board price per m² ({p.prices?.currency ?? 'GBP'})</span>
        <Input aria-label="Board price per square metre" inputMode="decimal" defaultValue={p.prices?.boardPerM2 ?? ''} key={`b${p.prices?.boardPerM2 ?? ''}`} placeholder="No prices" onBlur={(e) => setNumber(e.target.value, (v) => dispatch({ type: 'set_production_settings', settings: { prices: { currency: p.prices?.currency ?? 'GBP', ...p.prices, boardPerM2: v } } }), () => undefined)} className="h-8" />
      </label>
      <p className="text-[11px] text-muted-foreground">Settings are saved with the project and can be undone. Nothing is assumed when a field is empty: it is reported above.</p>
    </section>
  );
}
