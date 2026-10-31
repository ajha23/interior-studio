/**
 * Cabinet and furniture schedule from typed domain data (never from labels). Each property says
 * whether it is known, unspecified (needs the designer) or not applicable, and each row says what is
 * still missing before it can be manufactured.
 */
import { allElements, CABINET_SPECS, fittingName, isCabinet, isFurniture, offsetAlongWall, spanAlongWall, specOf, WALL_LABEL, WALLS, type KitchenProject, type WallId } from '@/domain';
import { elementBox } from '../geometry/box';
import { buildModel } from '../geometry/parts';
import { orderUnits, unitRefs } from '../production/schedule';
import { constructionOf } from './construction';

export type FieldStatus = 'known' | 'unspecified' | 'n/a';
export interface Field {
  value: string;
  status: FieldStatus;
}

const known = (value: string | number): Field => ({ value: String(value), status: 'known' });
const unspecified = (what: string): Field => ({ value: `not specified (${what})`, status: 'unspecified' });
const na: Field = { value: '—', status: 'n/a' };

export interface ScheduleRow {
  id: string;
  ref: string;
  category: 'cabinet' | 'appliance' | 'furniture';
  type: string;
  typeLabel: string;
  room: string;
  wall: WallId | null;
  run: string;
  width: number;
  height: number;
  depth: number;
  /** Distance from the wall's start (wall units) or from the left wall (free-standing), mm. */
  offset: number;
  /** Bottom above the floor, mm. */
  elevation: number;
  finish: Field;
  carcass: Field;
  fronts: Field;
  doors: number;
  drawers: number;
  shelves: number;
  interior: Field;
  hinge: Field;
  runner: Field;
  handle: Field;
  construction: Field;
  notes: string[];
  status: 'complete' | 'incomplete' | 'bought-in';
  missing: string[];
  revision: string;
}

/** Runs: floor units touching side by side on one wall form a run; wall-hung units form upper runs. */
export function runNames(project: KitchenProject): Map<string, string> {
  const names = new Map<string, string>();
  for (const w of WALLS) {
    for (const level of ['floor', 'upper'] as const) {
      const els = allElements(project)
        .filter((e) => e.wallId === w && (specOf(e).mount === 'wall') === (level === 'upper'))
        .sort((a, b) => spanAlongWall(a).start - spanAlongWall(b).start);
      let n = 0;
      let end = -Infinity;
      for (const e of els) {
        const s = spanAlongWall(e);
        if (s.start - end > 5) n++;
        end = s.end;
        names.set(e.id, `${WALL_LABEL[w]} ${level === 'upper' ? 'upper ' : ''}run ${n}`);
      }
    }
  }
  for (const e of allElements(project)) if (!e.wallId) names.set(e.id, 'Free-standing');
  return names;
}

