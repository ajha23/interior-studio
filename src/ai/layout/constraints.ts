/**
 * The constraint engine for layout planning, independent of any model. Every rule says whether it
 * is hard (an option breaking it is never offered as valid) or soft (it only ranks options), and
 * where it comes from. Nothing here claims building-code compliance: the clearance figures are
 * configurable design guidance, and requirements without data are reported as not checked.
 */
import { allElements, offsetAlongWall, validateProject, WALL_LABEL, type KitchenElement, type KitchenProject, type WallId } from '@/domain';
import { designChecks, WALKWAY_MIN } from '@/engine/checks/designChecks';
import { lengthToMm } from '../compile';
import type { ChangeSet } from '../diff';
import { entityLabel } from '../transaction';
import type { DesignObjective } from '../schema';
import { frontClearances } from './metrics';

export type RuleSource = 'geometry' | 'catalogue' | 'designer' | 'design guidance';

export interface ConstraintRule {
  id: string;
  label: string;
  kind: 'hard' | 'soft';
  source: RuleSource;
  /** Where the figure comes from and how sure it is. */
  note: string;
}

export interface Violation {
  rule: string;
  message: string;
  entityIds: string[];
}

/** Requirements the project has no data for; shown as "not checked", never as passed. */
export const NOT_CHECKED = [
  'Appliance installation clearances (ventilation gaps, hinge side, service access): need manufacturer data for the chosen models.',
  'Local building, electrical, gas and fire regulations: not assessed for any jurisdiction.',
  'Plumbing and drainage routes: only “keep the sink on its wall” is checked.',
];

export interface ResolvedObjective {
  objective: DesignObjective;
  /** Ids that must not change. */
  preserved: string[];
  /** Walls whose sinks must stay there. */
  sinkWalls: WallId[];
  walkwayMm: number;
  walkwayFromDesigner: boolean;
}

export function rulesFor(r: ResolvedObjective, project: KitchenProject): ConstraintRule[] {
  const o = r.objective;
  const rules: ConstraintRule[] = [
    { id: 'room', label: 'Every unit inside the room and below the ceiling', kind: 'hard', source: 'geometry', note: 'Room size from the project.' },
    { id: 'overlap', label: 'No two units share space', kind: 'hard', source: 'geometry', note: 'Exact boxes from the canonical model.' },
    { id: 'sizes', label: 'Supported unit sizes', kind: 'hard', source: 'catalogue', note: 'Ranges from the unit catalogue (furniture/specs.ts).' },
    { id: 'openings', label: 'Doors, windows and door swings kept clear', kind: 'hard', source: 'geometry', note: '700 mm in front of each opening; the full swing of inward doors.' },
    {
      id: 'clearance',
      label: 'Cabinet doors and drawers open without hitting anything',
      kind: o.clearances,
      source: 'design guidance',
      note: 'Swept from the same hinge/slide geometry as the 3D model; 35 mm tolerance.',
    },
    {
      id: 'walkway',
      label: `At least ${r.walkwayMm} mm of clear floor in front of every run`,
      kind: r.walkwayFromDesigner ? 'hard' : o.clearances,
      source: r.walkwayFromDesigner ? 'designer' : 'design guidance',
      note: r.walkwayFromDesigner ? 'Set in your request.' : `Typical kitchen guidance (${WALKWAY_MIN} mm, configurable in engine/checks/designChecks.ts); not a building code.`,
    },
    { id: 'room-size', label: o.roomSize ? 'Room set to the size you gave' : 'Room size unchanged', kind: 'hard', source: 'designer', note: o.roomSize ? 'From your request.' : 'The planner never changes walls unless asked.' },
  ];
  if (r.preserved.length) rules.push({ id: 'preserve', label: `Keep unchanged: ${r.preserved.map((id) => entityLabel(project, id)).join(', ')}`, kind: 'hard', source: 'designer', note: 'Position, size and finish must not change.' });
  if (r.sinkWalls.length) rules.push({ id: 'sink-wall', label: `Sink stays on the ${r.sinkWalls.join(' and ')} wall`, kind: 'hard', source: 'designer', note: 'Treated as the plumbing wall.' });
  if (o.preserveWalls.length) rules.push({ id: 'walls', label: `No changes on the ${o.preserveWalls.join(' and ')} wall`, kind: 'hard', source: 'designer', note: 'Units and openings on that wall stay as they are.' });
  if (o.scope !== 'all') rules.push({ id: 'scope', label: o.scope === 'upper-only' ? 'Only wall-hung (upper) units change' : 'Only floor (base) units change', kind: 'hard', source: 'designer', note: 'From your request.' });
  rules.push(
    { id: 'heights', label: 'Wall cabinets 450 mm+ above the worktop; hood 650–750 mm above the hob', kind: 'soft', source: 'design guidance', note: 'Typical manufacturer guidance; ranks options.' },
    { id: 'landing', label: 'Worktop beside the hob', kind: 'soft', source: 'design guidance', note: 'Ranks options.' },
    { id: 'triangle', label: 'Work triangle legs 1.2–2.7 m, 4.0–7.9 m in total', kind: 'soft', source: 'design guidance', note: 'A heuristic for discussion; ranks options.' },
  );
  return rules;
}

