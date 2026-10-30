import { useEffect } from 'react';
import { offsetAlongWall, specFor, isCabinet, allElements, type Rotation } from '@/domain';
import { saveCurrentProject } from '@/features/projects/projectActions';
import { useEditorStore } from '@/state/editorStore';

function typingInField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Undo/redo, save, delete, deselect, arrow-key nudging, R rotate, and CAD navigation: F focus,
 * Home zoom extents, Tab / Shift+Tab cycle units, X toggles X-ray, I shows interiors, H toggles
 * interact mode (open doors and drawers), V walks through the room, / opens the command line.
 * All edits go through commands.
 */
export function useShortcuts(focusCommandLine: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveCurrentProject();
        return;
      }
      if (typingInField(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.key === 'Escape') {
        s.select(null);
        return;
      }
      if (e.key === '/' && !mod) {
        e.preventDefault();
        focusCommandLine();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        if (s.navMode === 'walk') s.requestWalk({ kind: 'start' });
        else s.requestCamera({ kind: 'fit' });
        return;
      }
      if (!mod && e.key.toLowerCase() === 'v') {
        s.setNavMode(s.navMode === 'walk' ? 'orbit' : 'walk');
        return;
      }
      // Tab cycles units only when focus is not on a control, so keyboard navigation still works.
      if (e.key === 'Tab' && (document.activeElement === document.body || document.activeElement instanceof HTMLCanvasElement)) {
        e.preventDefault();
        s.cycleSelection(e.shiftKey ? -1 : 1);
        return;
      }
      if (!mod && e.key.toLowerCase() === 'x') {
        s.setVisualStyle(s.visualStyle === 'xray' ? 'realistic' : 'xray');
        return;
      }
      if (!mod && e.key.toLowerCase() === 'f') {
        s.focusSelection();
        return;
      }
      if (!mod && e.key.toLowerCase() === 'h') {
        s.setInteractMode(!s.interactMode);
        return;
      }
      if (!mod && e.key.toLowerCase() === 'i') {
        s.setShowInteriors(!s.showInteriors);
        return;
      }
      const el = s.project && s.selectedId ? allElements(s.project).find((x) => x.id === s.selectedId) : undefined;
      if (!el) return;
      if (!mod && e.key.toLowerCase() === 'r') {
        const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
        if (spec.mount === 'wall') {
          s.report('error', `A ${spec.label.toLowerCase()} hangs on a wall and cannot be rotated.`);
          return;
        }
        s.dispatch({ type: 'rotate_entity', entityId: el.id, rotationY: ((el.rotationY + (e.shiftKey ? 270 : 90)) % 360) as Rotation });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.dispatch({ type: 'remove_entity', entityId: el.id });
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
        const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
        if (!el.wallId) {
          // Free-standing: arrows move in plan (left/right = x, up/down = towards the back/front).
          const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
          s.dispatch({ type: 'place_entity', entityId: el.id, x: el.position.x + (horizontal ? step : 0), z: el.position.z + (horizontal ? 0 : step), rotationY: el.rotationY });
          return;
        }
        const offset = offsetAlongWall(el) + step;
        if (offset < 0) return;
        s.dispatch({ type: 'move_entity', entityId: el.id, placement: { wallId: el.wallId, offset, elevation: spec.mount === 'wall' ? el.position.y : undefined } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusCommandLine]);
}
