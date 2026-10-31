/**
 * The layout planner: objective → resolved constraints → candidate generation on isolated copies
 * → validation → scoring → ranked alternatives (or a reasoned "not possible"). It never mutates
 * the live project; candidates carry the exact commands to commit and the project they produce.
 *
 * Limits: `maxEvaluations` checks and `timeBudgetMs` per run; it yields between generators so the
 * UI stays responsive, reports progress, and stops on `signal`.
 */
import { allElements, executeBatch, newId as randomId, type DesignCommand, type KitchenElement, type KitchenProject, type WallId } from '@/domain';
import { diffProjects, type ChangeSet } from '../diff';
import { findEntity } from '../entities';
import { resolveTarget } from '../resolve';
import type { DesignObjective, Priority } from '../schema';
import { lengthToMm } from '../compile';
import { evaluate, NOT_CHECKED, rulesFor, walkwayOf, type ConstraintRule, type ResolvedObjective, type Violation } from './constraints';
import { extendRuns, fixIssues, freshLayouts, relocate, removeRun, repositionIslands, storageInPlace, type Check, type GenContext, type Generated, type Recipe, type Strategy } from './generators';
import { layoutMetrics, minWalkway, STORAGE_ASSUMPTION, type LayoutMetrics } from './metrics';
import { TOPOLOGY_LABEL, topologyOf } from './runs';
import { SCORE_METHOD, scoreAll, type ScoreBreakdown } from './score';

export interface LayoutCandidate {
  /** Stable for the same geometry: a hash of what the layout contains. */
  id: string;
  name: string;
  summary: string;
  recipe: Recipe;
  commands: DesignCommand[];
  after: KitchenProject;
  changes: ChangeSet;
  scores: ScoreBreakdown;
  metrics: LayoutMetrics;
  hardViolations: Violation[];
  warnings: string[];
  assumptions: string[];
  /** Objects kept exactly as they were, by label. */
  preserved: string[];
  /** Offered because the requested layout was not possible. */
  fallback: boolean;
  topology: string;
}

export interface PlanResult {
  objective: DesignObjective;
  baseRevision: number;
  /** Ranked valid options. */
  candidates: LayoutCandidate[];
  /** Options generated but not offered, with the reasons. */
  rejected: { name: string; reasons: string[] }[];
  /** Why the requested layout is not possible (empty when it is). */
  infeasible: string[];
  /** Which constraints could be relaxed, never applied automatically. */
  relaxations: string[];
  rules: ConstraintRule[];
  assumptions: string[];
  notChecked: string[];
  scoreMethod: string[];
  current: { topology: string; metrics: LayoutMetrics };
  stats: { generated: number; evaluated: number; duplicates: number; ms: number; cancelled: boolean; truncated: boolean };
}

export type PlanOutcome = { kind: 'plan'; result: PlanResult } | { kind: 'question'; question: string; options: string[] };

export interface PlanOptions {
  revision: number;
  selectedId: string | null;
  focus: readonly string[];
  previousFocus: readonly string[];
  signal?: AbortSignal;
  onProgress?: (p: { step: string; done: number; total: number }) => void;
  newId?: (prefix: string) => string;
  maxEvaluations?: number;
  timeBudgetMs?: number;
  /** Signatures of candidates already shown ("another option"). */
  exclude?: readonly string[];
  /** Only this kind of candidate (refining a preferred option). */
  only?: Partial<Pick<Recipe, 'generator' | 'strategy' | 'topology'>> & { walls?: WallId[] };
}

