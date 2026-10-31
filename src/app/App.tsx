import { useEffect, useState } from 'react';
import { roomProjectId } from '@/domain';
import { HomeView } from '@/features/home/HomeView';
import { openStoredProject } from '@/features/projects/projectActions';
import { ProjectsHome } from '@/features/projects/ProjectsHome';
import { Workspace } from '@/features/kitchen-layout/Workspace';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { useRoute } from './router';

const Loading = ({ what }: { what: string }) => <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening {what}…</div>;

export function App() {
  const route = useRoute();
  const project = useEditorStore((s) => s.project);
  const home = useHomeStore((s) => s.home);
  const roomId = useHomeStore((s) => s.roomId);
  const [openError, setOpenError] = useState<string | null>(null);
  const wantedId = route.name === 'editor' ? route.projectId : null;
  const wantedHome = route.name === 'house' || route.name === 'room' ? route.homeId : null;
  const wantedRoom = route.name === 'room' ? route.roomId : null;

  // Single-room projects.
  useEffect(() => {
    if (wantedHome) return;
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
  }, [wantedId, wantedHome]);

  // Homes, and the room being edited.
  useEffect(() => {
    if (!wantedHome) return;
    let cancelled = false;
    useHomeStore
      .getState()
      .open(wantedHome)
      .then((error) => {
        if (cancelled) return;
        if (error) {
          setOpenError(error);
          window.location.hash = '/';
          return;
        }
        const store = useHomeStore.getState();
        if (wantedRoom) {
          if (!store.enterRoom(wantedRoom)) window.location.hash = `/home/${wantedHome}`;
        } else {
          store.leaveRoom();
          useEditorStore.getState().closeProject();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wantedHome, wantedRoom]);

  if (wantedHome) {
    if (home?.id !== wantedHome) return <Loading what="home" />;
    if (!wantedRoom) return <HomeView />;
    const room = home.rooms.find((r) => r.id === wantedRoom);
    if (!room || roomId !== wantedRoom || project?.id !== roomProjectId(home, room)) return <Loading what="room" />;
    return <Workspace />;
  }
  if (!wantedId) return <ProjectsHome notice={openError} />;
  if (project?.id !== wantedId) return <Loading what="project" />;
  return <Workspace />;
}
