import { Download, FileText, MonitorPlay } from 'lucide-react';
import type { ChatMessage } from '@/ai/conversation';
import { designRevision } from '@/engine/deliverables/revision';
import { Button } from '@/components/ui/button';
import { runDeliverableAction } from '@/state/deliverablesStore';
import { useEditorStore } from '@/state/editorStore';

/** A deliverable summary computed by the app, with buttons to open, download or present. */
export function DeliverableMessage({ message: m }: { message: Extract<ChatMessage, { kind: 'deliverable' }> }) {
  const current = useEditorStore((s) => (s.project ? designRevision(s.project) : ''));
  const stale = m.request.revision === 'current' && m.reply.revision && m.reply.revision !== current;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-[13px]" data-testid="deliverable-message" data-action={m.request.action}>
      <p className="flex items-center gap-1.5 font-medium"><FileText className="size-3.5 text-highlight" /> {m.reply.title}</p>
      <ul className="space-y-0.5 text-xs">
        {m.reply.lines.map((l, i) => (
          <li key={i} className={l.startsWith('Blocking') ? 'text-destructive' : l.startsWith('Warning') ? 'text-amber-700 dark:text-amber-400' : undefined}>{l}</li>
        ))}
      </ul>
      {m.reply.table && (
        <div className="max-h-48 overflow-auto rounded border">
          <table className="w-full text-[11px] tabular-nums" data-testid="deliverable-table">
            <thead className="bg-muted/60 text-left"><tr>{m.reply.table.columns.map((c) => <th key={c} className="px-1.5 py-0.5 font-medium">{c}</th>)}</tr></thead>
            <tbody>{m.reply.table.rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-1.5 py-0.5">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {stale && <p className="text-xs text-amber-600">The design changed since this was generated; the buttons below use the latest design.</p>}
      <div className="flex flex-wrap gap-1">
        {m.reply.actions.map((a) => (
          <Button key={a.action} size="xs" variant={a.action.startsWith('download') ? 'default' : 'outline'} onClick={() => runDeliverableAction(a.action)}>
            {a.action.startsWith('download') ? <Download /> : a.action === 'present' ? <MonitorPlay /> : <FileText />} {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
