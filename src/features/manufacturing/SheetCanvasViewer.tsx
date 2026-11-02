/**
 * Responsive SVG Sheet Visualizer
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/features/manufacturing/
 */

import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NestedSheet } from '@/engine/production/nesting/types';

interface SheetCanvasViewerProps {
  sheet: NestedSheet;
  selectedPlacementId?: string | null;
  onSelectPlacement?: (placementId: string) => void;
  className?: string;
}

export function SheetCanvasViewer({
  sheet,
  selectedPlacementId,
  onSelectPlacement,
  className,
}: SheetCanvasViewerProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);

  const boardL = sheet.boardLength;
  const boardW = sheet.boardWidth;
  const trim = sheet.trimMargin;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className={cn('relative flex size-full min-h-0 flex-col overflow-hidden bg-muted/20 rounded-lg border', className)}>
      {/* Zoom and overlay controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md border bg-card/90 p-1 shadow-sm backdrop-blur">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom in"
          onClick={handleZoomIn}
          title="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom out"
          onClick={handleZoomOut}
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Reset zoom"
          onClick={handleResetZoom}
          title="Reset zoom"
        >
          <RotateCcw className="size-3.5" />
        </Button>
        <span className="px-1 text-[11px] font-mono text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Main SVG Pan/Zoom Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 150ms ease-out',
          }}
          className="relative max-w-full"
        >
          <svg
            data-testid="sheet-canvas-svg"
            viewBox={`0 0 ${boardL} ${boardW}`}
            className="w-[850px] max-w-full drop-shadow-md select-none rounded bg-card"
            style={{ aspectRatio: `${boardL} / ${boardW}` }}
          >
            <defs>
              {/* Perimeter Trim Margin Hatch Pattern */}
              <pattern
                id="trimHatch"
                width="20"
                height="20"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="20" stroke="#cbd5e1" strokeWidth="2" />
              </pattern>
              {/* Offcut Diagonal Pattern */}
              <pattern
                id="offcutHatch"
                width="25"
                height="25"
                patternTransform="rotate(-45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="25" stroke="#a7f3d0" strokeWidth="2" />
              </pattern>
            </defs>

            {/* Raw Board Stock Boundary */}
            <rect
              x="0"
              y="0"
              width={boardL}
              height={boardW}
              fill="#ffffff"
              stroke="#64748b"
              strokeWidth="3"
              rx="4"
            />

            {/* Perimeter Edge Trim Zones (Gray) */}
            {/* Top trim */}
            <rect x="0" y="0" width={boardL} height={trim} fill="url(#trimHatch)" stroke="#94a3b8" strokeWidth="0.5" />
            {/* Bottom trim */}
            <rect x="0" y={boardW - trim} width={boardL} height={trim} fill="url(#trimHatch)" stroke="#94a3b8" strokeWidth="0.5" />
            {/* Left trim */}
            <rect x="0" y={trim} width={trim} height={boardW - 2 * trim} fill="url(#trimHatch)" stroke="#94a3b8" strokeWidth="0.5" />
            {/* Right trim */}
            <rect x={boardL - trim} y={trim} width={trim} height={boardW - 2 * trim} fill="url(#trimHatch)" stroke="#94a3b8" strokeWidth="0.5" />

            {/* Usable Cutting Inner Boundary Line */}
            <rect
              x={trim}
              y={trim}
              width={boardL - 2 * trim}
              height={boardW - 2 * trim}
              fill="none"
              stroke="#94a3b8"
              strokeDasharray="6 4"
              strokeWidth="1.5"
            />

            {/* Offcut / Scrap Zones */}
            {sheet.offcuts.map((offcut, idx) => {
              const isReusable = offcut.isReusable;
              const fill = isReusable ? 'url(#offcutHatch)' : 'rgba(241, 245, 249, 0.7)';
              const stroke = isReusable ? '#10b981' : '#cbd5e1';
              const labelColor = isReusable ? '#047857' : '#94a3b8';

              return (
                <g key={`offcut-${idx}`}>
                  <rect
                    x={offcut.x}
                    y={offcut.y}
                    width={offcut.length}
                    height={offcut.width}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="1.5"
                    strokeDasharray={isReusable ? undefined : '4 3'}
                  />
                  {offcut.length >= 200 && offcut.width >= 100 && (
                    <text
                      x={offcut.x + offcut.length / 2}
                      y={offcut.y + offcut.width / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={labelColor}
                      fontSize={Math.max(16, Math.min(offcut.width / 5, 28))}
                      fontWeight="600"
                    >
                      {isReusable
                        ? `Reusable Offcut (${offcut.length} × ${offcut.width})`
                        : `Scrap`}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Placed Panels */}
            {sheet.placements.map((panel) => {
              const isSelected = panel.panelId === selectedPlacementId;
              const isHovered = panel.panelId === hoveredPanelId;

              const fill = isSelected
                ? '#bfdbfe' // Blue 200
                : isHovered
                ? '#dbeafe' // Blue 100
                : '#f0f9ff'; // Sky 50

              const stroke = isSelected ? '#1d4ed8' : isHovered ? '#2563eb' : '#0284c7';
              const strokeWidth = isSelected ? 3.5 : isHovered ? 2.5 : 1.8;

              return (
                <g
                  key={panel.panelId}
                  data-testid={`panel-rect-${panel.panelId}`}
                  className="cursor-pointer transition-colors"
                  onClick={() => onSelectPlacement?.(panel.panelId)}
                  onMouseEnter={() => setHoveredPanelId(panel.panelId)}
                  onMouseLeave={() => setHoveredPanelId(null)}
                >
                  {/* Panel Box */}
                  <rect
                    x={panel.x}
                    y={panel.y}
                    width={panel.length}
                    height={panel.width}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    rx="2"
                  />

                  {/* Edge Banding Indicators */}
                  {panel.banding === 'all 4' && (
                    <rect
                      x={panel.x + 3}
                      y={panel.y + 3}
                      width={panel.length - 6}
                      height={panel.width - 6}
                      fill="none"
                      stroke="#ea580c" // Orange 600
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                  )}
                  {panel.banding === '1 long' && (
                    <line
                      x1={panel.x}
                      y1={panel.y + 2}
                      x2={panel.x + panel.length}
                      y2={panel.y + 2}
                      stroke="#ea580c"
                      strokeWidth="3.5"
                    />
                  )}

                  {/* Panel Text Annotations */}
                  {panel.length >= 100 && panel.width >= 50 && (
                    <text
                      x={panel.x + panel.length / 2}
                      y={panel.y + panel.width / 2 - 12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#0f172a"
                      fontSize={Math.max(14, Math.min(panel.width / 6, 26))}
                      fontWeight="700"
                    >
                      {panel.partName}
                      {panel.units.length > 0 ? ` [${panel.units.join(', ')}]` : ''}
                    </text>
                  )}

                  {panel.length >= 100 && panel.width >= 80 && (
                    <text
                      x={panel.x + panel.length / 2}
                      y={panel.y + panel.width / 2 + 14}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#475569"
                      fontSize={Math.max(12, Math.min(panel.width / 8, 20))}
                      fontWeight="500"
                    >
                      {`${panel.length} × ${panel.width} mm`}
                      {panel.rotated ? ' (↻ 90°)' : ''}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between border-t bg-card px-3 py-2 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-sky-600 bg-sky-100" />
            <span className="text-muted-foreground">Cut Part</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-emerald-500 bg-emerald-100" />
            <span className="text-muted-foreground">Reusable Offcut (≥ 600×600)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-slate-300 bg-slate-100" />
            <span className="text-muted-foreground">Trim & Scrap</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-3 rounded bg-orange-600" />
            <span className="text-muted-foreground">Edge Banding</span>
          </div>
        </div>

        <div className="font-mono text-[11px] text-muted-foreground">
          Board: {boardL} × {boardW} mm | Kerf: {sheet.kerf} mm | Trim: {trim} mm
        </div>
      </div>
    </div>
  );
}
