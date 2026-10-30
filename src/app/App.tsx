import { useEffect, useState } from 'react';
import { openStoredProject } from '@/features/projects/projectActions';
import { ProjectsHome } from '@/features/projects/ProjectsHome';
import { Workspace } from '@/features/kitchen-layout/Workspace';
import { useEditorStore } from '@/state/editorStore';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  const project = useEditorStore((s) => s.project);
  const [openError, setOpenError] = useState<string | null>(null);
  const wantedId = route.name === 'editor' ? route.projectId : null;

  useEffect(() => {
    if (!wantedId) {
      useEditorStore.getState().closeProject();
      return;
    }
    if (useEditorStore.getState().project?.id === wantedId) return;
    let cancelled = false;
    openStoredProject(wantedId).then((error) => {
      if (cancelled || !error) return;
      setOpenError(error);
      window.location.hash = '/';
    });
    return () => {
      cancelled = true;
    };
  }, [wantedId]);

  if (!wantedId) return <ProjectsHome notice={openError} />;
  if (project?.id !== wantedId) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening project…</div>;
  return <Workspace />;
}
