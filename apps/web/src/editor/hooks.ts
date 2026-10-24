import { useMemo } from 'react';
import { coreOf } from '@studio/core';
import { useStudio } from './store';
import { detectRooms, validateProject, type DetectedRoom, type ValidationResult } from '@studio/core';

/** Rooms derived from the walls; recomputed only when the plan changes. */
export function useRooms(): DetectedRoom[] {
  const plan = useStudio((s) => s.project.plan);
  return useMemo(() => detectRooms(plan), [plan]);
}

export function useValidation(): ValidationResult[] {
  const project = useStudio((s) => s.project);
  const clientView = useStudio((s) => s.clientView);
  const rooms = useRooms();
  // Clients see the design, not the designer's working checks.
  return useMemo(() => (clientView ? [] : validateProject(coreOf(project), rooms)), [project, rooms, clientView]);
}

export function severityById(results: ValidationResult[]): Map<string, 'error' | 'warning'> {
  const m = new Map<string, 'error' | 'warning'>();
  for (const r of results)
    for (const id of r.itemIds) {
      if (r.severity === 'error' || !m.has(id)) m.set(id, r.severity);
    }
  return m;
}

export function useSelectedFurniture() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  if (selection?.kind !== 'furniture') return null;
  return project.furniture.find((f) => f.id === selection.id) ?? null;
}
