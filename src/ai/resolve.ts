/**
 * Resolves references ("it", "the selected object", "the cabinet next to the fridge", "all base
 * cabinets") to entity ids in the actual project. Never guesses: a single-object reference that
 * matches several entities comes back as `ambiguous` with the candidates, so the assistant can ask.
 */
import type { KitchenProject } from '@/domain';
import { roomToLocal } from '@/engine/geometry/transform';
import { entitiesOf, findEntity, RIGHT_ALONG, type Entity, type EntityCategory } from './entities';
import { LIMITS, type TargetRef } from './schema';

export interface ResolveContext {
  selectedId: string | null;
  focus: readonly string[];
  previousFocus: readonly string[];
  /** Ids created by earlier operations of the same plan, by operation index. */
  created: ReadonlyMap<number, readonly string[]>;
  /** Answers to earlier clarification questions: reference key → chosen ids. */
  bindings: Readonly<Record<string, readonly string[]>>;
}

export type Resolution =
  | { ok: true; entities: Entity[] }
  | { ok: false; kind: 'ambiguous'; key: string; question: string; candidates: Entity[] }
  | { ok: false; kind: 'not_found'; message: string };

const TYPE_ALIASES: Record<string, { category: EntityCategory; type?: string; freeStanding?: boolean }> = {
  island: { category: 'cabinet', freeStanding: true },
  cabinet: { category: 'cabinet' },
  cabinets: { category: 'cabinet' },
  unit: { category: 'cabinet' },
  cupboard: { category: 'cabinet' },
  base: { category: 'cabinet', type: 'base' },
  'base cabinet': { category: 'cabinet', type: 'base' },
  wall: { category: 'cabinet', type: 'wall' },
  'wall cabinet': { category: 'cabinet', type: 'wall' },
  upper: { category: 'cabinet', type: 'wall' },
  tall: { category: 'cabinet', type: 'tall' },
  pantry: { category: 'cabinet', type: 'tall' },
  drawer: { category: 'cabinet', type: 'drawer' },
  drawers: { category: 'cabinet', type: 'drawer' },
  sink: { category: 'cabinet', type: 'sink' },
  corner: { category: 'cabinet', type: 'corner' },
  appliance: { category: 'appliance' },
  fridge: { category: 'appliance', type: 'fridge' },
  refrigerator: { category: 'appliance', type: 'fridge' },
  range: { category: 'appliance', type: 'range' },
  cooker: { category: 'appliance', type: 'range' },
  oven: { category: 'appliance', type: 'range' },
  hob: { category: 'appliance', type: 'range' },
  stove: { category: 'appliance', type: 'range' },
  dishwasher: { category: 'appliance', type: 'dishwasher' },
  hood: { category: 'appliance', type: 'hood' },
  extractor: { category: 'appliance', type: 'hood' },
  furniture: { category: 'furniture' },
  table: { category: 'furniture', type: 'table' },
  chair: { category: 'furniture', type: 'chair' },
  sofa: { category: 'furniture', type: 'sofa' },
  couch: { category: 'furniture', type: 'sofa' },
  opening: { category: 'opening' },
  door: { category: 'opening', type: 'door' },
  window: { category: 'opening', type: 'window' },
  archway: { category: 'opening', type: 'opening' },
};

/** Normalises a type word ("refrigerator", "Base cabinet") to a category and type. */
export function typeAlias(word: string): { category: EntityCategory; type?: string; freeStanding?: boolean } | null {
  const w = word.trim().toLowerCase().replace(/s$/, '');
  return TYPE_ALIASES[word.trim().toLowerCase()] ?? TYPE_ALIASES[w] ?? null;
}

const SINGLE_NOUN: Record<EntityCategory, string> = { cabinet: 'cabinet', appliance: 'appliance', furniture: 'piece of furniture', opening: 'opening', wall: 'wall' };

/** Order along walls as seen facing each wall from the room: left to right, wall by wall. */
function viewerOrder(e: Entity): number {
  if (!e.wallId || !e.span) return 0;
  const centre = (e.span.start + e.span.end) / 2;
  return RIGHT_ALONG[e.wallId] * centre;
}

const WALL_RANK = { back: 0, left: 1, right: 2, front: 3 } as const;

