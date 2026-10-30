/**
 * Executes design commands. Every command is parsed with Zod, checked against the supported
 * module sizes, applied to an Immer draft and then validated against the project invariants.
 * A rejected command returns the original project object unchanged, with readable errors.
 */
import { produce, type Draft } from 'immer';
import { allElements, elementLabel, newIssues } from '../constraints/validate';
import { findFreePlacement, makeAppliance, makeCabinet, newId } from '../furniture/factory';
import { interiorPreset, PRESET_LABEL } from '../furniture/interior';
import { dimensionErrors, specFor, type ElementSpec } from '../furniture/specs';
import { buildLayout, layoutFitErrors } from '../project/presets';
import { WALL_LABEL, offsetAlongWall, placeOnWall, spanAlongWall, wallAxis, wallLength } from '../room/walls';
import { isCabinet, zodMessages, type Dimensions, type KitchenCabinet, type KitchenElement, type KitchenProject } from '../schema';
import { DesignCommandSchema, type CommandResult, type DesignCommand, type Placement } from './schema';
import { DEFAULT_SHUTTER } from '../materials/library';

export interface ExecuteOptions {
  /** Id generator for created elements; injectable for deterministic tests. */
  newId?: (prefix: string) => string;
}

export interface Execution {
  project: KitchenProject;
  result: CommandResult;
}

class CommandRejected extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(' '));
  }
}

function reject(...errors: string[]): never {
  throw new CommandRejected(errors);
}

interface Outcome {
  summary: string;
  affected: string[];
}

type Ctx = Required<ExecuteOptions>;

export function executeCommand(project: KitchenProject, input: unknown, options: ExecuteOptions = {}): Execution {
  const parsed = DesignCommandSchema.safeParse(input);
  if (!parsed.success) return failed(project, zodMessages(parsed.error));
  const command = parsed.data;
  const ctx: Ctx = { newId: options.newId ?? newId };

  let outcome: Outcome = { summary: '', affected: [] };
  let next: KitchenProject;
  try {
    next = produce(project, (draft) => {
      outcome = apply(draft, command, ctx);
    });
  } catch (e) {
    if (e instanceof CommandRejected) return failed(project, e.errors);
    throw e;
  }

  const introduced = newIssues(project, next);
  if (introduced.length) return failed(project, introduced.map((i) => i.message));
  return { project: next, result: { success: true, errors: [], affectedEntityIds: outcome.affected, summary: outcome.summary } };
}

function failed(project: KitchenProject, errors: string[]): Execution {
  return { project, result: { success: false, errors, affectedEntityIds: [], summary: '' } };
}

