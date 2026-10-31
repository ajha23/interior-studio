/**
 * How open each door, drawer and basket is (0 closed … 1 fully open). This is view state, like a
 * camera position: it is not part of the project, not saved and not undoable.
 *
 * Real-life rules: an inner drawer or basket behind doors opens those doors first; closing a door
 * past half-way pushes the drawers behind it back in.
 */
import type { Mover } from '@/engine/geometry/parts';

export type Openness = Readonly<Record<string, number>>;

export const openKey = (elementId: string, moverId: string) => `${elementId}/${moverId}`;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export function setOpening(open: Openness, elementId: string, movers: Mover[], moverId: string, t: number): Openness {
  const mover = movers.find((m) => m.id === moverId);
  if (!mover) return open;
  const next: Record<string, number> = { ...open, [openKey(elementId, moverId)]: clamp01(t) };
  if (t > 0) for (const req of mover.requires) next[openKey(elementId, req)] = 1;
  if (t < 0.5) for (const m of movers) if (m.requires.includes(moverId)) next[openKey(elementId, m.id)] = 0;
  return next;
}

export function openingOf(open: Openness, elementId: string, moverId: string): number {
  return open[openKey(elementId, moverId)] ?? 0;
}

export function toggleOpening(open: Openness, elementId: string, movers: Mover[], moverId: string): Openness {
  return setOpening(open, elementId, movers, moverId, openingOf(open, elementId, moverId) >= 0.5 ? 0 : 1);
}

export function setAll(open: Openness, elementId: string, movers: Mover[], t: 0 | 1): Openness {
  const next: Record<string, number> = { ...open };
  for (const m of movers) next[openKey(elementId, m.id)] = t;
  return next;
}
