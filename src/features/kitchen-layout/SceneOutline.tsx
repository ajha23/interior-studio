import { allElements, elementLabel, offsetAlongWall, WALL_LABEL, WALLS } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';

/** Every element, grouped by wall in run order; a keyboard-accessible way to select. */
export function SceneOutline() {
  const project = useEditorStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  if (!project) return null;
  const elements = allElements(project);
  return (
    <PanelSection title={`Scene · ${elements.length}`}>
      {elements.length === 0 && <p className="text-xs text-muted-foreground">No units yet. Add some from the library above.</p>}
      {WALLS.map((wall) => {
        const onWall = elements.filter((e) => e.wallId === wall).sort((a, b) => offsetAlongWall(a) - offsetAlongWall(b) || a.position.y - b.position.y);
        if (!onWall.length) return null;
        return (
          <div key={wall} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{WALL_LABEL[wall]}</span>
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
                <span className="text-[11px] text-muted-foreground tabular-nums">@{offsetAlongWall(el)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </PanelSection>
  );
}
