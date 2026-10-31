import { DoorOpen, PanelTop } from 'lucide-react';
import { allElements, elementLabel, OPENING_SPECS, WALL_LABEL, wallLength, type Room, type WallId } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MmField } from '@/components/ui/mm-field';
import { FinishPicker } from '@/features/material-editor/FinishPicker';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength } from '@/state/units';

export const wallEntityId = (w: WallId) => `wall-${w}`;
export function wallFromId(id: string | null): WallId | null {
  const m = id ? /^wall-(back|left|right|front)$/.exec(id) : null;
  return m ? (m[1] as WallId) : null;
}

/**
 * A selected wall: its length (which is the room's width or length), height and thickness, and the
 * openings and units on it. Walls share the room's height, thickness and finish.
 */
export function WallInspector({ wallId }: { wallId: WallId }) {
  const project = useEditorStore((s) => s.project)!;
  const dispatch = useEditorStore((s) => s.dispatch);
  const select = useEditorStore((s) => s.select);
  const fmt = useFormatLength();
  const room = project.room;
  const alongWidth = wallId === 'back' || wallId === 'front';
  const setRoom = (patch: Partial<Room>) => dispatch({ type: 'set_room', room: { ...room, ...patch } });
  const openings = project.openings.filter((o) => o.wallId === wallId).sort((a, b) => a.offset - b.offset);
  const units = allElements(project).filter((e) => e.wallId === wallId);

  return (
    <div aria-label="Wall properties">
      <PanelSection title="Selected">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold" data-testid="inspector-title">{WALL_LABEL[wallId]}</h2>
          <Badge>Wall</Badge>
        </div>
      </PanelSection>
      <PanelSection title="Size">
        <MmField
          label={alongWidth ? 'Length (= room width)' : 'Length (= room length)'}
          value={wallLength(room, wallId)}
          onCommit={(v) => setRoom(alongWidth ? { width: v } : { length: v })}
          testId="wall-length"
          hint={alongWidth ? 'Changes the back and front walls together' : 'Changes the left and right walls together'}
        />
        <div className="grid grid-cols-2 gap-2">
          <MmField label="Height" value={room.height} onCommit={(height) => setRoom({ height })} hint="All walls" />
          <MmField label="Thickness" value={room.wallThickness} onCommit={(wallThickness) => setRoom({ wallThickness })} hint="All walls" />
        </div>
      </PanelSection>
      <PanelSection title={`Openings · ${openings.length}`}>
        {openings.length === 0 && <p className="text-xs text-muted-foreground">No doors or windows on this wall.</p>}
        <ul className="flex flex-col gap-0.5">
          {openings.map((o) => (
            <li key={o.id}>
              <button type="button" className="flex w-full justify-between rounded px-2 py-1 text-left text-[13px] hover:bg-muted" onClick={() => select(o.id)}>
                <span>{OPENING_SPECS[o.kind].label}</span>
                <span className="text-[11px] text-muted-foreground">{fmt(o.width)} @ {fmt(o.offset)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-1">
          <Button size="xs" variant="outline" onClick={() => dispatch({ type: 'add_opening', kind: 'door', wallId })}>
            <DoorOpen /> Add door
          </Button>
          <Button size="xs" variant="outline" onClick={() => dispatch({ type: 'add_opening', kind: 'window', wallId })}>
            <PanelTop /> Add window
          </Button>
        </div>
      </PanelSection>
      <PanelSection title={`Units on this wall · ${units.length}`}>
        <ul className="flex flex-col gap-0.5">
          {units.map((el) => (
            <li key={el.id}>
              <button type="button" className="w-full rounded px-2 py-1 text-left text-[13px] hover:bg-muted" onClick={() => select(el.id)}>
                {elementLabel(el)}
              </button>
            </li>
          ))}
        </ul>
      </PanelSection>
      <PanelSection title="Finish">
        <FinishPicker label="Walls (all)" category="wall" materials={project.materials} value={project.surfaces.wall} onPick={(materialId) => dispatch({ type: 'set_surface_material', surface: 'wall', materialId })} />
      </PanelSection>
    </div>
  );
}
