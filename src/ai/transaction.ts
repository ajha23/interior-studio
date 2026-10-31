/**
 * Turns a plan into a previewable, all-or-nothing proposal. Each operation is compiled against the
 * project left by the previous one and run through the domain command engine on an isolated copy
 * (projects are immutable, so the open project is never touched). The result carries the exact
 * commands to commit, the change set, new design-check warnings, and — when it fails — the reason
 * and verified alternatives. Nothing here commits: the editor store does that atomically.
 */
import { executeBatch, newId as randomId, type DesignCommand, type KitchenProject, type WallId } from '@/domain';
import { designChecks } from '@/engine/checks/designChecks';
import { compileOperation, lengthToMm } from './compile';
import { diffProjects, isEmptyChange, type ChangeSet } from './diff';
import { describeEntity, findEntity } from './entities';
import { resolveTarget } from './resolve';
import { LIMITS, type AssistantOperation, type Plan } from './schema';

export interface RunContext {
  selectedId: string | null;
  focus: readonly string[];
  previousFocus: readonly string[];
  /** Walls and objects the designer asked to keep unchanged. */
  protect: { walls: readonly WallId[]; ids: readonly string[] };
  bindings?: Readonly<Record<string, readonly string[]>>;
  revision: number;
  newId?: (prefix: string) => string;
  /** Ids to reuse, in order, for objects the plan creates (keeps ids stable when a preview is re-run). */
  reuseIds?: readonly string[];
  /** Formats millimetres for messages and alternative labels. */
  fmt?: (mm: number) => string;
}

export interface Alternative {
  label: string;
  operations: AssistantOperation[];
}

export interface Clarification {
  key: string;
  question: string;
  candidates: { id: string; label: string }[];
}

export interface Proposal {
  status: 'valid' | 'invalid' | 'needs_clarification';
  explanation: string;
  operations: AssistantOperation[];
  /** Exactly what will be committed, with explicit ids, in whole millimetres. */
  commands: DesignCommand[];
  /** What each operation did, in the domain's own words. */
  steps: { operation: number; summaries: string[]; note?: string }[];
  baseRevision: number;
  before: KitchenProject;
  after: KitchenProject | null;
  changes: ChangeSet | null;
  /** Design-check warnings this plan would introduce (the plan is still allowed). */
  warnings: string[];
  errors: string[];
  failedOperation: number;
  alternatives: Alternative[];
  clarification: Clarification | null;
  /** Ids the operations created, and the existing ids they named. */
  created: string[];
  named: string[];
  bindings: Record<string, readonly string[]>;
}

const mm = (v: number) => `${v} mm`;

export function runPlan(project: KitchenProject, plan: Pick<Plan, 'explanation' | 'operations'>, ctx: RunContext, opts: { alternatives?: boolean } = {}): Proposal {
  const fmt = ctx.fmt ?? mm;
  const bindings = { ...(ctx.bindings ?? {}) };
  const base: Proposal = {
    status: 'invalid',
    explanation: plan.explanation,
    operations: plan.operations,
    commands: [],
    steps: [],
    baseRevision: ctx.revision,
    before: project,
    after: null,
    changes: null,
    warnings: [],
    errors: [],
    failedOperation: -1,
    alternatives: [],
    clarification: null,
    created: [],
    named: [],
    bindings,
  };
  if (plan.operations.length > LIMITS.operations) return { ...base, errors: [`A plan can have at most ${LIMITS.operations} steps.`] };

  const created = new Map<number, string[]>();
  const reuse = [...(ctx.reuseIds ?? [])];
  const fresh = ctx.newId ?? randomId;
  const newId = (prefix: string) => {
    const i = reuse.findIndex((id) => id.startsWith(`${prefix}_`));
    return i >= 0 ? reuse.splice(i, 1)[0]! : fresh(prefix);
  };
  const named = new Set<string>();
  let current = project;
  const commands: DesignCommand[] = [];
  const steps: Proposal['steps'] = [];

  for (const [i, op] of plan.operations.entries()) {
    const compiled = compileOperation(current, op, i, { selectedId: ctx.selectedId, focus: ctx.focus, previousFocus: ctx.previousFocus, created, bindings, newId });
    if (!compiled.ok && compiled.kind === 'ambiguous') {
      return {
        ...base,
        status: 'needs_clarification',
        failedOperation: i,
        clarification: { key: compiled.key, question: compiled.question, candidates: compiled.candidates.map((e) => ({ id: e.id, label: describeEntity(e, fmt) })) },
      };
    }
    if (!compiled.ok) return withAlternatives({ ...base, failedOperation: i, errors: [compiled.message], commands, steps }, current, project, plan, ctx, i, opts);
    if (commands.length + compiled.commands.length > 200) return { ...base, errors: ['That plan would make too many changes at once; split it up.'] };
    const run = executeBatch(current, compiled.commands);
    if (!run.success) {
      const errors = run.results.at(-1)?.errors ?? ['That change is not allowed.'];
      return withAlternatives({ ...base, failedOperation: i, errors, commands, steps }, current, project, plan, ctx, i, opts);
    }
    created.set(i, compiled.created);
    compiled.targets.forEach((id) => named.add(id));
    compiled.created.forEach((id) => named.add(id));
    commands.push(...compiled.commands);
    steps.push({ operation: i, summaries: run.results.map((r) => r.summary), note: compiled.note });
    current = run.project;
  }

  const changes = diffProjects(project, current, named);
  const createdIds = [...created.values()].flat();
  const done: Proposal = { ...base, commands, steps, after: current, changes, created: createdIds, named: [...named].filter((id) => !createdIds.includes(id)) };
  if (isEmptyChange(changes)) return { ...done, status: 'invalid', after: null, errors: ['That would not change anything: the project already looks like that.'] };

  const violations = protectViolations(project, current, changes, ctx.protect);
  if (violations.length) return { ...done, status: 'invalid', after: null, errors: violations };

  const existing = new Set(designChecks(project).map((c) => c.id));
  const warnings = designChecks(current).filter((c) => c.severity === 'warning' && !existing.has(c.id)).map((c) => c.message);
  return { ...done, status: 'valid', warnings };
}

