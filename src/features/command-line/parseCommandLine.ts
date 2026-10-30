/**
 * AutoCAD-style command line: short aliases and numbers in millimetres, e.g. `w 900`, `m +50`,
 * `e`, `ze`, `add base 600`, `finish oak`. Parsing is pure and returns an action; design edits are
 * ordinary `DesignCommand`s, so they go through the same validation as every other edit.
 */
import {
  allElements,
  APPLIANCE_SPECS,
  CABINET_SPECS,
  INTERIOR_PRESETS,
  isCabinet,
  offsetAlongWall,
  specFor,
  WALLS,
  type ApplianceType,
  type CabinetType,
  type DesignCommand,
  type KitchenElement,
  type KitchenProject,
  type MaterialCategory,
  type Rotation,
  type Surface,
  type WallId,
} from '@/domain';
import { footprintSize } from '@/engine/geometry/box';
import { parseMm } from '@/engine/measurement/format';
import type { CameraPreset, Projection, VisualStyle } from '@/state/editorStore';

export type ViewAction =
  | { kind: 'fit' }
  | { kind: 'focus' }
  | { kind: 'preset'; preset: CameraPreset }
  | { kind: 'style'; style: VisualStyle }
  | { kind: 'projection'; projection: Projection }
  | { kind: 'mode'; mode: '3d' | 'plan' }
  | { kind: 'toggle'; what: 'grid' | 'walls' | 'bom' | 'inside' };

export type CommandLineAction =
  | { kind: 'design'; command: DesignCommand }
  | { kind: 'view'; action: ViewAction }
  | { kind: 'history'; action: 'undo' | 'redo' }
  | { kind: 'select'; id: string | null }
  | { kind: 'cycle'; direction: 1 | -1 }
  | { kind: 'open'; open: boolean; all: boolean }
  | { kind: 'interact' }
  | { kind: 'walk'; on: boolean }
  | { kind: 'stand' }
  | { kind: 'eye'; mm: number }
  | { kind: 'save' }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

export interface CommandContext {
  project: KitchenProject;
  selectedId: string | null;
}

export const COMMAND_HELP: { usage: string; does: string }[] = [
  { usage: 'w 900 · h 720 · d 560 · size 900x720x560', does: 'Resize the selected unit' },
  { usage: 'm 1200 · m +50 · m -100 · m left 600', does: 'Move along its wall (or to another wall)' },
  { usage: 'elev 1500', does: 'Height of a wall unit above the floor' },
  { usage: 'free · at 1200 900 · ro 90', does: 'Free-standing: position from the left/back walls, rotate' },
  { usage: 'shelves 4 · interior crockery|wardrobe|drawers|pantry|bottles|split|empty', does: 'Cabinet interior' },
  { usage: 'glass · solid · open · inside', does: 'Door style · show interiors in 3D' },
  { usage: 'interact · opendoors · closedoors · open all · close all', does: 'Open doors and drawers like in real life (H)' },
  { usage: 'walk · orbit · stand · eye 1150', does: 'Walk through the room at eye height (V), stand at the selected unit' },
  { usage: 'finish oak · worktop granite · floor tile · walls sage · carcass grey', does: 'Change finishes' },
  { usage: 'add base 600 · add wall 800 · add fridge', does: 'Add a unit in the first free spot' },
  { usage: 'e / erase', does: 'Delete the selected unit' },
  { usage: 'u / undo · redo', does: 'Undo or redo' },
  { usage: 'next · prev · sel sink 2 · sel none', does: 'Select units (Tab / Shift+Tab)' },
  { usage: 'ze / fit · f / focus', does: 'Zoom extents · focus the selection (Home · F)' },
  { usage: 'iso · top · back · left · right', does: 'Standard views and wall elevations' },
  { usage: 'realistic · edges · xray · ortho · persp', does: 'Visual style and projection' },
  { usage: 'plan · 3d · grid · walls · bom', does: 'Switch view or toggle overlays' },
  { usage: 'room 4500 3200 [2700] · layout straight|l|empty', does: 'Room size and layout preset' },
  { usage: 'save · rename My kitchen', does: 'Save or rename the project' },
];

const err = (message: string): CommandLineAction => ({ kind: 'error', message });
const NEEDS_SELECTION = 'Select a unit first: click it, press Tab, or type "next".';

