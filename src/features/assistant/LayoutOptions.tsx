import { AlertTriangle, Check, ChevronDown, Eye, EyeOff, Info, Minus, Plus, ShieldCheck } from 'lucide-react';
import type { ChatMessage } from '@/ai/conversation';
import type { LayoutCandidate, PlanResult } from '@/ai/layout/planner';
import { Button } from '@/components/ui/button';
import { PlanSvg } from '@/features/drawings/sheets/PlanSvg';
import { cn } from '@/lib/utils';
import { useAssistantStore } from '@/state/assistantStore';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength } from '@/state/units';

type LayoutsMessage = Extract<ChatMessage, { kind: 'layouts' }>;

const STATUS: Record<LayoutsMessage['status'], { label: string; className: string }> = {
  proposed: { label: 'Options ready · choose one', className: 'border-highlight/50 bg-accent text-accent-foreground' },
  applied: { label: 'Applied', className: 'border-success/50 bg-success/10 text-success' },
  rejected: { label: 'Rejected', className: 'text-muted-foreground' },
  superseded: { label: 'Replaced', className: 'text-muted-foreground' },
  failed: { label: 'No valid option', className: 'border-destructive/50 bg-destructive/5 text-destructive' },
};

/** Layout alternatives: interpretation, comparison, per-option previews, apply or reject. */
export function LayoutOptions({ message: m }: { message: LayoutsMessage }) {
  const r = m.result;
  const revision = useEditorStore((s) => s.revision);
  const stale = m.status === 'proposed' && r.baseRevision !== revision;
  const { rejectLayouts } = useAssistantStore.getState();
  const dim = m.status === 'superseded' || m.status === 'rejected';
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 text-[13px] shadow-xs', dim && 'opacity-60')} data-testid="layout-options" data-status={m.status}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{m.explanation}</p>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', STATUS[m.status].className)} data-testid="layouts-status">
          {STATUS[m.status].label}
        </span>
      </div>
      {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
      <Interpretation result={r} />
      {r.infeasible.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs" data-testid="layouts-infeasible">
          <p className="mb-0.5 flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="size-3.5" /> {r.infeasible[0]}</p>
          <ul className="list-disc space-y-0.5 pl-4">{r.infeasible.slice(1).map((x) => <li key={x}>{x}</li>)}</ul>
          {r.relaxations.length > 0 && (
            <>
              <p className="mt-1 font-medium">You could:</p>
              <ul className="list-disc space-y-0.5 pl-4">{r.relaxations.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {r.candidates.length > 1 && <Comparison result={r} />}
      <ol className="flex flex-col gap-2" aria-label="Layout options">
        {r.candidates.map((c, i) => (
          <CandidateCard key={c.id} message={m} candidate={c} index={i + 1} stale={stale} />
        ))}
      </ol>
      {stale && <p className="text-xs text-amber-600">The design changed since these options were made. Applying one generates them again first.</p>}
      {m.error && <p role="alert" className="text-xs text-destructive">{m.error}</p>}
      {r.rejected.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Not offered ({r.rejected.length}): broke a hard rule</summary>
          <ul className="mt-1 space-y-1">
            {r.rejected.map((x, i) => (
              <li key={i}>
                <span className="font-medium">{x.name}</span>: {x.reasons.slice(0, 2).join(' ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[10px] text-muted-foreground">
        {r.stats.generated} generated · {r.stats.evaluated} geometry checks · {r.stats.duplicates} duplicates removed · {r.stats.ms} ms{r.stats.truncated ? ' · search limit reached' : ''}
      </p>
      {m.status === 'proposed' && (
        <Button size="xs" variant="ghost" className="self-start" onClick={() => rejectLayouts(m.id)} data-testid="reject-layouts">
          Reject all options
        </Button>
      )}
    </div>
  );
}

function Interpretation({ result: r }: { result: PlanResult }) {
  const hard = r.rules.filter((x) => x.kind === 'hard');
  const soft = r.rules.filter((x) => x.kind === 'soft');
  return (
    <details className="group rounded-md bg-muted/50 px-2 py-1.5 text-xs" data-testid="layouts-interpretation">
      <summary className="flex cursor-pointer list-none items-center gap-1 font-medium">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /> How I read your request: {hard.length} requirements, {soft.length} preferences
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        <div>
          <p className="font-semibold">Must hold (hard)</p>
          <ul className="space-y-0.5">{hard.map((x) => <li key={x.id} title={x.note}><ShieldCheck className="mr-1 inline size-3 text-success" />{x.label} <span className="text-muted-foreground">· {x.source}</span></li>)}</ul>
        </div>
        <div>
          <p className="font-semibold">Ranks options (soft)</p>
          <ul className="space-y-0.5">{soft.map((x) => <li key={x.id} title={x.note}>{x.label} <span className="text-muted-foreground">· {x.source}</span></li>)}</ul>
        </div>
        <div>
          <p className="font-semibold">Not checked</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{r.notChecked.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <p className="font-semibold">Assumptions</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{r.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <p className="font-semibold">How scores are calculated</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{r.scoreMethod.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
    </details>
  );
}

/** Side-by-side figures for the current design and every option. */
function Comparison({ result: r }: { result: PlanResult }) {
  const fmt = useFormatLength();
  const cols = [{ key: 'now', label: 'Now', m: r.current.metrics, topology: r.current.topology, total: null as number | null }, ...r.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}`, m: c.metrics, topology: c.topology, total: c.scores.total }))];
  const row = (label: string, value: (c: (typeof cols)[number]) => string) => (
    <tr className="border-b last:border-0">
      <th scope="row" className="py-0.5 pr-1 text-left font-normal text-muted-foreground">{label}</th>
      {cols.map((c) => <td key={c.key} className="py-0.5 text-right tabular-nums">{value(c)}</td>)}
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]" aria-label="Compare options" data-testid="layouts-comparison">
        <thead>
          <tr className="border-b text-[10px] text-muted-foreground uppercase">
            <th />
            {cols.map((c) => <th key={c.key} className="py-0.5 text-right font-medium">{c.label === 'Now' ? 'Now' : `Opt ${c.label}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {row('Shape', (c) => c.topology)}
          {row('Storage', (c) => `${c.m.storageLitres} L`)}
          {row('Worktop', (c) => fmt(c.m.counterMm))}
          {row('Walkway', (c) => (c.m.minWalkwayMm === null ? '—' : fmt(c.m.minWalkwayMm)))}
          {row('Triangle', (c) => (c.m.triangle ? `${(c.m.triangle.total / 1000).toFixed(1)} m` : '—'))}
          {row('New units', (c) => (c.key === 'now' ? '—' : `≈ ${c.m.changeCost}`))}
          {row('Score', (c) => (c.total === null ? '—' : String(c.total)))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateCard({ message: m, candidate: c, index, stale }: { message: LayoutsMessage; candidate: LayoutCandidate; index: number; stale: boolean }) {
  const fmt = useFormatLength();
  const previewing = useAssistantStore((s) => s.previewing?.candidateId === c.id && s.previewing.messageId === m.id);
  const { previewLayout, applyLayout } = useAssistantStore.getState();
  const applied = m.status === 'applied' && m.appliedId === c.id;
  const ch = c.changes;
  return (
    <li className={cn('flex flex-col gap-1.5 rounded-md border p-2', previewing && 'border-highlight ring-1 ring-highlight/40', applied && 'border-success')} data-testid={`layout-option-${index}`}>
      <div className="flex items-start gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{index}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.summary}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-base leading-none font-semibold tabular-nums">{c.scores.total}</span>
          <span className="text-[10px] text-muted-foreground">score</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1 text-[10px]">
        <span className="inline-flex items-center gap-0.5 rounded bg-success/10 px-1 text-success" data-testid="hard-ok"><Check className="size-3" /> All hard requirements met</span>
        {c.fallback && <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-400">Alternative: not the shape you asked for</span>}
        <span className="rounded bg-muted px-1">{c.topology}</span>
      </div>
      <button type="button" onClick={() => previewLayout(m.id, previewing ? null : c.id)} className="overflow-hidden rounded border bg-white" aria-label={`Preview option ${index} in the plan and 3D views`}>
        <div className="pointer-events-none h-36">
          <PlanSvg project={c.after} />
        </div>
      </button>
      <ul className="space-y-0.5 text-xs" aria-label="What changes">
        {ch.added.length > 0 && <li className="flex gap-1"><Plus className="mt-0.5 size-3 shrink-0 text-success" /> {ch.added.length} new: {summarise(ch.added.map((a) => a.label))}</li>}
        {ch.removed.length > 0 && <li className="flex gap-1"><Minus className="mt-0.5 size-3 shrink-0 text-destructive" /> {ch.removed.length} removed: {summarise(ch.removed.map((a) => a.label))}</li>}
        {ch.modified.length > 0 && <li className="flex gap-1"><ChevronDown className="mt-0.5 size-3 shrink-0 -rotate-90 text-highlight" /> {ch.modified.length} moved or resized: {summarise(ch.modified.map((a) => a.label))}</li>}
        {ch.room && <li>Room {fmt(ch.room.before.width)} × {fmt(ch.room.before.length)} → {fmt(ch.room.after.width)} × {fmt(ch.room.after.length)}</li>}
        {c.preserved.length > 0 && <li className="text-muted-foreground">Kept exactly: {c.preserved.join(', ')}</li>}
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Scores, dimensions and details</summary>
        <div className="mt-1 flex flex-col gap-1">
          <Scores c={c} />
          <p className="tabular-nums">
            Storage {c.metrics.storageLitres} L · worktop {fmt(c.metrics.counterMm)} · narrowest walkway {c.metrics.minWalkwayMm === null ? '—' : fmt(c.metrics.minWalkwayMm)}
            {c.metrics.triangle ? ` · triangle ${c.metrics.triangle.legs.map((l) => (l / 1000).toFixed(1)).join(' + ')} m` : ''} · new cabinets ≈ {c.metrics.changeCost} (indicative)
          </p>
          {ch.added.length > 0 && (
            <ul className="space-y-0.5 text-muted-foreground tabular-nums">
              {ch.added.map((a) => (
                <li key={a.id}>
                  + {a.label}: {fmt(a.after!.width)} × {fmt(a.after!.height)} × {fmt(a.after!.depth ?? 0)} · {a.after!.wallId ? `${a.after!.wallId} wall @ ${fmt(a.after!.offset ?? 0)}` : 'free-standing'}
                </li>
              ))}
            </ul>
          )}
          {c.assumptions.map((a) => <p key={a} className="flex gap-1 text-muted-foreground"><Info className="mt-0.5 size-3 shrink-0" /> {a}</p>)}
        </div>
      </details>
      {c.warnings.map((w) => <p key={w} className="flex items-start gap-1 text-xs text-amber-600"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}</p>)}
      {m.status === 'proposed' && (
        <div className="flex gap-1.5">
          <Button size="xs" variant={previewing ? 'selected' : 'outline'} onClick={() => previewLayout(m.id, previewing ? null : c.id)} aria-pressed={previewing} data-testid="preview-option">
            {previewing ? <EyeOff /> : <Eye />} {previewing ? 'Stop preview' : 'Preview'}
          </Button>
          <Button size="xs" onClick={() => void applyLayout(m.id, c.id)} data-testid="apply-option">
            <Check /> {stale ? 'Re-check & apply' : 'Apply'}
          </Button>
        </div>
      )}
      {applied && <p className="flex items-center gap-1 text-xs text-success"><Check className="size-3.5" /> Applied. Undo reverts the whole change.</p>}
    </li>
  );
}

function Scores({ c }: { c: LayoutCandidate }) {
  const rows: [string, number | null][] = [
    ['Compliance', c.scores.constraintCompliance],
    ['Storage', c.scores.storage],
    ['Workflow', c.scores.workflow],
    ['Accessibility', c.scores.accessibility],
    ['Your priorities', c.scores.userPreferenceMatch],
  ];
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5" aria-label="Score breakdown">
      {rows.map(([label, v]) => (
        <div key={label} className="contents">
          <span className="text-muted-foreground">{label}</span>
          <span className="h-1.5 rounded bg-muted"><span className="block h-full rounded bg-highlight" style={{ width: `${v ?? 0}%` }} /></span>
          <span className="tabular-nums">{v === null ? 'n/a' : v}</span>
        </div>
      ))}
    </div>
  );
}

function summarise(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()].map(([l, n]) => (n > 1 ? `${n} × ${l}` : l)).join(', ');
}