export class PlanCancelled extends Error {
  constructor() {
    super('Layout planning was cancelled.');
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Geometry signature: equal for effectively identical layouts, whatever the ids. */
export function signature(p: KitchenProject): string {
  const el = (e: KitchenElement) => `${e.type}:${e.wallId ?? 'free'}:${e.position.x}:${e.position.y}:${e.position.z}:${e.rotationY}:${e.dimensions.width}x${e.dimensions.height}x${e.dimensions.depth}`;
  return [JSON.stringify(p.room), ...allElements(p).map(el).sort(), ...p.openings.map((o) => `${o.kind}:${o.wallId}:${o.offset}:${o.width}`).sort()].join('|');
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

/** Resolves references and checks the request is answerable for this project. */
export function resolveObjective(project: KitchenProject, objective: DesignObjective, opts: Pick<PlanOptions, 'selectedId' | 'focus' | 'previousFocus'>): { ok: true; resolved: ResolvedObjective } | { ok: false; question: string; options: string[] } {
  const rctx = { selectedId: opts.selectedId, focus: opts.focus, previousFocus: opts.previousFocus, created: new Map(), bindings: {} };
  const preserved = new Set<string>();
  for (const [i, t] of objective.preserve.entries()) {
    const r = resolveTarget(project, t, rctx, `preserve:${i}`, true);
    if (!r.ok) {
      if (r.kind === 'ambiguous') return { ok: false, question: `${r.question.replace(/\?$/, '')} to keep unchanged?`, options: r.candidates.map((c) => `Keep the ${c.label} unchanged`) };
      return { ok: false, question: `${r.message} What should I keep unchanged?`, options: [] };
    }
    r.entities.filter((e) => e.element || e.opening).forEach((e) => preserved.add(e.id));
  }
  if (objective.preserveAppliances) project.appliances.forEach((a) => preserved.add(a.id));
  let sinkWalls: WallId[] = [];
  if (objective.keepSinkWall) {
    sinkWalls = [...new Set(project.cabinets.filter((c) => c.type === 'sink' && c.wallId).map((c) => c.wallId!))];
    if (!sinkWalls.length) return { ok: false, question: 'There is no sink on a wall in this project, so I can’t tell which wall is the plumbing wall. Which wall should the sink go on?', options: ['The back wall', 'The left wall', 'The right wall'] };
  }
  if (objective.moveNear) {
    const r = resolveTarget(project, objective.moveNear.target, rctx, 'move', false);
    if (!r.ok) return { ok: false, question: r.kind === 'ambiguous' ? r.question : r.message, options: r.kind === 'ambiguous' ? r.candidates.map((c) => c.label) : [] };
    if (objective.moveNear.to === 'entrance' && !project.openings.some((o) => o.kind === 'door' || o.kind === 'opening')) {
      return { ok: false, question: 'There is no door or opening in this project to treat as the entrance. Add the door first, or tell me which wall the entrance is on.', options: [] };
    }
    if (preserved.has(r.entities[0]!.id)) return { ok: false, question: `You asked me both to move the ${r.entities[0]!.label} and to keep it in place. Which should I do?`, options: [`Move the ${r.entities[0]!.label}`, `Keep the ${r.entities[0]!.label} in place`] };
  }
  const w = walkwayOf(objective);
  return { ok: true, resolved: { objective, preserved: [...preserved], sinkWalls, walkwayMm: w.mm, walkwayFromDesigner: w.fromDesigner } };
}

export async function planLayouts(project: KitchenProject, objective: DesignObjective, opts: PlanOptions): Promise<PlanOutcome> {
  const started = Date.now();
  const resolution = resolveObjective(project, objective, opts);
  if (!resolution.ok) return { kind: 'question', question: resolution.question, options: resolution.options };
  const resolved = resolution.resolved;
  const maxEval = opts.maxEvaluations ?? 4000;
  const budget = opts.timeBudgetMs ?? 8000;
  let evaluated = 0;
  let truncated = false;
  const cancelled = () => opts.signal?.aborted ?? false;
  const stop = () => {
    if (cancelled()) throw new PlanCancelled();
  };

  // A designer-given room size is applied first (it is part of every candidate).
  const prelude: DesignCommand[] = [];
  let base = project;
  if (objective.roomSize) {
    const room = { ...project.room, width: lengthToMm(objective.roomSize.width, 'Room width'), length: lengthToMm(objective.roomSize.length, 'Room length') };
    const clear = allElements(project).filter((e) => !resolved.preserved.includes(e.id)).map((e): DesignCommand => ({ type: 'remove_entity', entityId: e.id }));
    const run = executeBatch(project, [...clear, { type: 'set_room', room }]);
    if (!run.success) return { kind: 'question', question: `The room cannot be set to ${room.width} × ${room.length} mm: ${run.results.at(-1)?.errors.join(' ')}`, options: [] };
    prelude.push(...clear, { type: 'set_room', room });
    base = run.project;
  }

  const ids = opts.newId ?? randomId;
  const check: Check = (commands) => {
    evaluated++;
    if (evaluated > maxEval || Date.now() - started > budget) {
      truncated = true;
      return { ok: false, project: null, hard: ['Search limit reached.'], ids: [] };
    }
    const run = executeBatch(project, [...prelude, ...commands]);
    if (!run.success) return { ok: false, project: null, hard: run.results.at(-1)?.errors ?? [], ids: [] };
    const changes = diffProjects(project, run.project, new Set());
    const { hard } = evaluate(project, run.project, changes, resolved);
    return { ok: hard.length === 0, project: run.project, hard: hard.map((h) => h.message), ids: [...new Set(hard.flatMap((h) => h.entityIds))] };
  };
  const reasons: string[] = [];
  // With a room-size prelude, generators work on the emptied, resized room and the prelude is replayed first.
  const ctx: GenContext = { project: base, resolved, check: (c) => check(c.filter((x) => !prelude.includes(x))), newId: ids, reasons };

  const current = topologyOf(project);
  const target = objective.topology === 'keep' ? null : objective.topology;
  const strategies: Strategy[] = orderStrategies(objective.priorities);
  type Step = { label: string; run: () => Generated[] };
  const steps: Step[] = [];
  const freshNeeded = objective.roomSize || current === 'empty';
  if (freshNeeded) {
    const tops = target && target !== 'galley' ? [target] : (['straight', 'l-shaped', 'u-shaped'] as const);
    steps.push({ label: 'Laying out new kitchens', run: () => freshLayouts(ctx, [...tops], prelude, base) });
  } else if (target && target !== current) {
    const rank = { straight: 1, 'l-shaped': 2, galley: 2, 'u-shaped': 3 } as Record<string, number>;
    if ((rank[target] ?? 0) > (rank[current] ?? 0) && (target === 'u-shaped' || target === 'l-shaped')) steps.push({ label: `Adding runs for a ${TOPOLOGY_LABEL[target]} kitchen`, run: () => extendRuns(ctx, target, strategies) });
    else if (target === 'l-shaped' || target === 'straight') steps.push({ label: `Removing a run for a ${TOPOLOGY_LABEL[target]} kitchen`, run: () => removeRun(ctx, target) });
    else reasons.push(`Changing a ${TOPOLOGY_LABEL[current] ?? current} kitchen into a ${TOPOLOGY_LABEL[target]} one is not supported yet; supported: single-wall → L or U, L → U, U → L, L → single-wall.`);
  }
  if (objective.fixIssues) steps.push({ label: 'Fixing collisions and clearances', run: () => fixIssues(ctx) });
  if (objective.moveNear) {
    const t = resolveTarget(project, objective.moveNear.target, { selectedId: opts.selectedId, focus: opts.focus, previousFocus: opts.previousFocus, created: new Map(), bindings: {} }, 'move', false);
    if (t.ok) {
      const dest = destination(project, objective.moveNear.to);
      if (dest) steps.push({ label: `Moving the ${t.entities[0]!.label} towards the ${dest.label}`, run: () => relocate(ctx, t.entities[0]!.id, dest.at, dest.label) });
    }
  }
  if (objective.repositionIsland) steps.push({ label: 'Repositioning the island', run: () => repositionIslands(ctx, minWalkway) });
  const wantsStorage = objective.priorities.includes('storage') || objective.priorities.includes('counter') || objective.scope !== 'all';
  const onlyStorage = !target && !objective.fixIssues && !objective.moveNear && !objective.repositionIsland && !freshNeeded;
  if (!freshNeeded && (onlyStorage || (wantsStorage && !target))) steps.push({ label: 'Looking for more storage', run: () => storageInPlace(ctx) });

  const generated: Generated[] = [];
  for (const [i, step] of steps.entries()) {
    stop();
    opts.onProgress?.({ step: step.label, done: i, total: steps.length + 1 });
    await tick();
    stop();
    generated.push(...step.run().filter((g) => matchesOnly(g.recipe, opts.only)));
  }

  // Fallbacks when the requested topology produced nothing valid: better versions of the current layout.
  let fallback = false;
  if (target && !freshNeeded && !generated.some((g) => g.recipe.topology === target)) {
    fallback = true;
    stop();
    opts.onProgress?.({ step: 'Looking for alternatives in the current layout', done: steps.length, total: steps.length + 1 });
    await tick();
    generated.push(...storageInPlace(ctx));
  }
  stop();
  opts.onProgress?.({ step: 'Comparing options', done: steps.length, total: steps.length + 1 });
  await tick();

  // Evaluate every candidate on an isolated copy.
  const exclude = new Set(opts.exclude ?? []);
  const seen = new Set<string>();
  let duplicates = 0;
  const valid: Omit<LayoutCandidate, 'scores'>[] = [];
  const rejected: PlanResult['rejected'] = [];
  for (const g of generated) {
    stop();
    const commands = [...prelude, ...g.commands.filter((c) => !prelude.includes(c))];
    const run = executeBatch(project, commands);
    if (!run.success) {
      rejected.push({ name: g.name, reasons: run.results.at(-1)?.errors ?? ['Rejected by the command engine.'] });
      continue;
    }
    const sig = signature(run.project);
    if (seen.has(sig) || exclude.has(sig) || sig === signature(project)) {
      duplicates++;
      continue;
    }
    seen.add(sig);
    const named = new Set(commands.flatMap((c) => ('entityId' in c ? [c.entityId] : 'id' in c && typeof c.id === 'string' ? [c.id] : [])));
    const changes = diffProjects(project, run.project, named);
    const { hard, soft } = evaluate(project, run.project, changes, resolved);
    if (hard.length) {
      rejected.push({ name: g.name, reasons: hard.map((h) => h.message) });
      continue;
    }
    const after = run.project;
    valid.push({
      id: `opt-${hash(sig)}`,
      name: g.name,
      summary: g.summary,
      recipe: g.recipe,
      commands,
      after,
      changes,
      metrics: layoutMetrics(project, after),
      hardViolations: [],
      warnings: soft.map((s) => s.message),
      assumptions: [...g.assumptions],
      preserved: resolved.preserved.map((id) => findEntity(project, id)?.label ?? id),
      fallback: fallback && g.recipe.topology !== target,
      topology: TOPOLOGY_LABEL[topologyOf(after)] ?? topologyOf(after),
    });
  }

  const baseline = layoutMetrics(project, project);
  const scores = scoreAll(valid.map((v) => ({ metrics: v.metrics, softCount: v.warnings.length })), baseline, objective.priorities, resolved.walkwayMm);
  const ranked = valid
    .map((v, i) => ({ ...v, scores: scores[i]! }))
    .sort((a, b) => Number(a.fallback) - Number(b.fallback) || b.scores.total - a.scores.total || a.id.localeCompare(b.id));
  // Keep variety: at most two options from the same recipe family.
  const picked: LayoutCandidate[] = [];
  for (const c of ranked) {
    if (picked.length >= objective.alternatives) break;
    const family = `${c.recipe.generator}:${c.recipe.walls.join('+')}`;
    if (picked.filter((x) => `${x.recipe.generator}:${x.recipe.walls.join('+')}` === family).length >= 2 && ranked.length > objective.alternatives) continue;
    picked.push(c);
  }
  for (const c of ranked) if (picked.length < objective.alternatives && !picked.includes(c)) picked.push(c);

  const infeasible: string[] = [];
  const relaxations: string[] = [];
  if (target && !ranked.some((c) => !c.fallback) && !freshNeeded) {
    infeasible.push(`A ${TOPOLOGY_LABEL[target]} layout does not fit this ${project.room.width} × ${project.room.length} mm room with the constraints you set.`, ...topReasons(reasons, rejected));
    if (!resolved.walkwayFromDesigner && objective.clearances === 'hard') relaxations.push(`Allow a narrower walkway than the ${resolved.walkwayMm} mm guidance (say e.g. “keep at least 800 mm walking clearance”).`);
    if (resolved.walkwayFromDesigner) relaxations.push(`Reduce the required walkway below ${resolved.walkwayMm} mm.`);
    if (resolved.preserved.length) relaxations.push('Let me move some of the units you asked me to keep in place.');
    if (objective.preserveWalls.length) relaxations.push(`Allow changes on the ${objective.preserveWalls.join(' and ')} wall.`);
    relaxations.push('Keep the current layout shape and add storage instead (shown below when possible).');
  } else if (!ranked.length) {
    infeasible.push('I could not find a change that meets every hard constraint.', ...topReasons(reasons, rejected));
    relaxations.push('Allow door/drawer clearances to be warnings rather than requirements (“treat clearances as preferences”).');
  }

  const assumptions = [STORAGE_ASSUMPTION, 'Costs use the placeholder price table in src/ai/layout/metrics.ts (indicative, not a quote).', 'New wall cabinets hang at the standard 1480 mm; new base units have the standard 720 mm carcass on a 100 mm plinth.'];
  return {
    kind: 'plan',
    result: {
      objective,
      baseRevision: opts.revision,
      candidates: picked,
      rejected: rejected.slice(0, 12),
      infeasible: [...new Set(infeasible)],
      relaxations,
      rules: rulesFor(resolved, project),
      assumptions,
      notChecked: NOT_CHECKED,
      scoreMethod: SCORE_METHOD,
      current: { topology: TOPOLOGY_LABEL[current] ?? current, metrics: baseline },
      stats: { generated: generated.length, evaluated, duplicates, ms: Date.now() - started, cancelled: false, truncated },
    },
  };
}

function orderStrategies(priorities: Priority[]): Strategy[] {
  const map: Partial<Record<Priority, Strategy>> = { storage: 'storage', counter: 'counter', budget: 'budget' };
  const first = priorities.map((p) => map[p]).filter((s): s is Strategy => !!s);
  return [...new Set([...first, 'storage', 'counter', 'budget'] as Strategy[])];
}

function matchesOnly(r: Recipe, only: PlanOptions['only']): boolean {
  if (!only) return true;
  if (only.generator && r.generator !== only.generator) return false;
  if (only.topology && r.topology !== only.topology) return false;
  if (only.walls && only.walls.join('+') !== r.walls.join('+')) return false;
  return true;
}

function destination(project: KitchenProject, to: 'entrance' | 'sink' | 'range' | 'fridge'): { at: { x: number; z: number }; label: string } | null {
  if (to === 'entrance') {
    const door = project.openings.find((o) => o.kind === 'door') ?? project.openings.find((o) => o.kind === 'opening');
    if (!door) return null;
    const along = door.offset + door.width / 2;
    const at = door.wallId === 'back' ? { x: along, z: 0 } : door.wallId === 'front' ? { x: along, z: project.room.length } : door.wallId === 'left' ? { x: 0, z: along } : { x: project.room.width, z: along };
    return { at, label: 'entrance' };
  }
  const el = allElements(project).find((e) => e.type === to);
  return el ? { at: { x: el.position.x, z: el.position.z }, label: to === 'fridge' ? 'refrigerator' : to } : null;
}

/** The generators' own explanations first (they name the measurement), then the commonest rejections. */
function topReasons(reasons: string[], rejected: PlanResult['rejected']): string[] {
  const explained = [...new Set(reasons.filter((r) => /wall|walkway|run/.test(r) && !/blocks|overlaps|hits/.test(r)))];
  const counts = new Map<string, number>();
  for (const r of [...reasons, ...rejected.flatMap((x) => x.reasons)].filter((r) => r !== 'Search limit reached.' && !explained.includes(r))) counts.set(r, (counts.get(r) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  return [...explained.slice(0, 4), ...common.slice(0, Math.max(1, 4 - explained.length))];
}
