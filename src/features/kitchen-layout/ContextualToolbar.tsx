import { Copy, Maximize2, RotateCw, Trash2, X } from 'lucide-react';
import { elementLabel, type Rotation } from '@/domain';
import { useEditorStore, useSelectedElement, useSelectedOpening } from '@/state/editorStore';
import { Button } from '@/components/ui/button';

export function ContextualToolbar() {
  const selectedElement = useSelectedElement();
  const selectedOpening = useSelectedOpening();
  const select = useEditorStore((s) => s.select);
  const dispatch = useEditorStore((s) => s.dispatch);
  const requestCamera = useEditorStore((s) => s.requestCamera);

  if (!selectedElement && !selectedOpening) return null;

  const title = selectedElement
    ? elementLabel(selectedElement)
    : selectedOpening
    ? `${selectedOpening.kind.toUpperCase()} (${selectedOpening.wallId})`
    : 'Selected Item';

  const handleRotate = () => {
    if (selectedElement && 'rotationY' in selectedElement) {
      const nextRotation = ((selectedElement.rotationY + 90) % 360) as Rotation;
      dispatch({ type: 'rotate_entity', entityId: selectedElement.id, rotationY: nextRotation });
    }
  };

  const handleFocus = () => {
    const id = selectedElement?.id ?? selectedOpening?.id;
    if (id) {
      requestCamera({ kind: 'focus', id });
    }
  };

  const handleDuplicate = () => {
    if (!selectedElement) return;
    if ('interior' in selectedElement) {
      dispatch({
        type: 'add_cabinet',
        cabinetType: selectedElement.type,
        dimensions: selectedElement.dimensions,
      });
    } else if ('kind' in selectedElement && selectedElement.kind === 'furniture') {
      dispatch({
        type: 'add_furniture',
        furnitureType: selectedElement.type,
        dimensions: selectedElement.dimensions,
      });
    } else if ('applianceType' in selectedElement || 'type' in selectedElement) {
      dispatch({
        type: 'add_appliance',
        applianceType: (selectedElement as { type: 'fridge' | 'range' | 'dishwasher' | 'hood' }).type,
        width: selectedElement.dimensions.width,
      });
    }
  };

  const handleDelete = () => {
    if (selectedElement) {
      dispatch({ type: 'remove_entity', entityId: selectedElement.id });
    } else if (selectedOpening) {
      dispatch({ type: 'remove_opening', id: selectedOpening.id });
    }
  };

  return (
    <div
      data-testid="contextual-toolbar"
      className="absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex items-center gap-2 border-r border-border pr-2.5">
        <span className="text-xs font-semibold text-foreground truncate max-w-[140px]" title={title}>
          {title}
        </span>
      </div>

      {selectedElement && 'rotationY' in selectedElement && (
        <Button
          size="xs"
          variant="ghost"
          onClick={handleRotate}
          title="Rotate 90° (R)"
          data-testid="context-rotate-btn"
          className="h-7 px-2 text-xs"
        >
          <RotateCw className="size-3.5 mr-1" />
          <span>Rotate</span>
        </Button>
      )}

      <Button
        size="xs"
        variant="ghost"
        onClick={handleFocus}
        title="Focus in 3D (F)"
        data-testid="context-focus-btn"
        className="h-7 px-2 text-xs"
      >
        <Maximize2 className="size-3.5 mr-1" />
        <span>Focus</span>
      </Button>

      {selectedElement && (
        <Button
          size="xs"
          variant="ghost"
          onClick={handleDuplicate}
          title="Duplicate Element"
          data-testid="context-duplicate-btn"
          className="h-7 px-2 text-xs"
        >
          <Copy className="size-3.5 mr-1" />
          <span>Duplicate</span>
        </Button>
      )}

      <Button
        size="xs"
        variant="ghost"
        onClick={handleDelete}
        title="Delete (Del)"
        data-testid="context-delete-btn"
        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5 mr-1" />
        <span>Delete</span>
      </Button>

      <div className="border-l border-border pl-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => select(null)}
          title="Deselect (Esc)"
          data-testid="context-close-btn"
          className="size-6 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