const same = (a: KitchenElement | undefined, b: KitchenElement | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** Hard and soft results for a candidate project. */
export function evaluate(before: KitchenProject, after: KitchenProject, changes: ChangeSet | null, r: ResolvedObjective): { hard: Violation[]; soft: Violation[] } {
  const hard: Violation[] = [];
  const soft: Violation[] = [];
  const o = r.objective;

  for (const issue of validateProject(after)) {
    const rule = issue.code === 'overlap' ? 'overlap' : issue.code === 'out_of_room' ? 'room' : issue.code === 'blocks_opening' || issue.code === 'invalid_opening' ? 'openings' : 'sizes';
    hard.push({ rule, message: issue.message, entityIds: issue.entityIds });
  }

  const checks = designChecks(after);
  for (const c of checks) {
    if (c.severity !== 'warning') continue;
    if (c.code === 'clearance') (o.clearances === 'hard' ? hard : soft).push({ rule: 'clearance', message: c.message, entityIds: c.entityIds });
    else if (c.code === 'walkway') continue; // measured below against the required width
    else soft.push({ rule: c.code === 'landing' ? 'landing' : 'heights', message: c.message, entityIds: c.entityIds });
  }
  const tight = frontClearances(after).filter((g) => g.gap < r.walkwayMm && g.against !== 'wall' && !sameRunCorner(after, g));
  const walkwayHard = r.walkwayFromDesigner || o.clearances === 'hard';
  for (const g of dedupePairs(tight)) {
    const msg = `Only ${g.gap} mm of floor in front of the ${entityLabel(after, g.id)} (needs ${r.walkwayMm} mm).`;
    (walkwayHard ? hard : soft).push({ rule: 'walkway', message: msg, entityIds: [g.id, g.against] });
  }
  // Walls facing a run closer than the walkway (e.g. a deep run opposite a narrow wall gap) are also walkways.
  for (const g of frontClearances(after).filter((x) => x.against === 'wall' && x.gap < r.walkwayMm)) {
    (walkwayHard ? hard : soft).push({ rule: 'walkway', message: `Only ${g.gap} mm between the ${entityLabel(after, g.id)} and the opposite wall (needs ${r.walkwayMm} mm).`, entityIds: [g.id] });
  }

  if (!o.roomSize && JSON.stringify(before.room) !== JSON.stringify(after.room)) hard.push({ rule: 'room-size', message: 'The room size would change.', entityIds: [] });

  const beforeEls = new Map(allElements(before).map((e) => [e.id, e]));
  const afterEls = new Map(allElements(after).map((e) => [e.id, e]));
  for (const id of r.preserved) {
    if (!same(beforeEls.get(id), afterEls.get(id))) hard.push({ rule: 'preserve', message: `The ${entityLabel(before, id)} would ${afterEls.has(id) ? 'change' : 'be removed'}, but it must stay as it is.`, entityIds: [id] });
  }
  for (const wall of r.sinkWalls) {
    const sinksBefore = before.cabinets.filter((c) => c.type === 'sink' && c.wallId === wall).map((c) => c.id);
    for (const id of sinksBefore) {
      const now = afterEls.get(id);
      if (!now || now.wallId !== wall) hard.push({ rule: 'sink-wall', message: `The sink must stay on the ${wall} wall.`, entityIds: [id] });
    }
  }
  if (changes) {
    for (const c of [...changes.added, ...changes.removed, ...changes.modified]) {
      const walls = [c.before?.wallId, c.after?.wallId];
      for (const w of o.preserveWalls) if (walls.includes(w)) hard.push({ rule: 'walls', message: `The ${c.label} is on the ${WALL_LABEL[w].toLowerCase()}, which must not change.`, entityIds: [c.id] });
      if (o.scope !== 'all') {
        const el = afterEls.get(c.id) ?? beforeEls.get(c.id);
        const hung = el ? el.position.y >= 300 : c.category === 'opening';
        if (o.scope === 'upper-only' && !hung) hard.push({ rule: 'scope', message: `The ${c.label} is not an upper unit, and only upper units may change.`, entityIds: [c.id] });
        if (o.scope === 'base-only' && hung) hard.push({ rule: 'scope', message: `The ${c.label} is an upper unit, and only base units may change.`, entityIds: [c.id] });
      }
    }
  }
  return { hard: dedupe(hard), soft: dedupe(soft) };
}

/** Two units side by side on one wall facing the same way are a run, not a walkway (defensive). */
function sameRunCorner(project: KitchenProject, g: { id: string; against: string }): boolean {
  const a = allElements(project).find((e) => e.id === g.id);
  const b = allElements(project).find((e) => e.id === g.against);
  return !!a && !!b && !!a.wallId && a.wallId === b.wallId && Math.abs(offsetAlongWall(a) - offsetAlongWall(b)) < 1;
}

function dedupePairs<T extends { id: string; against: string }>(gaps: T[]): T[] {
  const seen = new Set<string>();
  return gaps.filter((g) => {
    const k = [g.id, g.against].sort().join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupe(v: Violation[]): Violation[] {
  const seen = new Set<string>();
  return v.filter((x) => (seen.has(x.message) ? false : (seen.add(x.message), true)));
}

export function walkwayOf(o: DesignObjective): { mm: number; fromDesigner: boolean } {
  return o.minWalkway !== undefined ? { mm: lengthToMm(o.minWalkway, 'Walkway'), fromDesigner: true } : { mm: WALKWAY_MIN, fromDesigner: false };
}
