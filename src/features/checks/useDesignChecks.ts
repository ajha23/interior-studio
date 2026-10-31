import { useMemo } from 'react';
import { designChecks, type DesignCheck } from '@/engine/checks/designChecks';
import { useEditorStore } from '@/state/editorStore';

/** Design checks for the open project, recomputed only when the project changes. */
export function useDesignChecks(): DesignCheck[] {
  const project = useEditorStore((s) => s.project);
  return useMemo(() => (project ? designChecks(project) : []), [project]);
}

/** Checks that involve the selected unit (for the inspector and the highlighted zones). */
export function useSelectedChecks(): DesignCheck[] {
  const checks = useDesignChecks();
  const selectedId = useEditorStore((s) => s.selectedId);
  return useMemo(() => (selectedId ? checks.filter((c) => c.entityIds.includes(selectedId)) : []), [checks, selectedId]);
}