function runOrder(a: Entity, b: Entity): number {
  return WALL_RANK[a.wallId ?? 'back'] - WALL_RANK[b.wallId ?? 'back'] || viewerOrder(a) - viewerOrder(b) || a.bottom - b.bottom;
}

/** Entities touching `x` side by side: same wall with spans meeting, or free-standing boxes touching. */
function neighbours(x: Entity, pool: Entity[]): Entity[] {
  const GAP = 5;
  return pool.filter((e) => {
    if (e.id === x.id || e.category === 'wall') return false;
    const vertical = Math.min(e.top, x.top) - Math.max(e.bottom, x.bottom) > 0;
    if (!vertical) return false;
    if (x.wallId && e.wallId === x.wallId && x.span && e.span) {
      return Math.abs(e.span.start - x.span.end) <= GAP || Math.abs(x.span.start - e.span.end) <= GAP;
    }
    if (x.box && e.box) {
      const gapX = Math.max(x.box.minX - e.box.maxX, e.box.minX - x.box.maxX);
      const gapZ = Math.max(x.box.minZ - e.box.maxZ, e.box.minZ - x.box.maxZ);
      return Math.max(gapX, gapZ) <= GAP && Math.min(gapX, gapZ) < 0;
    }
    return false;
  });
}

/** Which side of `x` an entity is on, as seen standing in front of `x` facing it. */
function sideOf(x: Entity, e: Entity): 'left' | 'right' {
  if (x.element && e.box) {
    const c = { x: (e.box.minX + e.box.maxX) / 2, y: 0, z: (e.box.minZ + e.box.maxZ) / 2 };
    return roomToLocal(x.element, c).x < 0 ? 'left' : 'right';
  }
  const before = (e.span?.start ?? 0) < (x.span?.start ?? 0);
  const dir = RIGHT_ALONG[x.wallId ?? 'back'];
  return before === (dir === 1) ? 'left' : 'right';
}

