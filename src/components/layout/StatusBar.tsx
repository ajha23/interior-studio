import { useMemo } from 'react';
import { deriveCountertops, validateProject } from '@/domain';
import { useDesignChecks } from '@/features/checks/useDesignChecks';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength } from '@/state/units';

export function StatusBar() {
  const project = useEditorStore((s) => s.project)!;
  const feedback = useEditorStore((s) => s.feedback);
  const toggleChecks = useEditorStore((s) => s.toggleChecks);
  const fmt = useFormatLength();
  const warnings = useDesignChecks().filter((c) => c.severity === 'warning').length;
  const { issues, worktop } = useMemo(
    () => ({ issues: validateProject(project).length, worktop: deriveCountertops(project).reduce((s, c) => s + c.length, 0) }),
    [project],
  );
  const { width, length, height } = project.room;
  return (
    <footer className="flex h-7 items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground tabular-nums">
      <span data-testid="status-room" data-mm={`${width}x${length}x${height}`}>Room {fmt(width)} × {fmt(length)} × {fmt(height)}</span>
      <span>{project.cabinets.length} cabinets · {project.appliances.length} appliances</span>
      <span>Worktop {fmt(worktop)}</span>
      <span className={issues ? 'text-destructive' : 'text-success'}>{issues ? `${issues} issue${issues === 1 ? '' : 's'}` : 'No issues'}</span>
      <button type="button" onClick={toggleChecks} className={warnings ? 'text-amber-600 hover:underline' : 'hover:underline'} data-testid="status-checks">
        {warnings ? `${warnings} design warning${warnings === 1 ? '' : 's'}` : 'Design checks OK'}
      </button>
      {feedback?.kind === 'info' && <span className="ml-auto truncate" data-testid="status-message">{feedback.messages[0]}</span>}
    </footer>
  );
}
