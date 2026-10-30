import { Crosshair, RotateCw, Trash2 } from 'lucide-react';
import {
  isCabinet,
  offsetAlongWall,
  specFor,
  validateProject,
  WALL_LABEL,
  WALLS,
  type Dimensions,
  type KitchenElement,
  type Rotation,
  type WallId,
} from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { InteriorEditor } from '@/features/cabinet-interior/InteriorEditor';
import { OpeningsPanel } from './OpeningsPanel';
import { PanelSection } from '@/components/layout/PanelSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MmField } from '@/components/ui/mm-field';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FinishPicker } from '@/features/material-editor/FinishPicker';
import { useEditorStore } from '@/state/editorStore';

/** Properties of the selected cabinet or appliance. Every field dispatches a validated command. */
export function ElementInspector({ element }: { element: KitchenElement }) {
  const project = useEditorStore((s) => s.project)!;
  const dispatch = useEditorStore((s) => s.dispatch);
  const cabinet = isCabinet(element) ? element : null;
  const spec = specFor(cabinet ? 'cabinet' : 'appliance', element.type);
  const wallId: WallId = element.wallId ?? 'back';
  const offset = offsetAlongWall(element);
  const issues = validateProject(project).filter((i) => i.entityIds.includes(element.id));
  const box = elementBox(element);
  const place = (x: number, z: number) => dispatch({ type: 'place_entity', entityId: element.id, x, z, rotationY: element.rotationY });

  const resize = (patch: Partial<Dimensions>) => {
    const dimensions = { ...element.dimensions, ...patch };
    if (cabinet) dispatch({ type: 'resize_cabinet', cabinetId: element.id, dimensions });
    else dispatch({ type: 'resize_appliance', applianceId: element.id, width: dimensions.width });
  };
  const move = (placement: { wallId?: WallId; offset?: number; elevation?: number }) =>
    dispatch({
      type: 'move_entity',
      entityId: element.id,
      placement: { wallId: placement.wallId ?? wallId, offset: placement.offset ?? (placement.wallId ? 0 : offset), elevation: spec.mount === 'wall' ? (placement.elevation ?? element.position.y) : undefined },
    });

  return (
    <div aria-label="Properties">
      <PanelSection title="Selected">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold" data-testid="inspector-title">{spec.label}</h2>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{element.id}</p>
          </div>
          <Badge>{cabinet ? 'Cabinet' : 'Appliance'}</Badge>
        </div>
        <Button variant="outline" size="xs" className="self-start" onClick={() => useEditorStore.getState().focusSelection()} title="Fly the 3D camera to this unit (F)">
          <Crosshair /> Focus in 3D
        </Button>
      </PanelSection>

      <PanelSection title="Dimensions">
        {cabinet ? (
          <>
            <MmField label="Width" value={element.dimensions.width} onCommit={(width) => resize({ width })} testId="inspector-width" hint={spec.widthRange ? `Any width ${spec.widthRange.min}–${spec.widthRange.max} mm · standard sizes:` : `Supported: ${spec.widths.join(', ')}`} />
            <div className="flex flex-wrap gap-1" aria-label="Supported widths">
              {spec.widths.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => w !== element.dimensions.width && resize({ width: w })}
                  className={cn('rounded border px-1.5 py-0.5 text-[11px] tabular-nums', w === element.dimensions.width ? 'border-highlight bg-accent text-accent-foreground' : 'hover:bg-muted')}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MmField label="Height" value={element.dimensions.height} onCommit={(height) => resize({ height })} testId="inspector-height" hint={`${spec.height.min}–${spec.height.max}`} />
              <MmField label="Depth" value={element.dimensions.depth} onCommit={(depth) => resize({ depth })} testId="inspector-depth" hint={`${spec.depth.min}–${spec.depth.max}`} />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="appliance-width">Width</Label>
              <Select id="appliance-width" value={element.dimensions.width} onChange={(e) => resize({ width: Number(e.target.value) })}>
                {spec.widths.map((w) => <option key={w} value={w}>{w} mm</option>)}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Height {element.dimensions.height} mm · depth {element.dimensions.depth} mm (fixed for appliance placeholders).
            </p>
          </>
        )}
      </PanelSection>

      <PanelSection title="Position">
        <div className="flex flex-col gap-1">
          <Label htmlFor="element-wall">Placement</Label>
          <Select
            id="element-wall"
            value={element.wallId ?? 'free'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'free') dispatch({ type: 'place_entity', entityId: element.id, x: element.position.x, z: element.position.z, rotationY: element.rotationY });
              else move({ wallId: v as WallId });
            }}
          >
            {WALLS.map((w) => <option key={w} value={w}>On the {WALL_LABEL[w].toLowerCase()}</option>)}
            {spec.mount === 'floor' && <option value="free">Free-standing (island)</option>}
          </Select>
        </div>
        {element.wallId ? (
          <div className="grid grid-cols-2 gap-2">
            <MmField label="Along wall" value={offset} onCommit={(o) => move({ offset: o })} testId="inspector-offset" hint="From the wall start" />
            <MmField
              label="Elevation"
              value={element.position.y}
              onCommit={(elevation) => move({ elevation })}
              disabled={spec.mount === 'floor'}
              hint={spec.mount === 'floor' ? 'Stands on the floor' : 'Bottom above floor'}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MmField label="From left wall" value={box.minX} testId="inspector-from-left" onCommit={(v) => place(v + (box.maxX - box.minX) / 2, element.position.z)} />
              <MmField label="From back wall" value={box.minZ} testId="inspector-from-back" onCommit={(v) => place(element.position.x, v + (box.maxZ - box.minZ) / 2)} />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="element-rotation">Facing</Label>
                <Select id="element-rotation" value={element.rotationY} onChange={(e) => dispatch({ type: 'rotate_entity', entityId: element.id, rotationY: Number(e.target.value) as Rotation })}>
                  <option value={0}>Front (0°)</option>
                  <option value={90}>Right (90°)</option>
                  <option value={180}>Back (180°)</option>
                  <option value={270}>Left (270°)</option>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'rotate_entity', entityId: element.id, rotationY: (((element.rotationY + 90) % 360) as Rotation) })} title="Rotate 90° (R)">
                <RotateCw /> 90°
              </Button>
            </div>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">Drag the unit in 3D or the plan: it snaps onto walls, or stands free in the room. Arrow keys nudge 10 mm (Shift: 100 mm).</p>
      </PanelSection>

      <OpeningsPanel element={element} />

      {cabinet && <InteriorEditor key={cabinet.id} cabinet={cabinet} />}

      {cabinet && (
        <PanelSection title="Finish">
          <FinishPicker label="Shutters" category="shutter" materials={project.materials} value={cabinet.materialId} onPick={(materialId) => dispatch({ type: 'set_material', targetIds: [cabinet.id], materialId })} />
          <Button
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => dispatch({ type: 'set_material', targetIds: project.cabinets.map((c) => c.id), materialId: cabinet.materialId })}
          >
            Apply this finish to all {project.cabinets.length} cabinets
          </Button>
        </PanelSection>
      )}

      {issues.length > 0 && (
        <PanelSection title="Validation">
          <ul className="text-xs text-destructive">{issues.map((i) => <li key={i.message}>{i.message}</li>)}</ul>
        </PanelSection>
      )}

      <PanelSection title="Actions">
        <Button variant="outline" size="sm" className="self-start text-destructive" onClick={() => dispatch({ type: 'remove_entity', entityId: element.id })}>
          <Trash2 /> Remove unit
        </Button>
      </PanelSection>
    </div>
  );
}