export function scheduleRows(project: KitchenProject, revision: string): ScheduleRow[] {
  const refs = unitRefs(project);
  const runs = runNames(project);
  const production = project.production;
  const rules = constructionOf(production.constructionId);
  const carcassName = project.materials[project.surfaces.carcass]?.name;
  return orderUnits(project).map((el) => {
    const base = {
      id: el.id,
      ref: refs.get(el.id) ?? '',
      room: 'Kitchen',
      wall: el.wallId ?? null,
      run: runs.get(el.id) ?? '',
      width: el.dimensions.width,
      height: el.dimensions.height,
      depth: el.dimensions.depth,
      offset: el.wallId ? offsetAlongWall(el) : Math.round(elementBox(el).minX),
      elevation: el.position.y,
      revision,
    };
    if (!isCabinet(el)) {
      return {
        ...base,
        category: isFurniture(el) ? 'furniture' : 'appliance',
        type: el.type,
        typeLabel: specOf(el).label,
        finish: isFurniture(el) ? known(project.materials[el.materialId]?.name ?? el.materialId) : unspecified('appliance model'),
        carcass: na,
        fronts: na,
        doors: 0,
        drawers: 0,
        shelves: 0,
        interior: na,
        hinge: na,
        runner: na,
        handle: na,
        construction: na,
        notes: [isFurniture(el) ? 'Loose furniture: bought in, not in the cut list.' : 'Appliance: bought in; confirm the model and its installation clearances.'],
        status: 'bought-in',
        missing: isFurniture(el) ? [] : ['appliance model'],
      } satisfies ScheduleRow;
    }
    const movers = buildModel(el).movers;
    const doors = movers.filter((m) => m.kind === 'hinge').length;
    const drawers = movers.filter((m) => m.kind === 'slide' && m.requires.length === 0).length;
    const handles = buildModel(el).parts.filter((p) => p.finish === 'handle' && p.group === 'front').length;
    const shelves = el.interior.sections.reduce((n, s) => n + s.fittings.filter((f) => f.kind === 'shelf').length, 0);
    const counts = new Map<string, number>();
    for (const s of el.interior.sections) for (const f of s.fittings) counts.set(fittingName(f), (counts.get(fittingName(f)) ?? 0) + 1);
    const interior = counts.size ? [...counts].map(([n, k]) => `${k} × ${n.toLowerCase()}`).join(', ') : el.type === 'drawer' ? 'drawers only' : 'empty';
    const missing: string[] = [];
    const finishName = project.materials[el.materialId]?.name;
    const finish = finishName ? known(finishName) : unspecified('front finish');
    if (!finishName) missing.push('front finish');
    const carcass = carcassName ? known(carcassName) : unspecified('carcass material');
    if (!carcassName) missing.push('carcass material');
    const hinge = doors ? (production.hinge ? known(production.hinge) : unspecified('hinge')) : na;
    if (doors && !production.hinge) missing.push('hinge product');
    const runner = drawers ? (production.drawerRunner ? known(production.drawerRunner) : unspecified('runner')) : na;
    if (drawers && !production.drawerRunner) missing.push('drawer runner product');
    const handle = handles ? (production.handle ? known(production.handle) : unspecified('handle')) : na;
    if (handles && !production.handle) missing.push('handle product');
    let construction: Field;
    const notes: string[] = [];
    if (!rules) {
      construction = unspecified('construction method');
      missing.push('construction method');
    } else if (!rules.verified.includes(el.type)) {
      construction = { value: `${rules.name}: no cut-list rules for this type`, status: 'unspecified' };
      missing.push('cut-list rules for this cabinet type');
      notes.push(rules.unsupported[el.type] ?? 'This cabinet type is not covered by the chosen construction rules.');
    } else construction = known(rules.name);
    const fronts = el.frontStyle === 'open' && el.type !== 'drawer' ? 'open (no doors)' : [doors ? `${doors} door${doors === 1 ? '' : 's'}${el.frontStyle === 'glass' ? ' (glass)' : ''}` : '', drawers ? `${drawers} drawer${drawers === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ') || 'none';
    return {
      ...base,
      category: 'cabinet',
      type: el.type,
      typeLabel: CABINET_SPECS[el.type].label,
      finish,
      carcass,
      fronts: known(fronts),
      doors,
      drawers,
      shelves,
      interior: known(interior),
      hinge,
      runner,
      handle,
      construction,
      notes,
      status: missing.length ? 'incomplete' : 'complete',
      missing,
    } satisfies ScheduleRow;
  });
}

export interface ScheduleQuery {
  category?: ScheduleRow['category'] | 'all';
  type?: string | 'all';
  wall?: WallId | 'free' | 'all';
  text?: string;
  incompleteOnly?: boolean;
  sort?: { key: 'ref' | 'type' | 'wall' | 'width' | 'height' | 'depth' | 'status'; dir: 'asc' | 'desc' };
  groupBy?: 'none' | 'wall' | 'type' | 'run';
}

export function querySchedule(rows: ScheduleRow[], q: ScheduleQuery): { group: string; rows: ScheduleRow[] }[] {
  let r = rows.filter(
    (x) =>
      (!q.category || q.category === 'all' || x.category === q.category) &&
      (!q.type || q.type === 'all' || x.type === q.type) &&
      (!q.wall || q.wall === 'all' || (q.wall === 'free' ? x.wall === null : x.wall === q.wall)) &&
      (!q.incompleteOnly || x.status === 'incomplete') &&
      (!q.text || `${x.ref} ${x.typeLabel} ${x.id} ${x.run} ${x.finish.value}`.toLowerCase().includes(q.text.toLowerCase())),
  );
  if (q.sort) {
    const { key, dir } = q.sort;
    const refNum = (s: string) => s.replace(/\d+/, (n) => n.padStart(4, '0'));
    const v = (x: ScheduleRow) => (key === 'ref' ? refNum(x.ref) : key === 'type' ? x.typeLabel : key === 'wall' ? `${x.wall ?? 'z'}${String(x.offset).padStart(6, '0')}` : key === 'status' ? x.status : x[key]);
    r = [...r].sort((a, b) => {
      const va = v(a);
      const vb = v(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return dir === 'asc' ? c : -c;
    });
  }
  if (!q.groupBy || q.groupBy === 'none') return [{ group: 'All', rows: r }];
  const groups = new Map<string, ScheduleRow[]>();
  for (const x of r) {
    const g = q.groupBy === 'wall' ? (x.wall ? WALL_LABEL[x.wall] : 'Free-standing') : q.groupBy === 'type' ? x.typeLabel : x.run;
    groups.set(g, [...(groups.get(g) ?? []), x]);
  }
  return [...groups].map(([group, rows]) => ({ group, rows }));
}

export interface ScheduleColumn {
  id: string;
  label: string;
  /** Value for tables and CSV (lengths in whole millimetres). */
  value: (r: ScheduleRow) => string | number;
  width: number;
  align?: 'right';
  defaultVisible: boolean;
}

export const SCHEDULE_COLUMNS: ScheduleColumn[] = [
  { id: 'ref', label: 'Ref', value: (r) => r.ref, width: 4, defaultVisible: true },
  { id: 'id', label: 'Object ID', value: (r) => r.id, width: 9, defaultVisible: false },
  { id: 'type', label: 'Type', value: (r) => r.typeLabel, width: 10, defaultVisible: true },
  { id: 'run', label: 'Wall / run', value: (r) => r.run, width: 11, defaultVisible: true },
  { id: 'width', label: 'W (mm)', value: (r) => r.width, width: 5, align: 'right', defaultVisible: true },
  { id: 'height', label: 'H (mm)', value: (r) => r.height, width: 5, align: 'right', defaultVisible: true },
  { id: 'depth', label: 'D (mm)', value: (r) => r.depth, width: 5, align: 'right', defaultVisible: true },
  { id: 'offset', label: 'Offset (mm)', value: (r) => r.offset, width: 6, align: 'right', defaultVisible: true },
  { id: 'elevation', label: 'Elev. (mm)', value: (r) => r.elevation, width: 5, align: 'right', defaultVisible: false },
  { id: 'finish', label: 'Finish', value: (r) => r.finish.value, width: 9, defaultVisible: true },
  { id: 'carcass', label: 'Carcass', value: (r) => r.carcass.value, width: 8, defaultVisible: false },
  { id: 'fronts', label: 'Doors / drawers', value: (r) => r.fronts.value, width: 9, defaultVisible: true },
  { id: 'interior', label: 'Shelves / interior', value: (r) => r.interior.value, width: 10, defaultVisible: true },
  { id: 'hardware', label: 'Hardware', value: (r) => [r.hinge, r.runner, r.handle].filter((f) => f.status !== 'n/a').map((f) => f.value).join('; ') || '—', width: 10, defaultVisible: false },
  { id: 'construction', label: 'Construction', value: (r) => r.construction.value, width: 10, defaultVisible: false },
  { id: 'status', label: 'Manufacturing', value: (r) => (r.status === 'complete' ? 'complete' : r.status === 'bought-in' ? 'bought in' : `missing: ${r.missing.join(', ')}`), width: 12, defaultVisible: true },
  { id: 'revision', label: 'Revision', value: (r) => r.revision, width: 7, defaultVisible: false },
];