const CABINET_ALIASES: Record<string, CabinetType> = { base: 'base', b: 'base', drawer: 'drawer', drawers: 'drawer', sink: 'sink', corner: 'corner', wall: 'wall', upper: 'wall', tall: 'tall', pantry: 'tall' };
const APPLIANCE_ALIASES: Record<string, ApplianceType> = { fridge: 'fridge', refrigerator: 'fridge', range: 'range', cooker: 'range', oven: 'range', dishwasher: 'dishwasher', dw: 'dishwasher', hood: 'hood', chimney: 'hood' };
const PRESETS: Record<string, CameraPreset> = { iso: 'iso', swiso: 'iso', neiso: 'iso', top: 'top', back: 'front', front: 'front', left: 'left', right: 'right' };
const SURFACE_WORDS: Record<string, Surface> = { worktop: 'countertop', countertop: 'countertop', counter: 'countertop', floor: 'floor', walls: 'wall', paint: 'wall', carcass: 'carcass' };

function findMaterial(project: KitchenProject, category: MaterialCategory, words: string[]): { id: string } | { error: string } {
  const query = words.join(' ').toLowerCase();
  const options = Object.values(project.materials).filter((m) => m.category === category);
  const match =
    options.find((m) => m.id === query || m.name.toLowerCase() === query) ??
    options.find((m) => words.every((w) => m.name.toLowerCase().includes(w) || m.id.includes(w)));
  return match ? { id: match.id } : { error: `No ${category} finish matches “${query}”. Options: ${options.map((m) => m.name).join(', ')}.` };
}

function numberArg(token: string | undefined, what: string): number | { error: string } {
  const n = token === undefined ? null : parseMm(token);
  return n === null ? { error: `${what} needs a whole number of millimetres, e.g. “${what.toLowerCase()} 900”.` } : n;
}

