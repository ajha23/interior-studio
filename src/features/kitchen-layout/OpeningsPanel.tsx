import { useMemo } from 'react';
import type { KitchenElement } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { Button } from '@/components/ui/button';
import { buildModel } from '@/engine/geometry/parts';
import { useEditorStore } from '@/state/editorStore';
import { openingOf } from '@/state/openings';

/** Every door, drawer and basket of the selected unit, each with an open/close toggle. */
export function OpeningsPanel({ element }: { element: KitchenElement }) {
  const movers = useMemo(() => buildModel(element).movers, [element]);
  const openness = useEditorStore((s) => s.openness);
  const interactMode = useEditorStore((s) => s.interactMode);
  const { toggleOpening, setAllOpen, setInteractMode } = useEditorStore.getState();
  if (!movers.length) return null;
  return (
    <PanelSection
      title="Doors & drawers"
      action={
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => setAllOpen(element.id, true)}>Open all</Button>
          <Button size="xs" variant="ghost" onClick={() => setAllOpen(element.id, false)}>Close all</Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-1" aria-label="Doors and drawers">
        {movers.map((m) => {
          const open = openingOf(openness, element.id, m.id) >= 0.5;
          return (
            <Button key={m.id} size="xs" variant={open ? 'selected' : 'outline'} aria-pressed={open} onClick={() => toggleOpening(element.id, m.id)} data-testid={`opening-${m.id}`}>
              {m.label}: {open ? 'open' : 'closed'}
            </Button>
          );
        })}
      </div>
      {!interactMode && (
        <p className="text-[11px] text-muted-foreground">
          Or open them by hand in 3D:{' '}
          <button type="button" className="text-highlight underline" onClick={() => setInteractMode(true)}>
            turn on Interact (H)
          </button>
          .
        </p>
      )}
    </PanelSection>
  );
}
