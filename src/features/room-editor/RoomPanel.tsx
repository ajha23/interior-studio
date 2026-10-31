import { ROOM_LIMITS, ROOM_PRESETS, layoutFitErrors, type Layout, type Room, type Surface } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { Button } from '@/components/ui/button';
import { MmField } from '@/components/ui/mm-field';
import { FinishPicker } from '@/features/material-editor/FinishPicker';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength } from '@/state/units';

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'l-shaped', label: 'L-shaped' },
  { value: 'empty', label: 'Clear' },
];

const SURFACES: { surface: Surface; label: string }[] = [
  { surface: 'countertop', label: 'Worktop' },
  { surface: 'carcass', label: 'Carcass' },
  { surface: 'floor', label: 'Floor' },
  { surface: 'wall', label: 'Walls' },
];

/** Shown when nothing is selected: room dimensions, layout presets and room-wide finishes. */
export function RoomPanel() {
  const project = useEditorStore((s) => s.project)!;
  const dispatch = useEditorStore((s) => s.dispatch);
  const fmt = useFormatLength();
  const setRoom = (patch: Partial<Room>) => dispatch({ type: 'set_room', room: { ...project.room, ...patch } });
  const hasUnits = project.cabinets.length + project.appliances.length > 0;

  const applyLayout = (layout: Layout) => {
    const fit = layoutFitErrors(project.room, layout);
    if (fit.length === 0 && hasUnits && !window.confirm(layout === 'empty' ? 'Remove every unit from the kitchen? You can undo this.' : `Replace the current kitchen with the ${layout} layout? You can undo this.`)) return;
    dispatch({ type: 'apply_layout', layout });
  };

  const range = (k: keyof Room) => `${fmt(ROOM_LIMITS[k].min)}–${fmt(ROOM_LIMITS[k].max)}`;
  return (
    <div aria-label="Room properties">
      <PanelSection title="Room">
        <div className="grid grid-cols-2 gap-2">
          <MmField label="Width (back wall)" value={project.room.width} onCommit={(width) => setRoom({ width })} testId="room-width" hint={range('width')} />
          <MmField label="Length (side walls)" value={project.room.length} onCommit={(length) => setRoom({ length })} testId="room-length" hint={range('length')} />
          <MmField label="Ceiling height" value={project.room.height} onCommit={(height) => setRoom({ height })} hint={range('height')} />
          <MmField label="Wall thickness" value={project.room.wallThickness} onCommit={(wallThickness) => setRoom({ wallThickness })} hint={range('wallThickness')} />
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Room presets">
          {ROOM_PRESETS.map((p) => (
            <button key={p.id} type="button" title={`${fmt(p.room.width)} × ${fmt(p.room.length)}`} onClick={() => setRoom(p.room)} className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted">
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Units on the right and front walls move with their wall when the room changes size.</p>
      </PanelSection>

      <PanelSection title="Layout preset">
        <div className="grid grid-cols-3 gap-1.5">
          {LAYOUTS.map((l) => (
            <Button key={l.value} variant="outline" size="sm" onClick={() => applyLayout(l.value)}>
              {l.label}
            </Button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Finishes">
        {SURFACES.map(({ surface, label }) => (
          <FinishPicker key={surface} label={label} category={surface} materials={project.materials} value={project.surfaces[surface]} onPick={(materialId) => dispatch({ type: 'set_surface_material', surface, materialId })} />
        ))}
      </PanelSection>

      <PanelSection title="Tip" className="border-b-0">
        <p className="text-xs text-muted-foreground">Click a unit in the 3D view, the plan or the scene list to edit it. Esc clears the selection.</p>
      </PanelSection>
    </div>
  );
}
