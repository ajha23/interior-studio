import { allElements, elementLabel, offsetAlongWall, WALL_LABEL, WALLS } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength } from '@/state/units';

/** Every element, grouped by wall in run order; a keyboard-accessible way to select. */
export function SceneOutline() {
  const project = useEditorStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const fmt = useFormatLength();
  if (!project) return null;
  const elements = allElements(project);
  return (
    <PanelSection title={`Scene · ${elements.length}`}>
      {elements.length === 0 && <p className="text-xs text-muted-foreground">No units yet. Add some from the library above.</p>}
      {[...WALLS, null].map((wall) => {
        // null = free-standing units and furniture, listed after the walls.
        const onWall = elements.filter((e) => (e.wallId ?? null) === wall).sort((a, b) => (wall ? offsetAlongWall(a) - offsetAlongWall(b) : a.position.x - b.position.x) || a.position.y - b.position.y);
        if (!onWall.length) return null;
        return (
          <div key={wall ?? 'free'} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{wall ? WALL_LABEL[wall] : 'Free-standing'}</span>
            {onWall.map((el) => (
              <button
                key={el.id}
                type="button"
                data-testid={`outline-${el.id}`}
                aria-pressed={el.id === selectedId}
                onClick={() => select(el.id)}
                className={cn('flex items-center justify-between rounded px-2 py-1 text-left text-[13px]', el.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
              >
                <span className="truncate">{elementLabel(el)}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{wall ? `@${fmt(offsetAlongWall(el))}` : ''}</span>
              </button>
            ))}
          </div>
        );
      })}
    </PanelSection>
  );
}
