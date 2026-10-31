import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WALL_LABEL, WALLS } from '@/domain';
import { querySchedule, SCHEDULE_COLUMNS, type ScheduleQuery, type ScheduleRow } from '@/engine/deliverables/schedule';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';

type SortKey = NonNullable<ScheduleQuery['sort']>['key'];
const SORTABLE: Record<string, SortKey> = { ref: 'ref', type: 'type', run: 'wall', width: 'width', height: 'height', depth: 'depth', status: 'status' };

/** Interactive schedule: filter, sort, group and choose columns; unspecified values stand out. */
export function ScheduleTable({ rows, columns, onColumns, editable }: { rows: ScheduleRow[]; columns: string[]; onColumns: (ids: string[]) => void; editable: boolean }) {
  const select = useEditorStore((s) => s.select);
  const selectedId = useEditorStore((s) => s.selectedId);
  const [q, setQ] = useState<ScheduleQuery>({ category: 'all', type: 'all', wall: 'all', text: '', incompleteOnly: false, sort: { key: 'ref', dir: 'asc' }, groupBy: 'none' });
  const groups = useMemo(() => querySchedule(rows, q), [rows, q]);
  const cols = SCHEDULE_COLUMNS.filter((c) => columns.includes(c.id));
  const types = [...new Set(rows.map((r) => `${r.type}|${r.typeLabel}`))];
  const sortBy = (id: string) => {
    const key = SORTABLE[id];
    if (key) setQ({ ...q, sort: { key, dir: q.sort?.key === key && q.sort.dir === 'asc' ? 'desc' : 'asc' } });
  };
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <div className="flex flex-col gap-2" data-testid="schedule-view">
      <div className="flex flex-wrap items-center gap-1.5 text-xs" role="toolbar" aria-label="Schedule filters">
        <Input aria-label="Search the schedule" placeholder="Search" value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} className="h-7 w-36 text-xs" />
        <Select aria-label="Category" value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value as ScheduleQuery['category'] })} className="h-7 w-32 text-xs">
          <option value="all">All objects</option>
          <option value="cabinet">Cabinets</option>
          <option value="appliance">Appliances</option>
          <option value="furniture">Furniture</option>
        </Select>
        <Select aria-label="Type" value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value })} className="h-7 w-36 text-xs">
          <option value="all">All types</option>
          {types.map((t) => {
            const [id, label] = t.split('|');
            return <option key={id} value={id}>{label}</option>;
          })}
        </Select>
        <Select aria-label="Wall" value={q.wall} onChange={(e) => setQ({ ...q, wall: e.target.value as ScheduleQuery['wall'] })} className="h-7 w-32 text-xs">
          <option value="all">All walls</option>
          {WALLS.map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
          <option value="free">Free-standing</option>
        </Select>
        <Select aria-label="Group by" value={q.groupBy} onChange={(e) => setQ({ ...q, groupBy: e.target.value as ScheduleQuery['groupBy'] })} className="h-7 w-32 text-xs">
          <option value="none">No grouping</option>
          <option value="wall">Group by wall</option>
          <option value="run">Group by run</option>
          <option value="type">Group by type</option>
        </Select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={q.incompleteOnly} onChange={(e) => setQ({ ...q, incompleteOnly: e.target.checked })} /> Incomplete only
        </label>
        <details className="relative ml-auto">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded border px-2 py-1"><Columns3 className="size-3.5" /> Columns</summary>
          <div className="absolute right-0 z-10 mt-1 grid w-52 gap-1 rounded-md border bg-card p-2 shadow-lg">
            {SCHEDULE_COLUMNS.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={columns.includes(c.id)} onChange={(e) => onColumns(e.target.checked ? SCHEDULE_COLUMNS.filter((x) => columns.includes(x.id) || x.id === c.id).map((x) => x.id) : columns.filter((x) => x !== c.id))} />
                {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      <p className="text-[11px] text-muted-foreground">{count} of {rows.length} objects · lengths in millimetres · <span className="text-amber-600">amber</span> = not specified yet</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-[12px]" data-testid="schedule-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              {cols.map((c) => (
                <th key={c.id} className={cn('px-2 py-1 font-medium whitespace-nowrap', c.align === 'right' && 'text-right')}>
                  {SORTABLE[c.id] ? (
                    <button type="button" onClick={() => sortBy(c.id)} className="inline-flex items-center gap-0.5 hover:underline">
                      {c.label}
                      {q.sort?.key === SORTABLE[c.id] && (q.sort?.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.group}>
              {q.groupBy !== 'none' && (
                <tr className="bg-muted/30">
                  <th colSpan={cols.length} className="px-2 py-1 text-left text-[11px] font-semibold">
                    {g.group} · {g.rows.length}
                  </th>
                </tr>
              )}
              {g.rows.map((r) => (
                <tr key={r.id} className={cn('border-t', editable && 'cursor-pointer hover:bg-muted/40', r.id === selectedId && 'bg-accent')} onClick={() => editable && select(r.id)} data-status={r.status}>
                  {cols.map((c) => {
                    const field = c.id === 'finish' ? r.finish : c.id === 'carcass' ? r.carcass : c.id === 'construction' ? r.construction : null;
                    const unspecified = field?.status === 'unspecified' || (c.id === 'status' && r.status === 'incomplete') || (c.id === 'hardware' && [r.hinge, r.runner, r.handle].some((f) => f.status === 'unspecified'));
                    return (
                      <td key={c.id} className={cn('px-2 py-1 tabular-nums', c.align === 'right' && 'text-right', unspecified && 'text-amber-700 dark:text-amber-400', c.id === 'ref' && 'font-semibold')}>
                        {String(c.value(r))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
