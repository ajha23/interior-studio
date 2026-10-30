import { useMemo } from 'react';
import { deriveCountertops, validateProject } from '@/domain';
import { useEditorStore } from '@/state/editorStore';

export function StatusBar() {
  const project = useEditorStore((s) => s.project)!;
  const feedback = useEditorStore((s) => s.feedback);
  const { issues, worktop } = useMemo(
    () => ({ issues: validateProject(project).length, worktop: deriveCountertops(project).reduce((s, c) => s + c.length, 0) }),
    [project],
  );
  const { width, length, height } = project.room;
  return (
    <footer className="flex h-7 items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground tabular-nums">
      <span data-testid="status-room">Room {width} × {length} × {height} mm</span>
      <span>{project.cabinets.length} cabinets · {project.appliances.length} appliances</span>
      <span>Worktop {worktop} mm</span>
      <span className={issues ? 'text-destructive' : 'text-success'}>{issues ? `${issues} issue${issues === 1 ? '' : 's'}` : 'No issues'}</span>
      {feedback?.kind === 'info' && <span className="ml-auto truncate" data-testid="status-message">{feedback.messages[0]}</span>}
    </footer>
  );
}
