/**
 * What a plan changes, computed by comparing the project before and after (never from the model's
 * description): new, deleted and modified objects with previous and proposed sizes and positions,
 * flagging changes to objects the request did not name (e.g. units shifted along by a resize).
 */
import { allElements, offsetAlongWall, type KitchenElement, type KitchenProject, type Opening, type Room, type Surface, type WallId } from '@/domain';
import type { LengthUnit } from '@/engine/measurement/units';
import { elementEntity, openingEntity, type EntityCategory } from './entities';

export interface Snapshot {
  width: number;
  height: number;
  depth?: number;
  /** The wall it stands against (absent: free-standing). */
  wallId?: WallId;
  /** Distance from the wall's start to its nearest edge, for items on a wall. */
  offset?: number;
  /** Footprint centre, for free-standing items. */
  x?: number;
  z?: number;
  /** Bottom above the floor (sill for openings). */
  elevation: number;
  rotationY?: number;
  finish?: string;
  frontStyle?: string;
}

export interface EntityChange {
  id: string;
  label: string;
  category: EntityCategory;
  /** True when the request did not name this object: it changes as a consequence of another edit. */
  dependency: boolean;
  before?: Snapshot;
  after?: Snapshot;
  /** Which fields differ: size, position, rotation, finish, fronts, interior, swing. */
  fields: string[];
}

export interface ChangeSet {
  room?: { before: Room; after: Room };
  unit?: { before: LengthUnit; after: LengthUnit };
  name?: { before: string; after: string };
  surfaces: { surface: Surface; before: string; after: string }[];
  /** Finishes in use whose colour, texture or sheen changed (everything using them changes look). */
  finishes: { name: string; before: string; after: string }[];
  added: EntityChange[];
  removed: EntityChange[];
  modified: EntityChange[];
}

function elementSnapshot(el: KitchenElement, project: KitchenProject): Snapshot {
  const finish = 'materialId' in el ? project.materials[el.materialId]?.name : undefined;
  return {
    width: el.dimensions.width,
    height: el.dimensions.height,
    depth: el.dimensions.depth,
    wallId: el.wallId,
    offset: el.wallId ? offsetAlongWall(el) : undefined,
    x: el.wallId ? undefined : el.position.x,
    z: el.wallId ? undefined : el.position.z,
    elevation: el.position.y,
    rotationY: el.rotationY,
    finish,
    frontStyle: 'frontStyle' in el ? el.frontStyle : undefined,
  };
}

function openingSnapshot(o: Opening): Snapshot {
  return { width: o.width, height: o.height, wallId: o.wallId, offset: o.offset, elevation: o.sill };
}

function changedFields(a: Snapshot, b: Snapshot, extra: { interior?: boolean; swing?: boolean }): string[] {
  const f: string[] = [];
  if (a.width !== b.width || a.height !== b.height || a.depth !== b.depth) f.push('size');
  if (a.wallId !== b.wallId || a.offset !== b.offset || a.x !== b.x || a.z !== b.z || a.elevation !== b.elevation) f.push('position');
  if (a.rotationY !== b.rotationY) f.push('rotation');
  if (a.finish !== b.finish) f.push('finish');
  if (a.frontStyle !== b.frontStyle) f.push('fronts');
  if (extra.interior) f.push('interior');
  if (extra.swing) f.push('swing');
  return f;
}

export function diffProjects(before: KitchenProject, after: KitchenProject, named: ReadonlySet<string>): ChangeSet {
  const out: ChangeSet = { surfaces: [], finishes: [], added: [], removed: [], modified: [] };
  if (JSON.stringify(before.room) !== JSON.stringify(after.room)) out.room = { before: before.room, after: after.room };
  if (before.preferences.unit !== after.preferences.unit) out.unit = { before: before.preferences.unit, after: after.preferences.unit };
  if (before.name !== after.name) out.name = { before: before.name, after: after.name };
  // Finishes edited in place: only those something in the design uses.
  const used = new Set<string>([...Object.values(after.surfaces), ...allElements(after).flatMap((e) => ('materialId' in e ? [e.materialId] : []))]);
  const look = (m: KitchenProject['materials'][string]) => `${m.color}${m.texture && m.texture !== 'plain' ? ` ${m.texture}` : ''}${m.roughness < 0.35 ? ' glossy' : m.roughness > 0.75 ? ' matt' : ''}`;
  for (const id of used) {
    const b = before.materials[id];
    const a2 = after.materials[id];
    if (b && a2 && JSON.stringify(b) !== JSON.stringify(a2)) out.finishes.push({ name: a2.name, before: look(b), after: look(a2) });
  }
  for (const s of Object.keys(after.surfaces) as Surface[]) {
    if (before.surfaces[s] !== after.surfaces[s]) out.surfaces.push({ surface: s, before: before.materials[before.surfaces[s]]?.name ?? before.surfaces[s], after: after.materials[after.surfaces[s]]?.name ?? after.surfaces[s] });
  }

  const beforeEls = new Map(allElements(before).map((e) => [e.id, e]));
  const afterEls = new Map(allElements(after).map((e) => [e.id, e]));
  for (const [id, el] of afterEls) {
    const prev = beforeEls.get(id);
    const ent = elementEntity(el);
    if (!prev) {
      out.added.push({ id, label: ent.label, category: ent.category, dependency: false, after: elementSnapshot(el, after), fields: [] });
      continue;
    }
    if (prev === el) continue;
    const a = elementSnapshot(prev, before);
    const b = elementSnapshot(el, after);
    const interior = 'interior' in prev && 'interior' in el && JSON.stringify(prev.interior) !== JSON.stringify(el.interior);
    const fields = changedFields(a, b, { interior });
    if (fields.length) out.modified.push({ id, label: elementEntity(prev).label, category: ent.category, dependency: !named.has(id), before: a, after: b, fields });
  }
  for (const [id, el] of beforeEls) {
    if (afterEls.has(id)) continue;
    const ent = elementEntity(el);
    out.removed.push({ id, label: ent.label, category: ent.category, dependency: !named.has(id), before: elementSnapshot(el, before), fields: [] });
  }

  const beforeOps = new Map(before.openings.map((o) => [o.id, o]));
  const afterOps = new Map(after.openings.map((o) => [o.id, o]));
  for (const [id, o] of afterOps) {
    const prev = beforeOps.get(id);
    if (!prev) {
      out.added.push({ id, label: openingEntity(o).label, category: 'opening', dependency: false, after: openingSnapshot(o), fields: [] });
      continue;
    }
    if (prev === o) continue;
    const fields = changedFields(openingSnapshot(prev), openingSnapshot(o), { swing: prev.swing !== o.swing || prev.hinge !== o.hinge });
    if (fields.length) out.modified.push({ id, label: openingEntity(prev).label, category: 'opening', dependency: !named.has(id), before: openingSnapshot(prev), after: openingSnapshot(o), fields });
  }
  for (const [id, o] of beforeOps) {
    if (!afterOps.has(id)) out.removed.push({ id, label: openingEntity(o).label, category: 'opening', dependency: !named.has(id), before: openingSnapshot(o), fields: [] });
  }
  return out;
}

export function isEmptyChange(c: ChangeSet): boolean {
  return !c.room && !c.unit && !c.name && !c.surfaces.length && !c.finishes.length && !c.added.length && !c.removed.length && !c.modified.length;
}

/** Every object id the change set touches. */
export function touchedIds(c: ChangeSet): string[] {
  return [...c.added, ...c.removed, ...c.modified].map((e) => e.id);
}
