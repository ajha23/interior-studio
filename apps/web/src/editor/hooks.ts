import { useMemo } from 'react';
import { coreOf } from '@studio/core';
import { useStudio } from './store';
import { validateProject, type ValidationResult } from '@studio/core';

export function useValidation(): ValidationResult[] {
  const project = useStudio((s) => s.project);
  return useMemo(() => validateProject(coreOf(project)), [project]);
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