export function parseCommandLine(input: string, ctx: CommandContext): CommandLineAction {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const [head, ...rest] = tokens;
  if (!head) return { kind: 'help' };
  const el: KitchenElement | undefined = ctx.selectedId ? allElements(ctx.project).find((e) => e.id === ctx.selectedId) : undefined;
  const joined = tokens.join(' ');

  // Navigation and display.
  if (['ze', 'fit', 'home', 'zoom', 'zoom e', 'zoom extents', 'z e'].includes(joined)) return { kind: 'view', action: { kind: 'fit' } };
  if (['f', 'focus', 'zs', 'zoom object', 'zoom selected'].includes(joined)) return el ? { kind: 'view', action: { kind: 'focus' } } : err(NEEDS_SELECTION);
  if (rest.length === 0 && head in PRESETS) return { kind: 'view', action: { kind: 'preset', preset: PRESETS[head]! } };
  if (['xray', 'x-ray'].includes(joined)) return { kind: 'view', action: { kind: 'style', style: 'xray' } };
  if (['edges', 'shaded with edges', 'wireframe'].includes(joined)) return { kind: 'view', action: { kind: 'style', style: 'edges' } };
  if (['realistic', 'shaded'].includes(joined)) return { kind: 'view', action: { kind: 'style', style: 'realistic' } };
  if (['ortho', 'parallel', 'orthographic'].includes(joined)) return { kind: 'view', action: { kind: 'projection', projection: 'orthographic' } };
  if (['persp', 'perspective'].includes(joined)) return { kind: 'view', action: { kind: 'projection', projection: 'perspective' } };
  if (joined === 'plan' || joined === '3d') return { kind: 'view', action: { kind: 'mode', mode: joined } };
  if (joined === 'grid' || joined === 'walls' || joined === 'bom' || joined === 'inside') return { kind: 'view', action: { kind: 'toggle', what: joined } };

  // History, selection, project.
  if (['u', 'undo'].includes(joined)) return { kind: 'history', action: 'undo' };
  if (['redo', 'mredo'].includes(joined)) return { kind: 'history', action: 'redo' };
  if (joined === 'interact' || joined === 'hand') return { kind: 'interact' };
  if (joined === 'walk' || joined === 'orbit') return { kind: 'walk', on: joined === 'walk' };
  if (joined === 'stand') return el ? { kind: 'stand' } : err(NEEDS_SELECTION);
  if (head === 'eye') {
    const mm = rest[0] ? parseMm(rest[0]) : null;
    return mm !== null && mm >= 600 && mm <= 2200 ? { kind: 'eye', mm } : err('Usage: eye 1600 (600–2200 mm above the floor)');
  }
  if (joined === 'open all' || joined === 'close all') return { kind: 'open', open: head === 'open', all: true };
  if (joined === 'opendoors' || joined === 'closedoors') {
    if (!el) return err(NEEDS_SELECTION);
    return { kind: 'open', open: joined === 'opendoors', all: false };
  }
  if (joined === 'next') return { kind: 'cycle', direction: 1 };
  if (joined === 'prev' || joined === 'previous') return { kind: 'cycle', direction: -1 };
  if (['save', 'qsave'].includes(joined)) return { kind: 'save' };
  if (['help', '?', 'h?'].includes(joined)) return { kind: 'help' };
  if (head === 'rename' || head === 'name') {
    const name = input.trim().split(/\s+/).slice(1).join(' ');
    return name ? { kind: 'design', command: { type: 'rename_project', name } } : err('Usage: rename My kitchen');
  }
  if (head === 'sel' || head === 'select') {
    if (rest[0] === 'none') return { kind: 'select', id: null };
    if (rest[0] === 'next') return { kind: 'cycle', direction: 1 };
    if (rest[0] === 'prev') return { kind: 'cycle', direction: -1 };
    const type = rest[0] ? (CABINET_ALIASES[rest[0]] ?? APPLIANCE_ALIASES[rest[0]]) : undefined;
    if (!type) return err('Usage: sel sink · sel base 2 · sel none');
    const n = rest[1] ? Number(rest[1]) : 1;
    const matches = allElements(ctx.project).filter((e) => e.type === type).sort((a, b) => WALLS.indexOf(a.wallId ?? 'back') - WALLS.indexOf(b.wallId ?? 'back') || offsetAlongWall(a) - offsetAlongWall(b));
    const pick = matches[n - 1];
    return pick ? { kind: 'select', id: pick.id } : err(`There ${matches.length === 1 ? 'is 1' : `are ${matches.length}`} ${type} unit${matches.length === 1 ? '' : 's'}.`);
  }
  if (head === 'room') {
    const [w, l, h] = rest.map((t) => parseMm(t));
    if (w == null || l == null) return err('Usage: room 4500 3200 [2700]');
    return { kind: 'design', command: { type: 'set_room', room: { ...ctx.project.room, width: w, length: l, height: h ?? ctx.project.room.height } } };
  }
  if (head === 'layout') {
    const layout = rest[0] === 'l' || rest[0] === 'l-shaped' || rest[0] === 'lshaped' ? 'l-shaped' : rest[0] === 'clear' || rest[0] === 'empty' ? 'empty' : rest[0] === 'straight' ? 'straight' : null;
    return layout ? { kind: 'design', command: { type: 'apply_layout', layout } } : err('Usage: layout straight | l | empty');
  }

  // Finishes.
  if (head in SURFACE_WORDS && rest.length) {
    const surface = SURFACE_WORDS[head]!;
    const m = findMaterial(ctx.project, surface, rest);
    return 'error' in m ? err(m.error) : { kind: 'design', command: { type: 'set_surface_material', surface, materialId: m.id } };
  }
  if (['finish', 'shutter', 'shutters', 'mat', 'material'].includes(head)) {
    if (!el) return err(NEEDS_SELECTION);
    if (!rest.length) return err('Usage: finish oak');
    const m = findMaterial(ctx.project, 'shutter', rest);
    return 'error' in m ? err(m.error) : { kind: 'design', command: { type: 'set_material', targetIds: [el.id], materialId: m.id } };
  }

  // Free placement, rotation and interiors of the selected unit.
  if (['ro', 'rot', 'rotate'].includes(head)) {
    if (!el) return err(NEEDS_SELECTION);
    const by = rest[0] === undefined ? 90 : Number(rest[0]);
    if (![90, 180, 270, -90].includes(by)) return err('Usage: ro 90 (or 180, 270, -90)');
    return { kind: 'design', command: { type: 'rotate_entity', entityId: el.id, rotationY: ((((el.rotationY + by) % 360) + 360) % 360) as Rotation } };
  }
  if (joined === 'free' || joined === 'island') {
    if (!el) return err(NEEDS_SELECTION);
    return { kind: 'design', command: { type: 'place_entity', entityId: el.id, x: el.position.x, z: el.position.z, rotationY: el.rotationY } };
  }
  if (head === 'at') {
    if (!el) return err(NEEDS_SELECTION);
    const [fromLeft, fromBack] = rest.map((t) => parseMm(t));
    if (fromLeft == null || fromBack == null) return err('Usage: at 1200 900 (distance of the unit from the left wall and from the back wall)');
    const { sx, sz } = footprintSize(el.dimensions, el.rotationY);
    return { kind: 'design', command: { type: 'place_entity', entityId: el.id, x: fromLeft + sx / 2, z: fromBack + sz / 2, rotationY: el.rotationY } };
  }
  if (['glass', 'solid', 'open'].includes(joined)) {
    if (!el || !isCabinet(el)) return err(el ? 'Appliances have fixed fronts.' : NEEDS_SELECTION);
    return { kind: 'design', command: { type: 'set_front_style', cabinetId: el.id, style: joined as 'glass' | 'solid' | 'open' } };
  }
  if (head === 'shelves' || head === 'interior') {
    if (!el || !isCabinet(el)) return err(el ? 'Appliances have no interior.' : NEEDS_SELECTION);
    if (head === 'shelves') {
      const n = Number(rest[0]);
      if (!Number.isInteger(n) || n < 1 || n > 12) return err('Usage: shelves 4 (1–12)');
      return { kind: 'design', command: { type: 'apply_interior_preset', cabinetId: el.id, preset: 'shelves', count: n } };
    }
    const preset = INTERIOR_PRESETS.find((p) => p === rest[0]);
    return preset ? { kind: 'design', command: { type: 'apply_interior_preset', cabinetId: el.id, preset } } : err(`Usage: interior ${INTERIOR_PRESETS.join(' | ')}`);
  }

  // Adding.
  if (head === 'add' || head === 'insert' || head === 'i') {
    const kind = rest[0] ?? '';
    const width = rest[1] !== undefined ? parseMm(rest[1]) : undefined;
    if (width === null) return err('Width must be a whole number of millimetres.');
    if (kind in CABINET_ALIASES) {
      const type = CABINET_ALIASES[kind]!;
      const dims = { ...CABINET_SPECS[type].defaults, ...(width ? { width } : {}) };
      return { kind: 'design', command: { type: 'add_cabinet', cabinetType: type, dimensions: dims } };
    }
    if (kind in APPLIANCE_ALIASES) {
      const type = APPLIANCE_ALIASES[kind]!;
      return { kind: 'design', command: { type: 'add_appliance', applianceType: type, width: width ?? APPLIANCE_SPECS[type].defaults.width } };
    }
    return err(`Add what? ${[...Object.keys(CABINET_SPECS), ...Object.keys(APPLIANCE_SPECS)].join(', ')}.`);
  }

  // Edits of the selected unit.
  if (['e', 'erase', 'del', 'delete', 'remove'].includes(joined)) {
    return el ? { kind: 'design', command: { type: 'remove_entity', entityId: el.id } } : err(NEEDS_SELECTION);
  }
  const dimKey = ({ w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth' } as const)[head as 'w'];
  if (dimKey || head === 'size' || head === 's') {
    if (!el) return err(NEEDS_SELECTION);
    let dims = { ...el.dimensions };
    if (dimKey) {
      const n = numberArg(rest[0], dimKey[0]!.toUpperCase() + dimKey.slice(1));
      if (typeof n !== 'number') return err(n.error);
      dims = { ...dims, [dimKey]: n };
    } else {
      const values = rest.join(' ').split(/[\sx×*]+/).filter(Boolean).map((t) => parseMm(t));
      if (values.length !== 3 || values.some((v) => v === null)) return err('Usage: size 900x720x560 (width × height × depth)');
      dims = { width: values[0]!, height: values[1]!, depth: values[2]! };
    }
    if (isCabinet(el)) return { kind: 'design', command: { type: 'resize_cabinet', cabinetId: el.id, dimensions: dims } };
    if (dims.height !== el.dimensions.height || dims.depth !== el.dimensions.depth) return err(`Only the width of an appliance can change (${specFor('appliance', el.type).widths.join(', ')} mm).`);
    return { kind: 'design', command: { type: 'resize_appliance', applianceId: el.id, width: dims.width } };
  }
  if (['m', 'move', 'o', 'offset', 'wall', 'elev', 'elevation'].includes(head)) {
    if (!el) return err(NEEDS_SELECTION);
    const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
    let wallId: WallId = el.wallId ?? 'back';
    let offset = offsetAlongWall(el);
    let elevation = spec.mount === 'wall' ? el.position.y : undefined;
    const args = [...rest];
    if (head === 'elev' || head === 'elevation') {
      const n = numberArg(args[0], 'Elev');
      if (typeof n !== 'number') return err(n.error);
      elevation = n;
    } else {
      if (args[0] && (WALLS as readonly string[]).includes(args[0])) {
        wallId = args.shift() as WallId;
        offset = 0;
      } else if (head === 'wall') {
        return err(`Usage: wall left (walls: ${WALLS.join(', ')})`);
      }
      if (args[0]) {
        const relative = /^[+-]/.test(args[0]);
        const n = parseMm(args[0].replace(/^\+/, ''));
        if (n === null) return err('Usage: m 1200 (offset from the wall start) · m +50 / m -50 (nudge)');
        offset = relative ? offset + n : n;
      } else if (head !== 'wall' && wallId === el.wallId) {
        return err('Usage: m 1200 (offset from the wall start) · m +50 / m -50 (nudge) · m left 600');
      }
    }
    if (offset < 0) return err('That would move the unit past the start of the wall.');
    return { kind: 'design', command: { type: 'move_entity', entityId: el.id, placement: { wallId, offset, elevation } } };
  }

  return err(`Unknown command “${input.trim()}”. Type “help” for the list.`);
}
