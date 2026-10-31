/**
 * Unit references (C1… cabinets, A1… appliances) and the cabinet schedule. References follow the
 * room in reading order — back, left, right, front wall, then free-standing — so they are stable
 * for a given layout and match the plan, the elevations and the cut list.
 */
import {
  allElements,
  CABINET_SPECS,
  isFurniture,
  specOf,
  fittingName,
  isCabinet,
  offsetAlongWall,
  WALL_LABEL,
  WALLS,
  type KitchenElement,
  type KitchenProject,
} from '@/domain';
import { elementBox } from '../geometry/box';
import { buildModel } from '../geometry/parts';

export function orderUnits(project: KitchenProject): KitchenElement[] {
  const rank = (el: KitchenElement) => (el.wallId ? WALLS.indexOf(el.wallId) : WALLS.length);
  const along = (el: KitchenElement) => (el.wallId ? offsetAlongWall(el) : elementBox(el).minX * 10_000 + elementBox(el).minZ);
  return [...allElements(project)].sort((a, b) => rank(a) - rank(b) || along(a) - along(b) || a.position.y - b.position.y);
}

export function unitRefs(project: KitchenProject): Map<string, string> {
  const refs = new Map<string, string>();
  let c = 0;
  let a = 0;
  let f = 0;
  for (const el of orderUnits(project)) refs.set(el.id, isCabinet(el) ? `C${++c}` : isFurniture(el) ? `F${++f}` : `A${++a}`);
  return refs;
}

export interface ScheduleRow {
  ref: string;
  id: string;
  label: string;
  width: number;
  height: number;
  depth: number;
  location: string;
  fronts: string;
  interior: string;
  finish: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function cabinetSchedule(project: KitchenProject): ScheduleRow[] {
  const refs = unitRefs(project);
  return orderUnits(project).map((el) => {
    const { width, height, depth } = el.dimensions;
    const b = elementBox(el);
    const location = el.wallId ? `${WALL_LABEL[el.wallId]} @ ${offsetAlongWall(el)}` : `Free-standing @ ${Math.round(b.minX)}, ${Math.round(b.minZ)}`;
    if (!isCabinet(el)) {
      const finish = isFurniture(el) ? (project.materials[el.materialId]?.name ?? el.materialId) : 'Appliance';
      return { ref: refs.get(el.id)!, id: el.id, label: specOf(el).label, width, height, depth, location, fronts: '—', interior: '—', finish };
    }
    const movers = buildModel(el).movers;
    const doors = movers.filter((m) => m.kind === 'hinge').length;
    const drawers = movers.filter((m) => m.kind === 'slide' && m.requires.length === 0).length;
    const fronts =
      el.frontStyle === 'open' && el.type !== 'drawer'
        ? 'Open'
        : [doors ? `${plural(doors, 'door')}${el.frontStyle === 'glass' ? ' (glass)' : ''}` : '', drawers ? plural(drawers, 'drawer') : ''].filter(Boolean).join(', ');
    const counts = new Map<string, number>();
    for (const s of el.interior.sections) for (const f of s.fittings) counts.set(fittingName(f), (counts.get(fittingName(f)) ?? 0) + 1);
    const sections = el.interior.sections.length > 1 ? `${el.interior.sections.length} sections: ` : '';
    const interior = counts.size ? sections + [...counts].map(([n, k]) => `${k} × ${n.toLowerCase()}`).join(', ') : el.type === 'drawer' ? '—' : `${sections}empty`;
    return {
      ref: refs.get(el.id)!,
      id: el.id,
      label: CABINET_SPECS[el.type].label,
      width,
      height,
      depth,
      location,
      fronts,
      interior,
      finish: project.materials[el.materialId]?.name ?? el.materialId,
    };
  });
}
