import { useState } from 'react';
import {
  Archive,
  Armchair,
  Box,
  ChevronDown,
  ChevronRight,
  Columns,
  DoorOpen,
  Droplet,
  Layers,
  Maximize2,
  Plug,
  Refrigerator,
  Square,
} from 'lucide-react';
import { elementLabel, WALL_LABEL, WALLS, type KitchenElement } from '@/domain';
import { useEditorStore } from '@/state/editorStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function HierarchicalOutliner() {
  const project = useEditorStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const requestCamera = useEditorStore((s) => s.requestCamera);

  // Collapsed state for tree branches
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    architecture: true,
    openings: true,
    cabinetry: true,
    appliances: true,
    furniture: true,
    mep: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!project) return null;

  const cabinets = project.cabinets;
  const appliances = project.appliances;
  const furniture = project.furniture ?? [];
  const openings = project.openings ?? [];
  const mepPoints = project.mep ?? [];

  const handleFocus = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    select(id);
    requestCamera({ kind: 'focus', id });
  };

  const renderIcon = (el: KitchenElement) => {
    if ('interior' in el) {
      if (el.type === 'base') return <Box className="size-3.5 text-blue-500" />;
      if (el.type === 'wall') return <Archive className="size-3.5 text-cyan-500" />;
      if (el.type === 'tall') return <Columns className="size-3.5 text-indigo-500" />;
      if (el.type === 'sink') return <Droplet className="size-3.5 text-sky-500" />;
      return <Box className="size-3.5 text-muted-foreground" />;
    }
    if ('kind' in el && el.kind === 'furniture') {
      return <Armchair className="size-3.5 text-emerald-500" />;
    }
    return <Refrigerator className="size-3.5 text-amber-500" />;
  };

  return (
    <div className="flex flex-col gap-1 p-2 text-xs" data-testid="hierarchical-outliner">
      {/* 1. Architecture / Walls */}
      <div className="rounded-md border border-border/40 bg-card/50">
        <button
          type="button"
          onClick={() => toggleSection('architecture')}
          className="flex w-full items-center justify-between p-2 font-semibold text-muted-foreground hover:text-foreground"
          aria-expanded={openSections.architecture}
          data-testid="outliner-section-architecture"
        >
          <div className="flex items-center gap-1.5">
            {openSections.architecture ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <Layers className="size-3.5 text-primary" />
            <span>Architecture & Room ({WALLS.length} walls)</span>
          </div>
        </button>
        {openSections.architecture && (
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {WALLS.map((wall) => {
              const wallId = `wall-${wall}`;
              const isSelected = selectedId === wallId;
              return (
                <div
                  key={wallId}
                  role="button"
                  tabIndex={0}
                  data-testid={`outliner-node-${wallId}`}
                  aria-pressed={isSelected}
                  onClick={() => select(wallId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') select(wallId);
                  }}
                  className={cn(
                    'flex items-center justify-between rounded px-2 py-1 text-left cursor-pointer transition-colors',
                    isSelected ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-card-foreground'
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Square className="size-3 text-muted-foreground" />
                    <span>{WALL_LABEL[wall]}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {wall === 'back' || wall === 'front' ? `${project.room.width}mm` : `${project.room.length}mm`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Openings (Doors / Windows) */}
      {openings.length > 0 && (
        <div className="rounded-md border border-border/40 bg-card/50">
          <button
            type="button"
            onClick={() => toggleSection('openings')}
            className="flex w-full items-center justify-between p-2 font-semibold text-muted-foreground hover:text-foreground"
            aria-expanded={openSections.openings}
            data-testid="outliner-section-openings"
          >
            <div className="flex items-center gap-1.5">
              {openSections.openings ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <DoorOpen className="size-3.5 text-primary" />
              <span>Openings ({openings.length})</span>
            </div>
          </button>
          {openSections.openings && (
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {openings.map((op) => {
                const isSelected = selectedId === op.id;
                return (
                  <div
                    key={op.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`outliner-node-${op.id}`}
                    aria-pressed={isSelected}
                    onClick={() => select(op.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') select(op.id);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left cursor-pointer transition-colors',
                      isSelected ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-card-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <DoorOpen className="size-3 text-muted-foreground" />
                      <span className="truncate">{op.kind.toUpperCase()} ({WALL_LABEL[op.wallId]})</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {op.width}×{op.height}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Cabinetry */}
      <div className="rounded-md border border-border/40 bg-card/50">
        <button
          type="button"
          onClick={() => toggleSection('cabinetry')}
          className="flex w-full items-center justify-between p-2 font-semibold text-muted-foreground hover:text-foreground"
          aria-expanded={openSections.cabinetry}
          data-testid="outliner-section-cabinetry"
        >
          <div className="flex items-center gap-1.5">
            {openSections.cabinetry ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <Box className="size-3.5 text-primary" />
            <span>Cabinetry ({cabinets.length} units)</span>
          </div>
        </button>
        {openSections.cabinetry && (
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {cabinets.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">No cabinetry placed yet.</p>
            ) : (
              cabinets.map((cab) => {
                const isSelected = selectedId === cab.id;
                return (
                  <div
                    key={cab.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`outliner-node-${cab.id}`}
                    aria-pressed={isSelected}
                    onClick={() => select(cab.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') select(cab.id);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left cursor-pointer transition-colors group',
                      isSelected ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-card-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {renderIcon(cab)}
                      <span className="truncate">{elementLabel(cab)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn('size-5 p-0 opacity-0 group-hover:opacity-100', isSelected && 'opacity-100 text-primary-foreground')}
                        onClick={(e) => handleFocus(e, cab.id)}
                        title="Focus in 3D (F)"
                        aria-label={`Focus ${cab.id}`}
                      >
                        <Maximize2 className="size-3" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {cab.dimensions.width}mm
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 4. Appliances */}
      {appliances.length > 0 && (
        <div className="rounded-md border border-border/40 bg-card/50">
          <button
            type="button"
            onClick={() => toggleSection('appliances')}
            className="flex w-full items-center justify-between p-2 font-semibold text-muted-foreground hover:text-foreground"
            aria-expanded={openSections.appliances}
            data-testid="outliner-section-appliances"
          >
            <div className="flex items-center gap-1.5">
              {openSections.appliances ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <Refrigerator className="size-3.5 text-primary" />
              <span>Appliances ({appliances.length})</span>
            </div>
          </button>
          {openSections.appliances && (
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {appliances.map((app) => {
                const isSelected = selectedId === app.id;
                return (
                  <div
                    key={app.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`outliner-node-${app.id}`}
                    aria-pressed={isSelected}
                    onClick={() => select(app.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') select(app.id);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left cursor-pointer transition-colors group',
                      isSelected ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-card-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {renderIcon(app)}
                      <span className="truncate">{elementLabel(app)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn('size-5 p-0 opacity-0 group-hover:opacity-100', isSelected && 'opacity-100 text-primary-foreground')}
                        onClick={(e) => handleFocus(e, app.id)}
                        title="Focus in 3D (F)"
                      >
                        <Maximize2 className="size-3" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {app.dimensions.width}mm
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. Loose Furniture */}
      {furniture.length > 0 && (
        <div className="rounded-md border border-border/40 bg-card/50">
          <button
            type="button"
            onClick={() => toggleSection('furniture')}
            className="flex w-full items-center justify-between p-2 font-semibold text-muted-foreground hover:text-foreground"
            aria-expanded={openSections.furniture}
            data-testid="outliner-section-furniture"
          >
            <div className="flex items-center gap-1.5">
              {openSections.furniture ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <Armchair className="size-3.5 text-primary" />
              <span>Furniture ({furniture.length})</span>
            </div>
          </button>
          {openSections.furniture && (
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {furniture.map((fn) => {
                const isSelected = selectedId === fn.id;
                return (
                  <div
                    key={fn.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`outliner-node-${fn.id}`}
                    aria-pressed={isSelected}
                    onClick={() => select(fn.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') select(fn.id);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left cursor-pointer transition-colors group',
                      isSelected ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-card-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {renderIcon(fn)}
                      <span className="truncate">{elementLabel(fn)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn('size-5 p-0 opacity-0 group-hover:opacity-100', isSelected && 'opacity-100 text-primary-foreground')}
                        onClick={(e) => handleFocus(e, fn.id)}
                        title="Focus in 3D (F)"
                      >
                        <Maximize2 className="size-3" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {fn.dimensions.width}mm
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. MEP Service Points */}
      {mepPoints.length > 0 && (
        <div className="rounded-md border border-border/40 bg-card/50">
          <button
            type="button"
            onClick={() => toggleSection('mep')}
            className="flex w-full items-center justify-between p-2 font-semibold text-muted-foreground hover:text-foreground"
            aria-expanded={openSections.mep}
            data-testid="outliner-section-mep"
          >
            <div className="flex items-center gap-1.5">
              {openSections.mep ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <Plug className="size-3.5 text-primary" />
              <span>MEP Fixtures ({mepPoints.length})</span>
            </div>
          </button>
          {openSections.mep && (
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {mepPoints.map((mep) => {
                const isSelected = selectedId === mep.id;
                return (
                  <div
                    key={mep.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`outliner-node-${mep.id}`}
                    aria-pressed={isSelected}
                    onClick={() => select(mep.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') select(mep.id);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left cursor-pointer transition-colors',
                      isSelected ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-card-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Plug className="size-3 text-muted-foreground" />
                      <span className="truncate">{mep.label || mep.kind.toUpperCase()}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      @{mep.offset},{mep.elevation}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