function protectViolations(before: KitchenProject, after: KitchenProject, changes: ChangeSet, protect: RunContext['protect']): string[] {
  const out: string[] = [];
  for (const wall of protect.walls) {
    const lengthKey = wall === 'back' || wall === 'front' ? 'width' : 'length';
    if (before.room[lengthKey] !== after.room[lengthKey] || before.room.height !== after.room.height) out.push(`This would change the size of the ${wall} wall, which you asked me to keep unchanged.`);
    for (const c of [...changes.added, ...changes.removed, ...changes.modified]) {
      if (c.before?.wallId === wall || c.after?.wallId === wall) out.push(`This would change the ${c.label} on the ${wall} wall, which you asked me to keep unchanged.`);
    }
  }
  for (const id of protect.ids) {
    const c = [...changes.removed, ...changes.modified].find((x) => x.id === id);
    if (c) out.push(`This would change the ${c.label}, which you asked me to keep unchanged.`);
  }
  return [...new Set(out)];
}

/** Adds up to three alternatives that are verified to work, for a failed operation. */
function withAlternatives(failed: Proposal, atFailure: KitchenProject, project: KitchenProject, plan: Pick<Plan, 'explanation' | 'operations'>, ctx: RunContext, index: number, opts: { alternatives?: boolean }): Proposal {
  if (opts.alternatives === false) return failed;
  const fmt = ctx.fmt ?? mm;
  const op = plan.operations[index]!;
  const replace = (next: AssistantOperation): AssistantOperation[] => plan.operations.map((o, i) => (i === index ? next : o));
  const works = (ops: AssistantOperation[]) => runPlan(project, { explanation: plan.explanation, operations: ops }, { ...ctx, newId: ctx.newId ?? randomId }, { alternatives: false }).status === 'valid';
  const found: Alternative[] = [];
  const offer = (label: string, next: AssistantOperation) => {
    const ops = replace(next);
    if (found.length < 3 && !found.some((a) => a.label === label) && works(ops)) found.push({ label, operations: ops });
  };

  try {
    if ((op.op === 'create_cabinet' || op.op === 'create_appliance' || op.op === 'create_furniture') && op.placement) {
      if ('wall' in op.placement && op.placement.offset !== undefined) {
        const wall = op.placement.wall;
        const start = lengthToMm(op.placement.offset, 'Offset', { allowZero: true });
        // Nearest spots on the same wall, one each way, in 50 mm steps.
        for (const dir of [-1, 1]) {
          for (let k = 1; k <= 120; k++) {
            const offset = start + dir * k * 50;
            if (offset < 0) break;
            const next = { ...op, placement: { ...op.placement, offset } } as AssistantOperation;
            if (works(replace(next))) {
              offer(`Place it at ${fmt(offset)} along the ${wall} wall instead`, next);
              break;
            }
          }
        }
      }
      const { placement: _p, ...rest } = op;
      offer('Put it in the first free spot instead', rest as AssistantOperation);
    }
    if (op.op === 'move_by') {
      const d = lengthToMm(op.distance, 'Distance');
      const step = Math.max(10, Math.round(d / 100 / 10) * 10);
      for (let v = d - step; v >= step; v -= step) {
        const next = { ...op, distance: v };
        if (works(replace(next))) {
          offer(`Move it ${fmt(v)} instead (as far as it goes)`, next);
          break;
        }
      }
    }
    if (op.op === 'resize') {
      const target = resolveTarget(atFailure, op.target, { selectedId: ctx.selectedId, focus: ctx.focus, previousFocus: ctx.previousFocus, created: new Map(), bindings: failed.bindings }, `${index}:target`, true);
      const el = target.ok && target.entities.length === 1 ? target.entities[0]!.element : undefined;
      for (const dim of ['width', 'height', 'depth'] as const) {
        const wanted = op[dim];
        if (!el || wanted === undefined) continue;
        const want = lengthToMm(wanted, dim);
        const have = el.dimensions[dim];
        const dir = want > have ? -1 : 1;
        for (let v = want + dir * 10; dir < 0 ? v > have : v < have; v += dir * 10) {
          const next = { ...op, [dim]: v } as AssistantOperation;
          if (works(replace(next))) {
            offer(`Make it ${fmt(v)} ${dim === 'width' ? 'wide' : dim === 'height' ? 'high' : 'deep'} instead (the ${dir < 0 ? 'largest' : 'smallest'} that fits)`, next);
            break;
          }
        }
      }
    }
  } catch {
    // An alternative that cannot even be compiled is simply not offered.
  }
  return { ...failed, alternatives: found };
}

/** Labels for the ids a proposal created or named, for conversation focus. */
export function focusAfter(p: Proposal): string[] {
  if (p.created.length) return p.created;
  if (p.named.length) return p.named;
  return [];
}

/** Turns a candidate chosen in a clarification into a binding and re-runs the plan. */
export function bind(p: Proposal, key: string, ids: string[], project: KitchenProject, ctx: RunContext): Proposal {
  return runPlan(project, { explanation: p.explanation, operations: p.operations }, { ...ctx, bindings: { ...p.bindings, [key]: ids } });
}

export function entityLabel(project: KitchenProject, id: string): string {
  const e = findEntity(project, id);
  return e ? e.label : id;
}
