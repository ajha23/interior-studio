/**
 * A studio project open by its address (spec 043): `#/s/<slug>/p/<id>` (kitchen),
 * `#/s/<slug>/h/<id>` (home plan) and `#/s/<slug>/h/<id>/room/<roomId>` (a room of that home, still
 * saved as the one home document, FR-014). The studio is checked first (StudioGate); the database
 * decides whether the project can be read.
 */
import { useEffect, type ReactNode } from 'react';
import { navigate, type Route } from '@/app/router';
import { roomProjectId } from '@/domain';
import type { Membership } from '@/features/auth/sessionContext';
import { HomeView } from '@/features/home/HomeView';
import { Workspace } from '@/features/kitchen-layout/Workspace';
import { StudioGate } from '@/features/studio/StudioGate';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { Button } from '@/components/ui/button';
import { ConflictDialog } from './ConflictDialog';
import { OFFLINE_COPY_BANNER, useCloudDocument } from './useCloudDocument';
import { useStudioScope } from './useStudioScope';
import type { StudioContext } from './studioContext';

type DocRoute = Extract<Route, { name: 'cloud-kitchen' | 'cloud-home' | 'cloud-room' }>;

const Centered = ({ children }: { children: ReactNode }) => <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">{children}</div>;

export function StudioDocumentPage({ route }: { route: DocRoute }) {
  return <StudioGate slug={route.slug}>{(studio) => <InStudio route={route} membership={studio.membership} />}</StudioGate>;
}

function InStudio({ route, membership }: { route: DocRoute; membership: Membership }) {
  const studio = useStudioScope(membership);
  if (!studio) return <Centered>Opening your studio…</Centered>;
  // One component per document, so moving between a home's plan and its rooms keeps it open.
  return route.name === 'cloud-kitchen' ? <Document key={route.projectId} studio={studio} route={route} /> : <Document key={route.homeId} studio={studio} route={route} />;
}

function Document({ studio, route }: { studio: StudioContext; route: DocRoute }) {
  const isKitchen = route.name === 'cloud-kitchen';
  const id = isKitchen ? route.projectId : route.homeId;
  const state = useCloudDocument(studio, id, isKitchen ? 'kitchen' : 'home');
  const roomId = route.name === 'cloud-room' ? route.roomId : null;
  const project = useEditorStore((s) => s.project);
  const home = useHomeStore((s) => s.home);
  const openRoomId = useHomeStore((s) => s.roomId);
  const ready = state.status === 'ready';

  // A home: show the plan, or enter the room in the address.
  useEffect(() => {
    if (!ready || isKitchen) return;
    const store = useHomeStore.getState();
    if (store.home?.id !== id) return;
    if (roomId) {
      if (!store.enterRoom(roomId)) navigate({ name: 'cloud-home', slug: studio.slug, homeId: id });
    } else {
      store.leaveRoom();
      useEditorStore.getState().closeProject();
    }
  }, [ready, isKitchen, id, roomId, studio.slug]);

  if (state.status === 'loading') return <Centered>Opening {isKitchen ? 'project' : 'home'}…</Centered>;
  if (state.status === 'error') {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <p role="alert">{state.message}</p>
          <Button variant="outline" size="sm" onClick={() => navigate({ name: 'studio-projects', slug: studio.slug })}>
            Back to {studio.name}
          </Button>
        </div>
      </Centered>
    );
  }

  let body: ReactNode;
  if (isKitchen) {
    body = project?.id === id ? <Workspace /> : <Centered>Opening project…</Centered>;
  } else if (home?.id !== id) {
    body = <Centered>Opening home…</Centered>;
  } else if (!roomId) {
    body = <HomeView />;
  } else {
    const room = home.rooms.find((r) => r.id === roomId);
    body = room && openRoomId === roomId && project?.id === roomProjectId(home, room) ? <Workspace /> : <Centered>Opening room…</Centered>;
  }

  return (
    <div className="flex h-full flex-col">
      {state.offline && (
        <p role="status" className="shrink-0 border-b bg-amber-50 px-3 py-1 text-xs text-amber-900">
          {OFFLINE_COPY_BANNER}
        </p>
      )}
      <div className="min-h-0 flex-1">{body}</div>
      <ConflictDialog />
    </div>
  );
}
