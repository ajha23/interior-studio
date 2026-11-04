import { useMemo } from 'react';
import { Layers, Box, Percent, CheckCircle2 } from 'lucide-react';
import type { KitchenProject } from '@/domain/schema';
import { calculateTileLayout } from '@/engine/deliverables/tileSheet';

interface TileSchedulePanelProps {
  project: KitchenProject;
  revision: string;
}

export function TileSchedulePanel({ project, revision }: TileSchedulePanelProps) {
  const result = useMemo(() => calculateTileLayout(project), [project]);

  return (
    <div className="flex flex-col gap-4 text-xs" data-testid="tile-schedule-panel">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="size-3.5 text-primary" />
            <span>Net Backsplash Area</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-foreground">
            {result.totalNetAreaSqM.toFixed(2)} <span className="text-xs font-normal">m²</span>
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>Tiles Needed</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-foreground" data-testid="tile-count">
            {result.totalTileCountWithWastage} <span className="text-xs font-normal">pcs</span>
          </p>
          <span className="text-[10px] text-muted-foreground">({result.rawTileCount} net + 10% waste)</span>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Box className="size-3.5 text-amber-500" />
            <span>Boxes Needed</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-foreground" data-testid="tile-boxes">
            {result.totalBoxesNeeded} <span className="text-xs font-normal">boxes</span>
          </p>
          <span className="text-[10px] text-muted-foreground">({result.tilesPerBox} pcs / box)</span>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Percent className="size-3.5 text-blue-500" />
            <span>Tile Specification</span>
          </div>
          <p className="mt-1.5 text-sm font-bold text-foreground">
            {result.tileWidthMm} × {result.tileHeightMm} mm
          </p>
          <span className="text-[10px] text-muted-foreground">({result.tileAreaSqM} m²/tile)</span>
        </div>
      </div>

      {/* Wall-by-Wall Breakdown Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b bg-muted/30 px-3 py-2 font-semibold">
          Wall-by-Wall Dado Schedule · Rev {revision.slice(0, 8)}
        </div>
        <table className="w-full text-left">
          <thead className="border-b bg-muted/10 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Wall Run</th>
              <th className="px-3 py-2 text-right">Length (mm)</th>
              <th className="px-3 py-2 text-right">Dado Height</th>
              <th className="px-3 py-2 text-right">Gross Area</th>
              <th className="px-3 py-2 text-right">Window Deductions</th>
              <th className="px-3 py-2 text-right font-semibold">Net Tile Area</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.breakdown.map((b) => (
              <tr key={b.wallId} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{b.wallName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.runLengthMm}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.dadoHeightMm} mm</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.grossAreaSqM.toFixed(2)} m²</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {b.windowDeductionSqM > 0 ? `-${b.windowDeductionSqM.toFixed(2)} m²` : '-'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{b.netAreaSqM.toFixed(2)} m²</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 font-bold">
            <tr>
              <td className="px-3 py-2">Total Net Area</td>
              <td className="px-3 py-2 text-right" colSpan={4}>-</td>
              <td className="px-3 py-2 text-right text-primary text-sm tabular-nums">
                {result.totalNetAreaSqM.toFixed(2)} m²
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
        <p><strong>Civil Standards Note:</strong> Dado band height is calculated at 600mm above finished countertop level (860mm AFF to 1460mm AFF).</p>
        <p>Tile adhesive should conform to IS 15477 Type 2 (polymer modified) with 2mm leveling spacer clips and epoxy grout.</p>
      </div>
    </div>
  );
}

