import { PanelLeft, PanelLeftClose, PanelLeftOpen, PanelRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
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
import { AssistantLauncher } from '@/features/assistant/AssistantLauncher';
import { RenderDialog } from '@/features/vision/RenderDialog';
import { RoomPanel } from '@/features/room-editor/RoomPanel';
import { OpeningInspector } from '@/features/room-editor/OpeningInspector';
import { WallInspector, wallFromId } from '@/features/room-editor/WallInspector';
import { CandidateBanner } from '@/features/assistant/CandidateBanner';
import { selectIsDirty, useEditorStore, useSelectedElement, useSelectedOpening } from '@/state/editorStore';
import { ElementInspector } from './ElementInspector';
import { FeedbackBanner } from './FeedbackBanner';
import { SceneOutline } from './SceneOutline';
import { useShortcuts } from './useShortcuts';
import { Viewport3D } from './Viewport3D';

const WIDE = 1280;
const PANELS_KEY = 'interior-studio:panels';

/** Whether each side panel is shown. Remembered on wide screens; narrow screens start with both closed (drawers). */
function initialPanels(): { library: boolean; properties: boolean } {
  if (typeof window === 'undefined' || window.innerWidth < WIDE) return { library: false, properties: false };
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') as { library?: boolean; properties?: boolean };
    return { library: saved.library !== false, properties: saved.properties !== false };
  } catch {
    return { library: true, properties: true };
  }
}

/** A collapsed side panel on a wide screen: a slim strip with a button to bring it back. */
function PanelRail({ side, label, onOpen }: { side: 'left' | 'right'; label: string; onOpen: () => void }) {
  const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen;
  return (
    <div className={cn('hidden min-h-0 flex-col items-center gap-2 bg-card py-2 xl:flex', side === 'left' ? 'border-r' : 'border-l')}>
      <Button size="icon-sm" variant="ghost" aria-label={`Show ${label.toLowerCase()}`} title={`Show ${label.toLowerCase()}`} onClick={onOpen}>
        <Icon />
      </Button>
      <button type="button" onClick={onOpen} className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase [writing-mode:vertical-rl] hover:text-foreground" tabIndex={-1}>
        {label}
      </button>
    </div>
  );
}

/** The title row of a side panel, with the button that hides it. */
function PanelHeader({ side, label, onClose }: { side: 'left' | 'right'; label: string; onClose: () => void }) {
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-3 py-1.5 backdrop-blur">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <Button size="icon-sm" variant="ghost" aria-label={`Hide ${label.toLowerCase()}`} title={`Hide ${label.toLowerCase()}`} onClick={onClose}>
        <Icon />
      </Button>
    </div>
  );
}

/** CAD-style workspace: library left, viewport centre, inspector right, BOM below; the assistant floats bottom right. */
export function Workspace() {
  const view = useEditorStore((s) => s.view);
  const showBom = useEditorStore((s) => s.showBom);
  const showChecks = useEditorStore((s) => s.showChecks);
  const selected = useSelectedElement();
  const selectedOpening = useSelectedOpening();
  const selectedWall = wallFromId(useEditorStore((s) => s.selectedId));
  const presenting = useEditorStore((s) => s.presenting);
  // Deliverables are documents: they take the full width (the assistant stays available).
  const documents = view === 'drawings';
  const commandLine = useRef<CommandLineHandle>(null);
  const focusCommandLine = useCallback(() => commandLine.current?.focus(), []);
  useShortcuts(focusCommandLine);
  // Either side panel can be hidden. Wide screens dock them (a hidden one leaves a slim strip);
  // below 1280 px they are drawers over the viewport, and selecting something opens the properties drawer.
  const [panels, setPanels] = useState(initialPanels);
  const libraryOpen = panels.library;
  const propertiesOpen = panels.properties;
  const setPanel = useCallback((key: 'library' | 'properties', open: boolean | ((v: boolean) => boolean)) => {
    setPanels((p) => {
      const next = { ...p, [key]: typeof open === 'function' ? open(p[key]) : open };
      if (window.innerWidth >= WIDE) {
        try {
          localStorage.setItem(PANELS_KEY, JSON.stringify(next));
        } catch {
          // A convenience only.
        }
      }
      return next;
    });
  }, []);
  const setLibraryOpen = (open: boolean | ((v: boolean) => boolean)) => setPanel('library', open);
  const setPropertiesOpen = (open: boolean | ((v: boolean) => boolean)) => setPanel('properties', open);
  useEffect(
    () =>
      useEditorStore.subscribe((s, prev) => {
        if (s.selectedId && s.selectedId !== prev.selectedId && window.innerWidth < WIDE) setPanel('properties', true);
      }),
    [setPanel],
  );
  const columns = `${libraryOpen ? '280px' : '40px'} minmax(0,1fr) ${propertiesOpen ? '300px' : '40px'}`;

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
      <div
        className={cn('relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]', !presenting && !documents && 'xl:grid-cols-[var(--workspace-columns)]')}
        style={{ '--workspace-columns': columns } as React.CSSProperties}
      >
        {!libraryOpen && !presenting && !documents && <PanelRail side="left" label="Library" onOpen={() => setLibraryOpen(true)} />}
        <aside
          className={cn('min-h-0 overflow-y-auto border-r bg-card max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-30 max-xl:w-[280px] max-xl:shadow-xl', !libraryOpen && 'hidden', (presenting || documents) && 'hidden')}
          aria-label="Library"
        >
          <PanelHeader side="left" label="Library" onClose={() => setLibraryOpen(false)} />
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
          className={cn('min-h-0 overflow-y-auto border-l bg-card max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-[320px] max-xl:shadow-xl', !propertiesOpen && 'hidden', (presenting || documents) && 'hidden')}
          aria-label="Properties panel"
        >
          <PanelHeader side="right" label="Properties" onClose={() => setPropertiesOpen(false)} />
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
        {!propertiesOpen && !presenting && !documents && <PanelRail side="right" label="Properties" onOpen={() => setPropertiesOpen(true)} />}
      </div>
      {!presenting && <AssistantLauncher />}
      <RenderDialog />
      {!presenting && <StatusBar />}
    </div>
  );
}
