/**
 * Scores for valid candidates, each 0–100, from measured metrics. Hard-rule violations are never
 * scored: those candidates are rejected before ranking. The formulas are heuristics for comparing
 * options in one project, documented here and shown to the designer (`SCORE_METHOD`).
 */
import type { Priority } from '../schema';
import type { LayoutMetrics } from './metrics';

export interface ScoreBreakdown {
  /** 100 minus 10 per soft warning (hard rules all hold for any scored candidate). */
  constraintCompliance: number;
  /** Inside cabinet volume relative to the best option (and the current design). */
  storage: number;
  /** Work-triangle legs and total against the usual ranges; null when sink, hob or fridge is missing. */
  workflow: number | null;
  /** Narrowest clear floor in front of a run: 1200 mm or more = 100, at the required width = 70. */
  accessibility: number;
  /** Weighted by your priorities (storage, worktop, workflow, cost, accessibility). */
  userPreferenceMatch: number;
  /** Worktop length relative to the best option. */
  counter: number;
  /** Cost of new cabinets relative to the cheapest option (cheapest = 100). */
  budget: number;
  total: number;
}

export const SCORE_METHOD = [
  'Hard rules first: any option that breaks one is not scored or offered.',
  'Storage: inside volume of all cabinets ÷ the largest among the options and the current design.',
  'Worktop: total worktop length ÷ the largest.',
  'Workflow: each sink–hob–fridge leg scores 100 inside 1.2–2.7 m, losing 10 per 100 mm outside; the total likewise against 4.0–7.9 m; averaged. Not scored without all three.',
  'Accessibility: narrowest clear floor in front of a run; 100 at 1200 mm or more, 70 at the required walkway, less below.',
  'Compliance: 100 minus 10 per design warning (wall-cabinet or hood height, landing space).',
  'Your priorities: weighted 50/30/20 % in the order you gave them (equal storage, workflow and accessibility if none).',
  'Total: 40 % your priorities + 15 % each of storage, workflow, accessibility and compliance.',
];

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function legScore(mm: number, lo: number, hi: number): number {
  if (mm >= lo && mm <= hi) return 100;
  const off = mm < lo ? lo - mm : mm - hi;
  return clamp(100 - (off / 100) * 10);
}

export function workflowScore(m: LayoutMetrics): number | null {
  if (!m.triangle) return null;
  const legs = m.triangle.legs.map((l) => legScore(l, 1200, 2700));
  const total = legScore(m.triangle.total, 4000, 7900);
  return clamp((legs.reduce((a, b) => a + b, 0) + total) / 4);
}

export function accessibilityScore(minGap: number | null, required: number): number {
  if (minGap === null) return 100;
  if (minGap >= 1200) return 100;
  if (minGap >= required) return clamp(70 + ((minGap - required) / Math.max(1, 1200 - required)) * 30);
  return clamp((minGap / required) * 70);
}

export function scoreAll(items: { metrics: LayoutMetrics; softCount: number }[], baseline: LayoutMetrics, priorities: Priority[], requiredWalkway: number): ScoreBreakdown[] {
  const maxStorage = Math.max(1, baseline.storageLitres, ...items.map((i) => i.metrics.storageLitres));
  const maxCounter = Math.max(1, baseline.counterMm, ...items.map((i) => i.metrics.counterMm));
  const minCost = Math.min(...items.map((i) => i.metrics.changeCost));
  const weights = priorities.length ? priorities.map((p, i) => ({ p, w: [0.5, 0.3, 0.2, 0.1, 0.1][i] ?? 0.1 })) : (['storage', 'workflow', 'accessibility'] as Priority[]).map((p) => ({ p, w: 1 / 3 }));
  const wsum = weights.reduce((s, x) => s + x.w, 0);
  return items.map(({ metrics: m, softCount }) => {
    const storage = clamp((m.storageLitres / maxStorage) * 100);
    const counter = clamp((m.counterMm / maxCounter) * 100);
    const workflow = workflowScore(m);
    const accessibility = accessibilityScore(m.minWalkwayMm, requiredWalkway);
    const budget = clamp(((minCost + 100) / (m.changeCost + 100)) * 100);
    const constraintCompliance = clamp(100 - softCount * 10);
    const by: Record<Priority, number> = { storage, counter, workflow: workflow ?? 50, budget, accessibility };
    const userPreferenceMatch = clamp(weights.reduce((s, x) => s + by[x.p] * x.w, 0) / wsum);
    const total = clamp(0.4 * userPreferenceMatch + 0.15 * storage + 0.15 * (workflow ?? 50) + 0.15 * accessibility + 0.15 * constraintCompliance);
    return { constraintCompliance, storage, workflow, accessibility, userPreferenceMatch, counter, budget, total };
  });
}