export function resolveTarget(project: KitchenProject, ref: TargetRef, ctx: ResolveContext, key: string, multiple: boolean): Resolution {
  const bound = ctx.bindings[key];
  if (bound) return fromIds(project, bound, 'the object you chose');

  if ('id' in ref) {
    const e = findEntity(project, ref.id);
    return e ? { ok: true, entities: [e] } : { ok: false, kind: 'not_found', message: `There is no object with id “${ref.id}” in this project.` };
  }
  if ('created' in ref) {
    const ids = ctx.created.get(ref.created);
    if (!ids?.length) return { ok: false, kind: 'not_found', message: `Step ${ref.created + 1} does not create anything to refer to.` };
    return fromIds(project, ids, 'the new object');
  }
  if ('ref' in ref) {
    const ids = ref.ref === 'selected' ? (ctx.selectedId ? [ctx.selectedId] : []) : ref.ref === 'it' ? ctx.focus : ctx.previousFocus;
    const what = ref.ref === 'selected' ? 'selected object' : ref.ref === 'it' ? 'object we were discussing' : 'previous object';
    const live = ids.map((id) => findEntity(project, id)).filter((e): e is Entity => e !== null);
    if (!live.length) {
      return {
        ok: false,
        kind: 'not_found',
        message: ref.ref === 'selected' ? 'Nothing is selected. Select an object, or tell me which one you mean.' : `I'm not sure which ${what} you mean: it no longer exists or we haven't talked about one yet. Select it or name it.`,
      };
    }
    if (!multiple && live.length > 1) return ambiguous(key, live, `Which one do you mean?`);
    return { ok: true, entities: live };
  }

  const q = ref.query;
  const alias = q.type ? typeAlias(q.type) : null;
  if (q.type && !alias) return { ok: false, kind: 'not_found', message: `I don't know what a “${q.type}” is in this project.` };
  const category = q.kind && q.kind !== 'any' ? q.kind : alias?.category;
  let pool = entitiesOf(project).filter((e) => (category ? e.category === category : e.category !== 'wall'));
  if (alias?.type) pool = pool.filter((e) => e.type === alias.type);
  if (q.wall) pool = pool.filter((e) => e.wallId === q.wall);
  if (q.freeStanding || alias?.freeStanding) pool = pool.filter((e) => e.element !== undefined && !e.wallId);
  if (q.hasOpening) pool = pool.filter((e) => e.category === 'wall' && project.openings.some((o) => o.wallId === e.wallId && o.kind === q.hasOpening));
  if (q.width) pool = pool.filter((e) => e.width === q.width);

  if (q.nextTo) {
    const anchor = resolveTarget(project, q.nextTo, ctx, `${key}.nextTo`, false);
    if (!anchor.ok) return anchor;
    const x = anchor.entities[0]!;
    let near = neighbours(x, pool);
    // "The cabinet next to the fridge" means the one at the same level when there is one.
    const sameLevel = near.filter((e) => (e.bottom < 300) === (x.bottom < 300));
    if (sameLevel.length) near = sameLevel;
    if (q.side) near = near.filter((e) => sideOf(x, e) === q.side);
    pool = near;
    if (!pool.length) return { ok: false, kind: 'not_found', message: `Nothing${alias ? ` of that kind` : ''} stands ${q.side ? `to the ${q.side} of` : 'next to'} the ${x.label}.` };
  }

  const noun = alias?.freeStanding ? 'island' : alias?.type ? (pool[0]?.label.replace(/ \d+.*$/, '').toLowerCase() ?? q.type!) : SINGLE_NOUN[category ?? 'cabinet'];
  if (!pool.length) {
    const where = q.wall ? ` on the ${q.wall} wall` : '';
    return { ok: false, kind: 'not_found', message: `There is no ${q.type ?? noun}${where} in this project.` };
  }

  pool = [...pool].sort(runOrder);
  if (q.extreme === 'highest' || q.extreme === 'lowest') {
    const v = q.extreme === 'highest' ? Math.max(...pool.map((e) => e.top)) : Math.min(...pool.map((e) => e.bottom));
    pool = pool.filter((e) => (q.extreme === 'highest' ? e.top : e.bottom) === v);
  } else if (q.extreme) {
    const walls = new Set(pool.map((e) => e.wallId ?? 'free'));
    if (walls.size > 1) {
      // "The left cabinet" across several walls: offer the extreme one on each wall.
      const perWall = [...walls].map((w) => {
        const onWall = pool.filter((e) => (e.wallId ?? 'free') === w);
        return q.extreme === 'leftmost' ? onWall[0]! : onWall[onWall.length - 1]!;
      });
      if (perWall.length > 1 && !q.all) return ambiguous(key, perWall, `There are ${q.type ?? noun}s on several walls. Which one do you mean?`);
      pool = perWall;
    } else {
      pool = [q.extreme === 'leftmost' ? pool[0]! : pool[pool.length - 1]!];
    }
  }
  if (q.nth) {
    const pick = pool[q.nth - 1];
    if (!pick) return { ok: false, kind: 'not_found', message: `There ${pool.length === 1 ? 'is only 1' : `are only ${pool.length}`} matching item${pool.length === 1 ? '' : 's'}.` };
    pool = [pick];
  }

  if (q.all) {
    if (pool.length > LIMITS.targets) return { ok: false, kind: 'not_found', message: `That matches ${pool.length} objects; I can change at most ${LIMITS.targets} at once.` };
    return { ok: true, entities: pool };
  }
  if (pool.length > 1 && !multiple) return ambiguous(key, pool, `There are ${pool.length} matches. Which ${noun} do you mean?`);
  if (pool.length > 1) return ambiguous(key, pool, `There are ${pool.length} matches. Which ${noun} do you mean, or should I change all of them?`);
  return { ok: true, entities: pool };
}

function fromIds(project: KitchenProject, ids: readonly string[], what: string): Resolution {
  const found = ids.map((id) => findEntity(project, id)).filter((e): e is Entity => e !== null);
  return found.length === ids.length ? { ok: true, entities: found } : { ok: false, kind: 'not_found', message: `${what.charAt(0).toUpperCase()}${what.slice(1)} no longer exists in the project.` };
}

function ambiguous(key: string, candidates: Entity[], question: string): Resolution {
  return { ok: false, kind: 'ambiguous', key, question, candidates: candidates.slice(0, 8) };
}
