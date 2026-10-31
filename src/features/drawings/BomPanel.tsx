import { useMemo, type ReactNode } from 'react';
import { computeBom } from '@/domain';
import { useEditorStore } from '@/state/editorStore';
import { useFormatDims, useFormatLength } from '@/state/units';

/** Basic bill of materials, recomputed from the project on every edit. */
export function BomPanel() {
  const project = useEditorStore((s) => s.project)!;
  const select = useEditorStore((s) => s.select);
  const bom = useMemo(() => computeBom(project), [project]);
  const fmt = useFormatLength();
  const fmtDims = useFormatDims();

  return (
    <div className="grid h-full gap-6 overflow-auto p-4 text-sm md:grid-cols-[1.4fr_1fr_1fr]" aria-label="Bill of materials">
      <Table title={`Cabinets · ${bom.totals.cabinetCount}`} head={['Unit', 'W × H × D', 'Shutters', 'Qty']}>
        {bom.cabinets.map((r) => (
          <tr key={r.key} className="cursor-pointer hover:bg-muted" onClick={() => select(r.entityIds[0] ?? null)} data-testid={`bom-cabinet-${r.type}-${r.width}`}>
            <td>{r.label}</td>
            <td className="tabular-nums">{fmtDims(r)}</td>
            <td>{r.finish}</td>
            <td className="text-right tabular-nums">{r.quantity}</td>
          </tr>
        ))}
      </Table>
      <div className="flex flex-col gap-6">
        <Table title={`Appliances · ${bom.totals.applianceCount}`} head={['Appliance', 'Width', 'Qty']}>
          {bom.appliances.map((r) => (
            <tr key={r.key} className="cursor-pointer hover:bg-muted" onClick={() => select(r.entityIds[0] ?? null)}>
              <td>{r.label}</td>
              <td className="tabular-nums">{fmt(r.width)}</td>
              <td className="text-right tabular-nums">{r.quantity}</td>
            </tr>
          ))}
        </Table>
        {bom.furniture.length > 0 && (
          <Table title={`Furniture · ${bom.furniture.reduce((s, r) => s + r.quantity, 0)}`} head={['Item', 'W × H × D', 'Finish', 'Qty']}>
            {bom.furniture.map((r) => (
              <tr key={r.key} className="cursor-pointer hover:bg-muted" onClick={() => select(r.entityIds[0] ?? null)}>
                <td>{r.label}</td>
                <td className="tabular-nums">{fmtDims(r)}</td>
                <td>{r.finish}</td>
                <td className="text-right tabular-nums">{r.quantity}</td>
              </tr>
            ))}
          </Table>
        )}
        <Table title={`Worktops · ${fmt(bom.totals.countertopLength)}`} head={['Wall', 'L × D × T', 'Finish']}>
          {bom.countertops.map((c) => (
            <tr key={c.id}>
              <td>{c.wall}</td>
              <td className="tabular-nums">{fmtDims({ width: c.length, height: c.depth, depth: c.thickness })}</td>
              <td>{c.finish}</td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Panel estimate</h3>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          {Object.entries(bom.totals.frontAreaByFinish).map(([finish, area]) => (
            <div key={finish} className="contents">
              <dt>Fronts · {finish}</dt>
              <dd className="text-right tabular-nums">{area.toFixed(2)} m²</dd>
            </div>
          ))}
          <dt>Carcass panels</dt>
          <dd className="text-right tabular-nums">{bom.totals.carcassArea.toFixed(2)} m²</dd>
        </dl>
        <p className="text-[11px] text-muted-foreground">Areas are budgeting estimates (fronts = width × height; carcass = sides, top, bottom, back), not a cut list.</p>
      </div>
    </div>
  );
}

function Table({ title, head, children }: { title: string; head: string[]; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <table className="w-full text-[13px] [&_td]:border-b [&_td]:px-1.5 [&_td]:py-1 [&_td]:whitespace-nowrap [&_th]:px-1.5 [&_th]:pb-1 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-muted-foreground">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}
