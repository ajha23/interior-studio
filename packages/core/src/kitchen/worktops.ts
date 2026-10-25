/**
 * Continuous worktops. Base units with a worktop that stand edge to edge along the same wall
 * are cut from one slab per run; each run has joints where slabs meet. This module finds those
 * runs and their cut sizes so the workshop and the BOM see real slabs, not loose unit tops.
 */
import type { BaseCabinetItem, Project } from '../domain/types';
import { mm, type Um } from '../domain/units';
import { envelope } from '../furniture';
import { footprint } from '../geometry/furniture';

/** Units whose worktops meet within this gap are one run. */
const JOIN_TOLERANCE_UM = mm(5);

export interface WorktopRun {
  /** Stable id from the first unit in the run (sorted along the wall). */
  id: string;
  name: string;
  itemIds: string[];
  /** Overall slab length (sum of unit widths). */
  lengthUm: Um;
  /** Slab depth including the front overhang. */
  depthUm: Um;
  finishId: string;
  /** Number of joints between slabs in the run (0 for a single slab). */
  joints: number;
}

interface Span {
  item: BaseCabinetItem;
  rot: number;
  start: number;
  end: number;
  depth: number;
  finish: string;
  worktop: number;
}

function axisOf(item: BaseCabinetItem): { ux: number; uy: number; start: number; end: number } {
  const pts = footprint(item);
  const dx = pts[1].x - pts[0].x;
  const dy = pts[1].y - pts[0].y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const proj = pts.map((p) => p.x * ux + p.y * uy);
  return { ux, uy, start: Math.min(...proj), end: Math.max(...proj) };
}

/** Group worktopped base units into continuous runs along each wall. */
export function worktopRuns(project: Project): WorktopRun[] {
  const spans: Span[] = [];
  for (const f of project.furniture) {
    if (f.kind !== 'basecabinet' || f.params.worktopUm <= 0) continue;
    const a = axisOf(f);
    spans.push({
      item: f,
      rot: Math.round((((Math.atan2(a.uy, a.ux) * 180) / Math.PI) % 180 + 180) % 180),
      start: a.start,
      end: a.end,
      depth: envelope(f).depthUm,
      finish: f.materials.worktop,
      worktop: f.params.worktopUm,
    });
  }
  // Same direction, same finish and thickness, same depth: candidates for one slab.
  const byKey = new Map<string, Span[]>();
  for (const s of spans) {
    const key = `${s.rot}|${s.finish}|${s.worktop}|${s.depth}`;
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  const runs: WorktopRun[] = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => a.start - b.start);
    // Units on different lines of the same direction are split by the gap test below.
    let cur: Span[] = [];
    const flush = () => {
      if (!cur.length) return;
      const first = cur[0];
      const end = cur[cur.length - 1];
      const lengthUm = Math.round(cur.reduce((s, c) => s + (c.end - c.start), 0));
      runs.push({
        id: first.item.id,
        name: cur.length === 1 ? `${first.item.name} top` : `${first.item.name} → ${end.item.name} run`,
        itemIds: cur.map((c) => c.item.id),
        lengthUm,
        depthUm: first.depth,
        finishId: first.finish,
        joints: cur.length - 1,
      });
      cur = [];
    };
    for (const s of group) {
      const prev = cur[cur.length - 1];
      if (prev && s.start - prev.end > JOIN_TOLERANCE_UM) flush();
      cur.push(s);
    }
    flush();
  }
  return runs.sort((a, b) => a.name.localeCompare(b.name));
}
