import { AlertTriangle, ArrowRight, Check, CircleX, Link2, Minus, Plus, RefreshCw } from 'lucide-react';
import type { ChatMessage } from '@/ai/conversation';
import type { EntityChange, Snapshot } from '@/ai/diff';
import { approvalReason } from '@/ai/policy';
import { Button } from '@/components/ui/button';
import { UNIT_LABEL } from '@/engine/measurement/units';
import { cn } from '@/lib/utils';
import { useAssistantStore } from '@/state/assistantStore';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength } from '@/state/units';

type ProposalMessage = Extract<ChatMessage, { kind: 'proposal' }>;

const STATUS: Record<ProposalMessage['status'], { label: string; className: string }> = {
  proposed: { label: 'Validated · awaiting approval', className: 'border-highlight/50 bg-accent text-accent-foreground' },
  applied: { label: 'Applied', className: 'border-success/50 bg-success/10 text-success' },
  rejected: { label: 'Rejected', className: 'text-muted-foreground' },
  failed: { label: 'Failed validation', className: 'border-destructive/50 bg-destructive/5 text-destructive' },
  superseded: { label: 'Replaced', className: 'text-muted-foreground' },
};

/** The human-readable preview of a proposed change, with approve and reject. */
export function ChangePreview({ message }: { message: ProposalMessage }) {
  const { proposal: p, status } = message;
  const fmt = useFormatLength();
  const revision = useEditorStore((s) => s.revision);
  const prefs = useAssistantStore((s) => s.prefs);
  const { approve, reject, refresh, useAlternative: applyAlternative } = useAssistantStore.getState();
  const stale = status === 'proposed' && p.baseRevision !== revision;
  const reason = status === 'proposed' ? approvalReason(p, prefs) : null;
  const c = p.changes;

  const size = (s: Snapshot) => [s.width, s.height, s.depth].filter((v): v is number => v !== undefined).map(fmt).join(' × ');
  const where = (s: Snapshot, category: string) => {
    const at = s.wallId ? `${s.wallId} wall @ ${fmt(s.offset ?? 0)}` : `free-standing, ${fmt(s.x ?? 0)} / ${fmt(s.z ?? 0)} from left / back`;
    const lift = category === 'opening' ? (s.elevation ? `, sill ${fmt(s.elevation)}` : '') : s.elevation > 150 ? `, ${fmt(s.elevation)} up` : '';
    const turn = s.rotationY !== undefined && !s.wallId && s.rotationY ? `, ${s.rotationY}°` : '';
    return `${at}${lift}${turn}`;
  };

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 text-[13px] shadow-xs', status === 'superseded' || status === 'rejected' ? 'opacity-60' : '')} data-testid="change-preview" data-status={status}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{p.explanation}</p>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', STATUS[status].className)} data-testid="proposal-status">
          {message.autoApplied ? 'Applied automatically' : STATUS[status].label}
        </span>
      </div>
      {message.note && <p className="text-xs text-muted-foreground">{message.note}</p>}

      {c && (
        <ul className="flex flex-col gap-1.5" aria-label="Changes">
          {c.unit && <Row icon="mod" text={`Display units: ${UNIT_LABEL[c.unit.before]} → ${UNIT_LABEL[c.unit.after]}`} detail="Geometry unchanged (stored in millimetres)" />}
          {c.room && <Row icon="mod" text="Room" before={`${fmt(c.room.before.width)} × ${fmt(c.room.before.length)} × ${fmt(c.room.before.height)}`} after={`${fmt(c.room.after.width)} × ${fmt(c.room.after.length)} × ${fmt(c.room.after.height)}`} />}
          {c.name && <Row icon="mod" text="Project name" before={c.name.before} after={c.name.after} />}
          {c.surfaces.map((s) => <Row key={s.surface} icon="mod" text={`${s.surface === 'countertop' ? 'Worktop' : s.surface.charAt(0).toUpperCase() + s.surface.slice(1)} finish`} before={s.before} after={s.after} />)}
          {c.added.map((e) => <Row key={e.id} icon="add" text={`New: ${e.label}`} detail={`${size(e.after!)} · ${where(e.after!, e.category)}`} />)}
          {c.removed.map((e) => <Row key={e.id} icon="del" text={`Delete: ${e.label}`} detail={`${size(e.before!)} · ${where(e.before!, e.category)}`} dependency={e.dependency} />)}
          {c.modified.map((e) => <ModifiedRow key={e.id} change={e} size={size} where={where} />)}
        </ul>
      )}

      {p.errors.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive" data-testid="proposal-errors">
          <p className="mb-0.5 flex items-center gap-1 font-semibold"><CircleX className="size-3.5" /> Not applied{p.failedOperation >= 0 && p.operations.length > 1 ? ` (step ${p.failedOperation + 1} of ${p.operations.length})` : ''}</p>
          <ul className="space-y-0.5">{p.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {p.alternatives.length > 0 && status === 'failed' && (
        <div className="flex flex-col gap-1" aria-label="Alternatives">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">Alternatives that work</span>
          {p.alternatives.map((a, i) => (
            <Button key={a.label} size="xs" variant="outline" className="h-auto justify-start py-1 text-left whitespace-normal" onClick={() => applyAlternative(message.id, i)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {p.status === 'valid' && (
        <div className="flex flex-col gap-0.5 text-xs" aria-label="Validation">
          <span className="flex items-center gap-1 text-success"><Check className="size-3.5" /> Fits the room, no overlaps, supported sizes</span>
          {p.warnings.map((w) => (
            <span key={w} className="flex items-start gap-1 text-amber-600"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}</span>
          ))}
        </div>
      )}
      {message.error && <p role="alert" className="text-xs text-destructive">{message.error}</p>}

      {status === 'proposed' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {stale ? (
            <>
              <span className="text-xs text-amber-600">The project changed since this preview.</span>
              <Button size="xs" onClick={() => refresh(message.id)}>
                <RefreshCw /> Re-check
              </Button>
            </>
          ) : (
            <Button size="xs" onClick={() => approve(message.id)} data-testid="approve">
              <Check /> Apply
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => reject(message.id)} data-testid="reject">
            Reject
          </Button>
          {reason && reason !== 'Approval is on' && <span className="text-[11px] text-muted-foreground">Needs approval: {reason.toLowerCase()}</span>}
        </div>
      )}
    </div>
  );
}

function Row({ icon, text, before, after, detail, dependency }: { icon: 'add' | 'del' | 'mod'; text: string; before?: string; after?: string; detail?: string; dependency?: boolean }) {
  const Icon = icon === 'add' ? Plus : icon === 'del' ? Minus : ArrowRight;
  return (
    <li className="flex gap-1.5">
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', icon === 'add' ? 'text-success' : icon === 'del' ? 'text-destructive' : 'text-highlight')} />
      <div className="min-w-0">
        <span className="font-medium">{text}</span>
        {dependency && <DependencyTag />}
        {before !== undefined && (
          <span className="block text-xs text-muted-foreground tabular-nums">
            {before} <span aria-hidden>→</span> <span className="text-foreground">{after}</span>
          </span>
        )}
        {detail && <span className="block text-xs text-muted-foreground tabular-nums">{detail}</span>}
      </div>
    </li>
  );
}

function ModifiedRow({ change: e, size, where }: { change: EntityChange; size: (s: Snapshot) => string; where: (s: Snapshot, category: string) => string }) {
  const b = e.before!;
  const a = e.after!;
  return (
    <li className="flex gap-1.5" data-testid={`change-${e.id}`}>
      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-highlight" />
      <div className="min-w-0 text-xs">
        <span className="text-[13px] font-medium">{e.label}</span>
        {!e.fields.includes('position') && <span className="text-muted-foreground"> · {where(b, e.category)}</span>}
        {e.dependency && <DependencyTag />}
        {e.fields.includes('size') && <Diff label="Size" before={size(b)} after={size(a)} />}
        {(e.fields.includes('position') || e.fields.includes('rotation')) && <Diff label="Position" before={where(b, e.category)} after={where(a, e.category)} />}
        {e.fields.includes('finish') && <Diff label="Finish" before={b.finish ?? ''} after={a.finish ?? ''} />}
        {e.fields.includes('fronts') && <Diff label="Fronts" before={b.frontStyle ?? ''} after={a.frontStyle ?? ''} />}
        {e.fields.includes('interior') && <span className="block text-muted-foreground">Interior updated</span>}
        {e.fields.includes('swing') && <span className="block text-muted-foreground">Door swing updated</span>}
      </div>
    </li>
  );
}

function Diff({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <span className="block text-muted-foreground tabular-nums">
      {label}: {before} <span aria-hidden>→</span> <span className="text-foreground">{after}</span>
    </span>
  );
}

function DependencyTag() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-400" title="Not named in the request: changes as a consequence of it">
      <Link2 className="size-3" /> affected
    </span>
  );
}
