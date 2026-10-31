import { PanelLeft, PanelRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CommandLine, type CommandLineHandle } from '@/features/command-line/CommandLine';
import { StatusBar } from '@/components/layout/StatusBar';
import { TopBar } from '@/components/layout/TopBar';
import { CatalogPanel } from '@/features/cabinet-catalog/CatalogPanel';
import { BomPanel } from '@/features/drawings/BomPanel';
import { ChecksPanel } from '@/features/checks/ChecksPanel';
import { PlanView } from '@/features/drawings/PlanView';
import { DeliverablesView } from '@/features/deliverables/DeliverablesView';
import { PresentationOverlay } from '@/features/deliverables/PresentationOverlay';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { RoomPanel } from '@/features/room-editor/RoomPanel';
import { OpeningInspector } from '@/features/room-editor/OpeningInspector';
import { WallInspector, wallFromId } from '@/features/room-editor/WallInspector';
import { CandidateBanner } from '@/features/assistant/CandidateBanner';
import { useAssistantStore } from '@/state/assistantStore';
import { selectIsDirty, useEditorStore, useSelectedElement, useSelectedOpening } from '@/state/editorStore';
import { ElementInspector } from './ElementInspector';
import { FeedbackBanner } from './FeedbackBanner';
import { SceneOutline } from './SceneOutline';
import { useShortcuts } from './useShortcuts';
import { Viewport3D } from './Viewport3D';

/** CAD-style workspace: library left, viewport centre, inspector right, assistant beside it, BOM below. */
export function Workspace() {
  const view = useEditorStore((s) => s.view);
  const showBom = useEditorStore((s) => s.showBom);
  const showChecks = useEditorStore((s) => s.showChecks);
  const selected = useSelectedElement();
  const selectedOpening = useSelectedOpening();
  const selectedWall = wallFromId(useEditorStore((s) => s.selectedId));
  const assistantOpen = useAssistantStore((s) => s.open);
  const setAssistantOpen = useAssistantStore((s) => s.setOpen);
  const presenting = useEditorStore((s) => s.presenting);
  // Deliverables are documents: they take the full width (the assistant stays available).
  const documents = view === 'drawings';
  const commandLine = useRef<CommandLineHandle>(null);
  const focusCommandLine = useCallback(() => commandLine.current?.focus(), []);
  useShortcuts(focusCommandLine);
  // Below 1280 px the side panels become drawers; selecting something opens the properties drawer.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  useEffect(
    () =>
      useEditorStore.subscribe((s, prev) => {
        if (s.selectedId && s.selectedId !== prev.selectedId && window.innerWidth < 1280) setPropertiesOpen(true);
      }),
    [],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (selectIsDirty(useEditorStore.getState())) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {!presenting && <TopBar />}
      <div className={cn('flex items-center gap-2 border-b bg-card px-2 py-1 xl:hidden', presenting && 'hidden')} role="toolbar" aria-label="Panels">
        <Button size="xs" variant={libraryOpen ? 'selected' : 'ghost'} aria-pressed={libraryOpen} onClick={() => setLibraryOpen((v) => !v)}>
          <PanelLeft /> Library
        </Button>
        <Button size="xs" variant={propertiesOpen ? 'selected' : 'ghost'} aria-pressed={propertiesOpen} onClick={() => setPropertiesOpen((v) => !v)} className="ml-auto">
          Properties <PanelRight />
        </Button>
      </div>
      {/* Presentation hides every editing panel but keeps the 3D canvas mounted (and its camera). */}
      <div className={cn('relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]', !presenting && (documents ? (assistantOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : '') : assistantOpen ? 'xl:grid-cols-[280px_minmax(0,1fr)_300px_340px]' : 'xl:grid-cols-[280px_minmax(0,1fr)_300px]'))}>
        <aside
          className={cn('min-h-0 overflow-y-auto border-r bg-card max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-30 max-xl:w-[280px] max-xl:shadow-xl', !libraryOpen && 'max-xl:hidden', (presenting || documents) && 'hidden')}
          aria-label="Library"
        >
          <CatalogPanel />
          <SceneOutline />
        </aside>
        <main className="flex min-h-0 flex-col bg-viewport">
          {/* The canvas stays mounted while the plan is shown: remounting WebGL is slow and loses the camera. */}
          <CandidateBanner />
          <div className="relative min-h-0 flex-1">
            <div
              className={view === '3d' ? 'size-full' : view === 'split' ? 'absolute inset-y-0 left-0 w-1/2 border-r' : 'invisible absolute inset-0'}
              aria-hidden={view !== '3d' && view !== 'split'}
            >
              <Viewport3D active={view === '3d' || view === 'split'} />
            </div>
            {presenting && <PresentationOverlay />}
            {(view === 'plan' || view === 'split') && (
              <div className={view === 'split' ? 'absolute inset-y-0 right-0 w-1/2' : 'absolute inset-0'}>
                <PlanView />
              </div>
            )}
            {view === 'drawings' && (
              <div className="absolute inset-0">
                <DeliverablesView />
              </div>
            )}
          </div>
          {showChecks && !presenting && (
            <div className="h-56 shrink-0 border-t bg-card">
              <ChecksPanel />
            </div>
          )}
          {showBom && !presenting && (
            <div className="h-64 shrink-0 border-t bg-card">
              <BomPanel />
            </div>
          )}
          {!presenting && !documents && <CommandLine ref={commandLine} />}
        </main>
        <aside
          className={cn('min-h-0 overflow-y-auto border-l bg-card max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-[320px] max-xl:shadow-xl', !propertiesOpen && 'max-xl:hidden', (presenting || documents) && 'hidden')}
          aria-label="Properties panel"
        >
          <FeedbackBanner />
          {selected ? (
            <ElementInspector key={selected.id} element={selected} />
          ) : selectedOpening ? (
            <OpeningInspector key={selectedOpening.id} opening={selectedOpening} />
          ) : selectedWall ? (
            <WallInspector key={selectedWall} wallId={selectedWall} />
          ) : (
            <RoomPanel />
          )}
        </aside>
        {assistantOpen && !presenting && (
          <aside className="min-h-0 border-l max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-[min(380px,100%)] max-xl:shadow-xl" aria-label="Assistant panel">
            <AssistantPanel onClose={() => setAssistantOpen(false)} />
          </aside>
        )}
      </div>
      {!presenting && <StatusBar />}
    </div>
  );
}