function apply(p: Draft<KitchenProject>, cmd: DesignCommand, ctx: Ctx): Outcome {
  switch (cmd.type) {
    case 'rename_project':
      p.name = cmd.name;
      return { summary: `Renamed project to “${cmd.name}”`, affected: [] };

    case 'set_room': {
      const dW = cmd.room.width - p.room.width;
      const dL = cmd.room.length - p.room.length;
      // Units on the right and front walls stay against their wall when the room changes size.
      for (const el of elementsOf(p)) {
        if (el.wallId === 'right') el.position.x += dW;
        if (el.wallId === 'front') el.position.z += dL;
      }
      p.room = cmd.room;
      return { summary: `Set room to ${cmd.room.width} × ${cmd.room.length} × ${cmd.room.height} mm`, affected: [] };
    }

    case 'apply_layout': {
      const fit = layoutFitErrors(p.room, cmd.layout);
      if (fit.length) reject(...fit);
      const built = buildLayout(p.room, cmd.layout, ctx.newId);
      p.cabinets = built.cabinets;
      p.appliances = built.appliances;
      const label = cmd.layout === 'empty' ? 'Cleared the kitchen' : `Applied the ${cmd.layout} layout`;
      return { summary: label, affected: [...built.cabinets, ...built.appliances].map((e) => e.id) };
    }

    case 'add_cabinet': {
      const spec = specFor('cabinet', cmd.cabinetType);
      const dimensions = cmd.dimensions ?? { ...spec.defaults };
      const sizeErrors = dimensionErrors(spec, dimensions);
      if (sizeErrors.length) reject(...sizeErrors);
      const materialId = cmd.materialId ?? DEFAULT_SHUTTER;
      requireMaterial(p, materialId, 'shutter');
      const id = uniqueId(p, cmd.id ?? ctx.newId('cab'));
      const build = (wallId: Placement['wallId'], offset: number, elevation?: number) =>
        makeCabinet(p.room, { id, type: cmd.cabinetType, wallId, offset, dimensions, materialId, elevation: elevationFor(spec, elevation) });
      const at = cmd.placement ?? findFreePlacement(p, (w, o) => build(w, o)) ?? reject(`There is no free space on any wall for a ${dimensions.width} mm ${spec.label.toLowerCase()}.`);
      const cabinet = build(at.wallId, at.offset, cmd.placement?.elevation);
      p.cabinets.push(cabinet);
      return { summary: `Added ${elementLabel(cabinet)} mm on the ${WALL_LABEL[at.wallId].toLowerCase()}`, affected: [id] };
    }

    case 'add_appliance': {
      const spec = specFor('appliance', cmd.applianceType);
      const width = cmd.width ?? spec.defaults.width;
      const sizeErrors = dimensionErrors(spec, { ...spec.defaults, width });
      if (sizeErrors.length) reject(...sizeErrors);
      const id = uniqueId(p, cmd.id ?? ctx.newId('app'));
      const build = (wallId: Placement['wallId'], offset: number, elevation?: number) =>
        makeAppliance(p.room, { id, type: cmd.applianceType, wallId, offset, width, elevation: elevationFor(spec, elevation) });
      const at = cmd.placement ?? findFreePlacement(p, (w, o) => build(w, o)) ?? reject(`There is no free space on any wall for a ${width} mm ${spec.label.toLowerCase()}.`);
      const appliance = build(at.wallId, at.offset, cmd.placement?.elevation);
      p.appliances.push(appliance);
      return { summary: `Added ${elementLabel(appliance)} mm on the ${WALL_LABEL[at.wallId].toLowerCase()}`, affected: [id] };
    }

    case 'resize_cabinet': {
      const el = findElement(p, cmd.cabinetId);
      if (!isCabinet(el)) reject('Only cabinets can be resized in all three dimensions.');
      const spec = specFor('cabinet', el.type);
      const sizeErrors = dimensionErrors(spec, cmd.dimensions);
      if (sizeErrors.length) reject(...sizeErrors);
      return resize(p, el, cmd.dimensions);
    }

    case 'resize_appliance': {
      const el = findElement(p, cmd.applianceId);
      if (isCabinet(el)) reject('Use resize_cabinet for cabinets.');
      const spec = specFor('appliance', el.type);
      const dims = { ...el.dimensions, width: cmd.width };
      const sizeErrors = dimensionErrors(spec, dims);
      if (sizeErrors.length) reject(...sizeErrors);
      return resize(p, el, dims);
    }

    case 'move_entity': {
      const el = findElement(p, cmd.entityId);
      const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
      if (spec.mount === 'floor' && cmd.placement.elevation !== undefined && cmd.placement.elevation !== spec.elevation) {
        reject(`A ${spec.label.toLowerCase()} stands on the floor; its elevation is fixed at ${spec.elevation} mm.`);
      }
      const elevation = spec.mount === 'floor' ? spec.elevation : (cmd.placement.elevation ?? el.position.y);
      const placed = placeOnWall(p.room, cmd.placement.wallId, el.dimensions, cmd.placement.offset, elevation);
      el.position = placed.position;
      el.rotationY = placed.rotationY;
      el.wallId = cmd.placement.wallId;
      if (spanAlongWall(el).end > wallLength(p.room, cmd.placement.wallId)) {
        reject(`${elementLabel(el)} would run past the end of the ${WALL_LABEL[cmd.placement.wallId].toLowerCase()}.`);
      }
      return { summary: `Moved ${elementLabel(el)} to ${cmd.placement.offset} mm along the ${WALL_LABEL[cmd.placement.wallId].toLowerCase()}`, affected: [el.id] };
    }

    case 'place_entity': {
      const el = findElement(p, cmd.entityId);
      const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
      if (spec.mount === 'wall') reject(`A ${spec.label.toLowerCase()} hangs on a wall: move it along a wall or onto another wall.`);
      el.position = { x: cmd.x, y: spec.elevation, z: cmd.z };
      el.rotationY = cmd.rotationY;
      delete el.wallId;
      return { summary: `Placed ${elementLabel(el)} free-standing at ${cmd.x}, ${cmd.z} mm`, affected: [el.id] };
    }

    case 'rotate_entity': {
      const el = findElement(p, cmd.entityId);
      const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
      if (spec.mount === 'wall') reject(`A ${spec.label.toLowerCase()} hangs on a wall and faces the room; it cannot be rotated.`);
      // Rotating a wall unit lifts it off the wall: it keeps its centre and becomes free-standing.
      el.rotationY = cmd.rotationY;
      delete el.wallId;
      return { summary: `Rotated ${elementLabel(el)} to ${cmd.rotationY}°`, affected: [el.id] };
    }

    case 'set_interior': {
      const el = findCabinet(p, cmd.cabinetId);
      el.interior = cmd.interior;
      return { summary: `Updated the interior of ${elementLabel(el)}`, affected: [el.id] };
    }

    case 'set_front_style': {
      const el = findCabinet(p, cmd.cabinetId);
      el.frontStyle = cmd.style;
      return { summary: `Set ${elementLabel(el)} fronts to ${cmd.style}`, affected: [el.id] };
    }

    case 'apply_interior_preset': {
      const el = findCabinet(p, cmd.cabinetId);
      const preset = interiorPreset(el.type, el.dimensions, cmd.preset, cmd.count);
      el.interior = preset.interior;
      if (preset.frontStyle) el.frontStyle = preset.frontStyle;
      return { summary: `Applied the ${PRESET_LABEL[cmd.preset].toLowerCase()} interior to ${elementLabel(el)}`, affected: [el.id] };
    }

    case 'save_viewpoint': {
      const v = cmd.viewpoint;
      if (v.x < 0 || v.z < 0 || v.x > p.room.width || v.z > p.room.length) reject('A viewpoint must be inside the room.');
      const id = v.id ?? ctx.newId('view');
      const viewpoint = { ...v, id };
      const at = p.viewpoints.findIndex((x) => x.id === id);
      if (at >= 0) p.viewpoints[at] = viewpoint;
      else p.viewpoints.push(viewpoint);
      return { summary: `Saved the viewpoint “${v.name}”`, affected: [] };
    }

    case 'delete_viewpoint': {
      const v = p.viewpoints.find((x) => x.id === cmd.id) ?? reject('That viewpoint no longer exists.');
      p.viewpoints = p.viewpoints.filter((x) => x.id !== cmd.id);
      return { summary: `Deleted the viewpoint “${v.name}”`, affected: [] };
    }

    case 'set_material': {
      requireMaterial(p, cmd.materialId, 'shutter');
      for (const id of cmd.targetIds) {
        const el = findElement(p, id);
        if (!isCabinet(el)) reject(`${elementLabel(el)} is an appliance; appliance finishes are fixed.`);
        el.materialId = cmd.materialId;
      }
      const name = p.materials[cmd.materialId]!.name;
      return { summary: `Applied ${name} to ${cmd.targetIds.length} cabinet${cmd.targetIds.length === 1 ? '' : 's'}`, affected: cmd.targetIds };
    }

    case 'set_surface_material': {
      requireMaterial(p, cmd.materialId, cmd.surface);
      p.surfaces[cmd.surface] = cmd.materialId;
      return { summary: `Set the ${cmd.surface} finish to ${p.materials[cmd.materialId]!.name}`, affected: [] };
    }

    case 'remove_entity': {
      const el = findElement(p, cmd.entityId);
      p.cabinets = p.cabinets.filter((c) => c.id !== el.id);
      p.appliances = p.appliances.filter((a) => a.id !== el.id);
      return { summary: `Removed ${elementLabel(el)}`, affected: [el.id] };
    }
  }
}

