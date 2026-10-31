import { DoorOpen, Trash2 } from 'lucide-react';
import { OPENING_SPECS, WALL_LABEL, WALLS, type Opening, type WallId } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MmField } from '@/components/ui/mm-field';
import { Select } from '@/components/ui/select';
import { useEditorStore } from '@/state/editorStore';
import { openingOf } from '@/state/openings';
import { useFormatLength } from '@/state/units';

type Patch = Partial<Pick<Opening, 'wallId' | 'offset' | 'width' | 'height' | 'sill' | 'swing' | 'hinge'>>;

/** Properties of the selected door, window or opening. Every field dispatches `update_opening`. */
export function OpeningInspector({ opening }: { opening: Opening }) {
  const dispatch = useEditorStore((s) => s.dispatch);
  const openness = useEditorStore((s) => s.openness);
  const toggleOpening = useEditorStore((s) => s.toggleOpening);
  const spec = OPENING_SPECS[opening.kind];
  const fmt = useFormatLength();
  const update = (patch: Patch) => dispatch({ type: 'update_opening', id: opening.id, ...patch });
  const fixedSill = spec.sill.min === spec.sill.max;
  const open = openingOf(openness, opening.id, 'leaf') >= 0.5;

  return (
    <div aria-label="Opening properties">
      <PanelSection title="Selected">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold" data-testid="inspector-title">{spec.label}</h2>
          <Badge>Wall opening</Badge>
        </div>
      </PanelSection>

      <PanelSection title="Position">
        <div className="flex flex-col gap-1">
          <Label htmlFor="opening-wall">Wall</Label>
          <Select id="opening-wall" value={opening.wallId} onChange={(e) => update({ wallId: e.target.value as WallId })}>
            {WALLS.map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
          </Select>
        </div>
        <MmField label="Along wall" value={opening.offset} onCommit={(offset) => update({ offset })} testId="opening-offset" hint="From the wall start to the opening's edge" />
      </PanelSection>

      <PanelSection title="Size">
        <div className="grid grid-cols-2 gap-2">
          <MmField label="Width" value={opening.width} onCommit={(width) => update({ width })} testId="opening-width" hint={`${fmt(spec.width.min)}–${fmt(spec.width.max)}`} />
          <MmField label="Height" value={opening.height} onCommit={(height) => update({ height })} hint={`${fmt(spec.height.min)}–${fmt(spec.height.max)}`} />
          <MmField label="Sill height" value={opening.sill} onCommit={(sill) => update({ sill })} disabled={fixedSill} hint={fixedSill ? 'Starts at the floor' : `${fmt(spec.sill.min)}–${fmt(spec.sill.max)}`} />
        </div>
      </PanelSection>

      {opening.kind === 'door' && (
        <PanelSection title="Door">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="door-swing">Opens</Label>
              <Select id="door-swing" value={opening.swing} onChange={(e) => update({ swing: e.target.value as Opening['swing'] })}>
                <option value="in">Into the room</option>
                <option value="out">Out of the room</option>
                <option value="none">Sliding</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="door-hinge">Hinged on the</Label>
              <Select id="door-hinge" value={opening.hinge} onChange={(e) => update({ hinge: e.target.value as Opening['hinge'] })}>
                <option value="left">Left (from inside)</option>
                <option value="right">Right (from inside)</option>
              </Select>
            </div>
          </div>
          {opening.swing !== 'none' && (
            <Button size="xs" variant={open ? 'selected' : 'outline'} className="self-start" aria-pressed={open} data-testid="opening-leaf" onClick={() => toggleOpening(opening.id, 'leaf')}>
              <DoorOpen /> Door: {open ? 'open' : 'closed'}
            </Button>
          )}
          {opening.swing === 'in' && <p className="text-[11px] text-muted-foreground">Units are kept out of the floor area the door sweeps.</p>}
        </PanelSection>
      )}

      <PanelSection title="Actions">
        <Button variant="outline" size="sm" className="self-start text-destructive" onClick={() => dispatch({ type: 'remove_opening', id: opening.id })}>
          <Trash2 /> Remove {spec.label.toLowerCase()}
        </Button>
      </PanelSection>
    </div>
  );
}
