/**
 * Cutting Layouts & Sheet Nesting Workshop Panel
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/features/manufacturing/
 */

import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Lock,
  Percent,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';
import { useBillingStore, useEntitlement } from '@/state/billingStore';
import { cutList } from '@/engine/production/cutlist';
import { adaptCutListToNestingPanels } from '@/engine/production/nesting/cutlistAdapter';
import { NestingEngine } from '@/engine/production/nesting/nestingEngine';
import type { NestedSheet, NestingResult } from '@/engine/production/nesting/types';
import { SheetCanvasViewer } from './SheetCanvasViewer';
import { OffcutSummaryCard } from './OffcutSummaryCard';
import { NestingExportDropdown } from './NestingExportDropdown';

interface CuttingLayoutsPanelProps {
  initialResult?: NestingResult;
  className?: string;
}

export function CuttingLayoutsPanel({ initialResult, className }: CuttingLayoutsPanelProps) {
  const project = useEditorStore((s) => s.project);
  const entitlement = useEntitlement('sheet.nesting');
  const { openUpgradeModal } = useBillingStore.getState();

  // Compute nesting result from active project or fallback to initialResult
  const computedResult = useMemo(() => {
    if (initialResult) return initialResult;
    if (!project || !entitlement.allowed) return null;

    const cl = cutList(project);
    const panels = adaptCutListToNestingPanels(cl);
    const engine = new NestingEngine();
    return engine.optimize({ panels });
  }, [project, initialResult, entitlement.allowed]);

  const result = computedResult;

  const [activeMaterial, setActiveMaterial] = useState<string>('all');
  const [activeSheetNum, setActiveSheetNum] = useState<number>(1);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);

  const materialGroups = useMemo(() => {
    if (!result) return [];
    return Object.keys(result.sheetsByMaterial);
  }, [result]);

  const filteredSheets = useMemo(() => {
    if (!result) return [];
    if (activeMaterial === 'all') return result.sheets;
    return result.sheetsByMaterial[activeMaterial] ?? [];
  }, [result, activeMaterial]);

  if (!initialResult && !entitlement.allowed) {
    return (
      <div
        className={cn('flex size-full flex-col items-center justify-center p-8 text-center', className)}
        data-testid="nesting-entitlement-barrier"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 mb-3">
          <Lock className="size-6" />
        </div>
        <h3 className="text-base font-semibold">2D Sheet Nesting Requires Pro Studio</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Algorithmic 2D guillotine sheet nesting, kerf compensation, cutting layouts, DXF export, and offcut salvage inventory are available on Pro and Enterprise plans.
        </p>
        <Button
          className="mt-4"
          onClick={() => openUpgradeModal('sheet.nesting', 'pro')}
        >
          Upgrade to Pro Studio
        </Button>
      </div>
    );
  }

  const currentSheetIndex = Math.min(Math.max(1, activeSheetNum), Math.max(1, filteredSheets.length));
  const activeSheet: NestedSheet | undefined = filteredSheets[currentSheetIndex - 1];

  const handlePrevSheet = () => {
    setActiveSheetNum((prev) => Math.max(1, prev - 1));
  };

  const handleNextSheet = () => {
    setActiveSheetNum((prev) => Math.min(filteredSheets.length, prev + 1));
  };

  if (!result || result.sheets.length === 0) {
    return (
      <div className={cn('flex size-full flex-col items-center justify-center p-8 text-center', className)}>
        <Scissors className="size-10 text-muted-foreground mb-3 opacity-60" />
        <h3 className="text-sm font-semibold">No Panels Available for Nesting</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Add kitchen or wardrobe units in the 3D studio to generate parametric cut lists and optimized cutting layouts.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex size-full min-h-0 flex-col bg-background text-foreground', className)}>
      {/* Top Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Scissors className="size-4" />
            </span>
            <div>
              <h2 className="text-xs font-semibold">Sheet Nesting & Cutting Optimization</h2>
              <p className="text-[10px] text-muted-foreground">Standard 2440 × 1220 mm Panel Saw Guillotine Cuts</p>
            </div>
          </div>
        </div>

        {/* Global Yield & Sheets Badges */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1">
            <Layers className="size-3.5 text-blue-500" />
            <span className="font-semibold tabular-nums">{result.totalSheets} Sheets Total</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1">
            <Percent className="size-3.5 text-emerald-500" />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {result.netYieldPercentage}%
            </span>
            <span className="text-[11px] text-muted-foreground">Net Yield</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1">
            <Sparkles className="size-3.5 text-amber-500" />
            <span className="font-semibold tabular-nums">{result.reusableOffcuts.length}</span>
            <span className="text-[11px] text-muted-foreground">Salvage Offcuts</span>
          </div>

          <NestingExportDropdown sheet={activeSheet} result={result} projectName={project?.name} />
        </div>
      </div>

      {/* Material Filter & Navigation Carousel Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        {/* Material Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveMaterial('all');
              setActiveSheetNum(1);
            }}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              activeMaterial === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'hover:bg-accent text-muted-foreground'
            )}
          >
            All Materials ({result.totalSheets})
          </button>
          {materialGroups.map((matKey) => {
            const count = result.sheetsByMaterial[matKey]?.length ?? 0;
            return (
              <button
                key={matKey}
                type="button"
                onClick={() => {
                  setActiveMaterial(matKey);
                  setActiveSheetNum(1);
                }}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  activeMaterial === matKey
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'hover:bg-accent text-muted-foreground'
                )}
              >
                {matKey} ({count})
              </button>
            );
          })}
        </div>

        {/* Sheet Carousel Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Previous sheet"
            onClick={handlePrevSheet}
            disabled={currentSheetIndex <= 1}
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          <span className="font-medium text-xs tabular-nums">
            Sheet {currentSheetIndex} of {filteredSheets.length}
          </span>

          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Next sheet"
            onClick={handleNextSheet}
            disabled={currentSheetIndex >= filteredSheets.length}
          >
            <ChevronRight className="size-3.5" />
          </Button>

          {activeSheet && (
            <span className="ml-2 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              Yield: {activeSheet.yieldPercentage}%
            </span>
          )}
        </div>
      </div>

      {/* Main Workspace: SVG Viewer + Side Part Inspector */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* SVG Sheet Layout Area */}
        <div className="flex-1 min-w-0 p-3">
          {activeSheet && (
            <SheetCanvasViewer
              sheet={activeSheet}
              selectedPlacementId={selectedPlacementId}
              onSelectPlacement={setSelectedPlacementId}
            />
          )}
        </div>

        {/* Parts on Active Sheet Sidebar */}
        {activeSheet && (
          <aside className="w-80 shrink-0 border-l bg-card flex flex-col min-h-0 text-xs">
            <div className="border-b px-3 py-2 font-semibold flex items-center justify-between">
              <span>Parts on Sheet {currentSheetIndex}</span>
              <span className="text-muted-foreground font-normal">
                {activeSheet.placements.length} panels
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y">
              {activeSheet.placements.map((panel) => {
                const isSelected = panel.panelId === selectedPlacementId;
                return (
                  <div
                    key={panel.panelId}
                    onClick={() => setSelectedPlacementId(panel.panelId)}
                    className={cn(
                      'p-2.5 cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{panel.partName}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {panel.length} × {panel.width} mm
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Units: {panel.units.length > 0 ? panel.units.join(', ') : '—'}</span>
                      <span>Banding: {panel.banding}</span>
                    </div>

                    {panel.rotated && (
                      <div className="mt-1">
                        <span className="inline-block rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Rotated 90° for yield
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 border-t">
              <OffcutSummaryCard offcuts={result.reusableOffcuts} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