/**
 * Resizes in place: the element keeps its id, its start along the wall, its back against the wall
 * and its elevation. Units further along the same wall shift by the change in width so the run
 * stays closed; if that pushes the run past the wall, validation rejects the edit.
 */
function resize(p: Draft<KitchenProject>, el: Draft<KitchenElement>, dims: Dimensions): Outcome {
  const dWidth = dims.width - el.dimensions.width;
  const affected = [el.id];
  if (el.wallId) {
    const { end: oldEnd } = spanAlongWall(el);
    const offset = offsetAlongWall(el);
    const placed = placeOnWall(p.room, el.wallId, dims, offset, el.position.y);
    if (dWidth !== 0) {
      const axis = wallAxis(el.wallId);
      for (const other of elementsOf(p)) {
        if (other.id === el.id || other.wallId !== el.wallId) continue;
        if (spanAlongWall(other).start >= oldEnd - 0.5) {
          other.position[axis] += dWidth;
          affected.push(other.id);
          const over = spanAlongWall(other).end - wallLength(p.room, el.wallId);
          if (over > 0) {
            const kind = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type).label.toLowerCase();
            reject(`Not enough space on the ${WALL_LABEL[el.wallId].toLowerCase()}: a ${dims.width} mm ${kind} pushes ${elementLabel(other)} ${over} mm past the end of the wall.`);
          }
        }
      }
    }
    el.position = placed.position;
  } else {
    // Free-standing: keep the back face and the left side (local −x) where they are.
    const lx = dWidth / 2;
    const lz = (dims.depth - el.dimensions.depth) / 2;
    const r = (el.rotationY * Math.PI) / 180;
    const cos = Math.round(Math.cos(r));
    const sin = Math.round(Math.sin(r));
    el.position.x += lx * cos + lz * sin;
    el.position.z += -lx * sin + lz * cos;
  }
  el.dimensions = { ...dims };
  if (isCabinet(el)) el.catalogItemId = `${el.type}-${dims.width}`;
  if (el.wallId && spanAlongWall(el).end > wallLength(p.room, el.wallId)) {
    reject(`${elementLabel(el)} would run past the end of the ${WALL_LABEL[el.wallId].toLowerCase()}.`);
  }
  const shifted = affected.length - 1;
  const ripple = shifted ? ` and shifted ${shifted} unit${shifted === 1 ? '' : 's'} by ${dWidth} mm` : '';
  return { summary: `Resized ${elementLabel(el)} to ${dims.width} × ${dims.height} × ${dims.depth} mm${ripple}`, affected };
}

