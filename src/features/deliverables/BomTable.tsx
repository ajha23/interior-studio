import { AlertTriangle } from 'lucide-react';
import type { Bom, BomCategory } from '@/engine/deliverables/bom';
import { cn } from '@/lib/utils';

const ORDER: BomCategory[] = ['carcass', 'back', 'shelf', 'front', 'drawer box', 'kickboard', 'filler', 'glass', 'worktop', 'edge banding', 'board', 'hardware', 'appliance', 'furniture'];

/** The bill of materials, grouped by category; estimated lines and partial coverage are explicit. */
export function BomTable({ bom }: { bom: Bom }) {
  const n = (v: number | null) => (v === null ? '—' : v);
  return (
    <div className="flex flex-col gap-2" data-testid="bom-view">
      {!bom.complete && (
        <p role="alert" className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs" data-testid="bom-partial">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <span>
            <strong>Partial BOM.</strong> {!bom.rules ? 'No construction method is chosen, so panels, edge banding, boards and hardware are not listed. ' : ''}
            {bom.excluded.length > 0 && `Not covered by verified construction rules: ${bom.excluded.map((e) => `${e.ref} (${e.reason})`).join('; ')}`}
          </span>
        </p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-[12px]" data-testid="bom-table">
          <thead className="bg-muted/60 text-left">
            <tr>{['Item', 'Material', 'T', 'L', 'W', 'Qty', 'Unit', 'Basis', 'Units', ...(bom.currency ? [`Cost (${bom.currency})`] : [])].map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr>
          </thead>
          {ORDER.map((cat) => {
            const lines = bom.lines.filter((l) => l.category === cat);
            if (!lines.length) return null;
            return (
              <tbody key={cat}>
                <tr className="bg-muted/30">
                  <th colSpan={bom.currency ? 10 : 9} className="px-2 py-1 text-left text-[11px] font-semibold capitalize">{cat}</th>
                </tr>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t" title={l.formula}>
                    <td className={cn('px-2 py-1', l.item.includes('not specified') && 'text-amber-700 dark:text-amber-400')}>{l.item}</td>
                    <td className="px-2 py-1">{l.material}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{n(l.thickness)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{n(l.length)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{n(l.width)}</td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">{l.qty}</td>
                    <td className="px-2 py-1">{l.uom}</td>
                    <td className="px-2 py-1">
                      <span className={cn('rounded px-1 text-[10px]', l.basis === 'estimated' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-success/10 text-success')}>{l.basis}</span>
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{l.refs.join(' ')}</td>
                    {bom.currency && <td className="px-2 py-1 text-right tabular-nums">{l.cost ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {bom.totalCost !== null && <p className="text-xs">Estimated cost of priced lines: <strong className="tabular-nums">{bom.totalCost} {bom.currency}</strong> (indicative, from configured prices).</p>}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Assumptions and formulas</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {bom.assumptions.map((a) => <li key={a}>{a}</li>)}
          <li>Hover a line to see how its quantity is calculated.</li>
        </ul>
      </details>
    </div>
  );
}
