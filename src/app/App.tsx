import { useEffect, useState } from 'react';
import { roomProjectId } from '@/domain';
import { ConfigErrorScreen } from '@/features/auth/ConfigErrorScreen';
import { EmailLinkGate } from '@/features/auth/EmailLinkConfirm';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { useSession } from '@/features/auth/useSession';
import { chooseStudio } from '@/features/studio/roleActions';
import { MembersSettings } from '@/features/studio/MembersSettings';
import { StudioDetails } from '@/features/studio/StudioDetails';
import { StudioGate } from '@/features/studio/StudioGate';
import { StudioPicker } from '@/features/studio/StudioPicker';
import { StudioShell } from '@/features/studio/StudioShell';
import { readLastStudio } from '@/features/studio/useStudio';
import { supabaseConfigError } from '@/infrastructure/supabase/client';
import { HomeView } from '@/features/home/HomeView';
import { openStoredProject } from '@/features/projects/projectActions';
import { ProjectsHome } from '@/features/projects/ProjectsHome';
import { Workspace } from '@/features/kitchen-layout/Workspace';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { navigate, useRoute, type Route } from './router';

const Loading = ({ what }: { what: string }) => <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening {what}…</div>;

/** Every route needs a signed-in session (spec 042, FR-006); configuration problems show a screen, not a blank page. */
export function App() {
  if (supabaseConfigError) return <ConfigErrorScreen message={supabaseConfigError} />;
  return (
    <SessionProvider>
      {/* An emailed sign-in link (`?token_hash=…`, spec 054) opens its own page before anything else. */}
      <EmailLinkGate>
        <SessionGate />
      </EmailLinkGate>
    </SessionProvider>
  );
}

function SessionGate() {
  const { status } = useSession();
  if (status === 'loading') return <div className="grid h-full place-items-center text-sm text-muted-foreground">Checking your session…</div>;
  if (status === 'signed-out') return <SignInScreen />;
  return <SignedInRoutes />;
}

function SignedInRoutes() {
  const route = useRoute();
  if (route.name === 'home') return <StudioRedirect />;
  if (route.name === 'studio-projects' || route.name === 'studio-settings') return <StudioPage route={route} />;
  return <ProjectRoutes route={route} />;
}

/** `#/`: the only studio, else the last-used one, else a picker; or say how to join one (spec 042, US2). */
function StudioRedirect() {
  const { memberships, user, error } = useSession();
  const chosen = chooseStudio(memberships, readLastStudio());
  useEffect(() => {
    if (chosen) navigate({ name: 'studio-projects', slug: chosen });
  }, [chosen]);
  if (chosen) return <Loading what="your studio" />;
  if (memberships.length > 1) return <StudioPicker />;
  return (
    <StudioShell>
      <div className="mx-auto max-w-md px-6 py-16 text-center text-sm">
        <h1 className="mb-2 text-base font-semibold">You are not in a studio yet</h1>
        <p className="text-muted-foreground">{error ?? `Ask a studio owner to invite ${user?.email ?? 'you'}, then sign in again.`}</p>
      </div>
    </StudioShell>
  );
}

function StudioPage({ route }: { route: Extract<Route, { name: 'studio-projects' | 'studio-settings' }> }) {
  const { user, refreshMemberships } = useSession();
  const section = route.name === 'studio-projects' ? 'projects' : 'settings';
  return (
    <StudioGate slug={route.slug}>
      {(studio) => (
        <StudioShell studio={studio.membership} section={section}>
          {route.name === 'studio-projects' ? (
            <ProjectRoutes route={{ name: 'home' }} />
          ) : (
            <>
              <StudioDetails studio={studio} onRenamed={refreshMemberships} />
              <MembersSettings studio={studio} userId={user?.id ?? ''} />
            </>
          )}
        </StudioShell>
      )}
    </StudioGate>
  );
}

/** The editor and the browser's own projects, unchanged from before sign-in existed. */
function ProjectRoutes({ route }: { route: Route }) {
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