function elementsOf(p: Draft<KitchenProject>): Draft<KitchenElement>[] {
  return [...p.cabinets, ...p.appliances];
}

function findCabinet(p: Draft<KitchenProject>, id: string): Draft<KitchenCabinet> {
  const el = findElement(p, id);
  if (!isCabinet(el)) reject(`${elementLabel(el)} is an appliance and has no configurable interior.`);
  return el;
}

function findElement(p: Draft<KitchenProject>, id: string): Draft<KitchenElement> {
  return elementsOf(p).find((e) => e.id === id) ?? reject(`No element with id “${id}” exists in this project.`);
}

function uniqueId(p: KitchenProject, id: string): string {
  if (allElements(p).some((e) => e.id === id)) reject(`An element with id “${id}” already exists.`);
  return id;
}

function requireMaterial(p: KitchenProject, id: string, category: string): void {
  const m = p.materials[id];
  if (!m) reject(`Unknown finish “${id}”.`);
  else if (m.category !== category) reject(`${m.name} is a ${m.category} finish and cannot be used for the ${category}.`);
}

function elevationFor(spec: ElementSpec, requested: number | undefined): number {
  if (spec.mount === 'floor') {
    if (requested !== undefined && requested !== spec.elevation) {
      reject(`A ${spec.label.toLowerCase()} stands on the floor; its elevation is fixed at ${spec.elevation} mm.`);
    }
    return spec.elevation;
  }
  return requested ?? spec.elevation;
}
