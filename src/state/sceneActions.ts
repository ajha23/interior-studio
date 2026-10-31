/**
 * Carries out the assistant's scene actions in the editor, the way a person would act in the room:
 * open or close doors and drawers (doors in front of an inner drawer open first), walk to a unit or
 * a spot, look from a view, switch views. None of this changes the design or its history.
 */
import { findEntity } from '@/ai/entities';
import { lengthToMm } from '@/ai/compile';
import type { SceneAction } from '@/ai/schema';
import { allElements, type KitchenProject } from '@/domain';
import { buildOpeningModel } from '@/engine/geometry/openingParts';
import { buildModel, type Mover } from '@/engine/geometry/parts';
import { useEditorStore } from './editorStore';

function moversOf(project: KitchenProject, id: string): Mover[] {
  const el = allElements(project).find((e) => e.id === id);
  if (el) return buildModel(el).movers;
  const o = project.openings.find((x) => x.id === id);
  return o ? buildOpeningModel(o, project.room).movers : [];
}

/** The movers a phrase like "top drawer", "left door" or "drawers" names (all when no phrase). */
export function pickMovers(movers: Mover[], part: string | undefined): Mover[] {
  if (!part) return movers;
  const words = part.toLowerCase().replace(/s\b/g, '').split(/\s+/).filter((w) => !['the', 'a', 'of'].includes(w));
  const position = words.find((w) => ['top', 'upper', 'bottom', 'lower', 'middle'].includes(w));
  const side = words.find((w) => w === 'left' || w === 'right');
  const kind = words.find((w) => w === 'door' || w === 'drawer' || w === 'flap');
  let pool = movers.filter((m) => {
    const label = m.label.toLowerCase();
    return (!kind || label.includes(kind) || (kind === 'flap' && m.kind === 'drop')) && (!side || label.includes(side));
  });
  if (!pool.length) return [];
  if (position) {
    const byHeight = [...pool].sort((a, b) => b.span[1] - a.span[1]);
    const pick = position === 'top' || position === 'upper' ? byHeight[0] : position === 'middle' ? byHeight[Math.floor(byHeight.length / 2)] : byHeight.at(-1);
    pool = pick ? [pick] : [];
  }
  return pool;
}

const nameOf = (project: KitchenProject, id: string) => findEntity(project, id)?.label ?? id;

export function runSceneAction(action: SceneAction, ids: string[]): string {
  const editor = useEditorStore.getState();
  const project = editor.project;
  if (!project) return 'No project is open.';
  // Doors and walking are seen in 3D.
  const show3d = () => editor.view !== '3d' && editor.view !== 'split' && editor.setView('3d');

  switch (action.action) {
    case 'open':
    case 'close': {
      const open = action.action === 'open';
      const verb = open ? 'Opened' : 'Closed';
      show3d();
      if (action.all || !ids.length) {
        editor.setAllOpen(null, open);
        return `${verb} every door and drawer.`;
      }
      const done: string[] = [];
      for (const id of ids) {
        const movers = moversOf(project, id);
        if (!movers.length) {
          done.push(`${nameOf(project, id)} has nothing to ${action.action}`);
          continue;
        }
        const picked = pickMovers(movers, action.part);
        if (!picked.length) {
          done.push(`${nameOf(project, id)} has no ${action.part} (it has ${movers.map((m) => m.label.toLowerCase()).join(', ')})`);
          continue;
        }
        if (!action.part) editor.setAllOpen(id, open);
        else
          for (const m of picked) {
            // Like a person: open the door in front of an inner drawer first; close the drawer before its door.
            if (open) for (const r of m.requires) editor.setOpening(id, r, 1);
            editor.setOpening(id, m.id, open ? 1 : 0);
          }
        done.push(`${nameOf(project, id)}${action.part ? ` (${picked.map((m) => m.label.toLowerCase()).join(', ')})` : ''}`);
      }
      return `${verb}: ${done.join('; ')}.`;
    }
    case 'walk_to': {
      const id = ids[0];
      if (!id) return 'I could not tell where to walk.';
      editor.requestWalk({ kind: 'stand', id });
      return `Walking to the ${nameOf(project, id).toLowerCase()}.`;
    }
    case 'walk': {
      try {
        const x = lengthToMm(action.x, 'Distance from the left wall');
        const z = lengthToMm(action.z, 'Distance from the back wall');
        editor.requestWalk({ kind: 'goto', x: Math.min(project.room.width - 300, Math.max(300, x)), z: Math.min(project.room.length - 300, Math.max(300, z)) });
        return `Walking to ${x} mm from the left wall and ${z} mm from the back wall.`;
      } catch (e) {
        return e instanceof Error ? e.message : 'That spot is not in the room.';
      }
    }
    case 'look': {
      if (editor.navMode === 'walk') editor.setNavMode('orbit');
      show3d();
      editor.requestCamera(action.view === 'fit' ? { kind: 'fit' } : { kind: 'preset', preset: action.view });
      return action.view === 'fit' ? 'Showing the whole room.' : `Looking from the ${action.view === 'iso' ? 'corner (isometric)' : action.view} view.`;
    }
    case 'focus': {
      const id = ids[0];
      if (!id) return 'I could not tell what to look at.';
      if (editor.navMode === 'walk') editor.setNavMode('orbit');
      show3d();
      editor.select(id);
      editor.requestCamera({ kind: 'focus', id });
      return `Looking at the ${nameOf(project, id).toLowerCase()}.`;
    }
    case 'select': {
      const id = ids[0];
      if (!id) return 'I could not tell what to select.';
      editor.select(id);
      return `Selected the ${nameOf(project, id).toLowerCase()}.`;
    }
    case 'view':
      editor.setView(action.mode);
      return `Showing the ${action.mode === '3d' ? '3D view' : action.mode === 'plan' ? 'plan' : 'plan and 3D side by side'}.`;
    case 'viewpoint': {
      const q = action.name.toLowerCase();
      const vp = project.viewpoints.find((v) => v.name.toLowerCase() === q) ?? project.viewpoints.find((v) => v.name.toLowerCase().includes(q));
      if (!vp) return project.viewpoints.length ? `There is no viewpoint called “${action.name}”. Saved: ${project.viewpoints.map((v) => v.name).join(', ')}.` : 'No viewpoints are saved yet.';
      editor.requestWalk({ kind: 'pose', pose: { x: vp.x, z: vp.z, yaw: vp.yaw, pitch: vp.pitch } });
      return `Standing at “${vp.name}”.`;
    }
    case 'style':
      editor.setVisualStyle(action.style);
      return `Showing the ${action.style === 'xray' ? 'x-ray' : action.style} style.`;
    case 'start_walking':
      editor.requestWalk({ kind: 'start' });
      return 'Walking in the room: drag to look around, use the arrow keys or click the floor to move.';
    case 'stop_walking':
      editor.setNavMode('orbit');
      return 'Stopped walking.';
  }
}
