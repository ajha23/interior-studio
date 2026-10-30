import { useCallback, useEffect, useRef } from 'react';
import { CommandLine, type CommandLineHandle } from '@/features/command-line/CommandLine';
import { StatusBar } from '@/components/layout/StatusBar';
import { TopBar } from '@/components/layout/TopBar';
import { CatalogPanel } from '@/features/cabinet-catalog/CatalogPanel';
import { BomPanel } from '@/features/drawings/BomPanel';
import { PlanView } from '@/features/drawings/PlanView';
import { RoomPanel } from '@/features/room-editor/RoomPanel';
import { selectIsDirty, useEditorStore, useSelectedElement } from '@/state/editorStore';
import { ElementInspector } from './ElementInspector';
import { FeedbackBanner } from './FeedbackBanner';
import { SceneOutline } from './SceneOutline';
import { useShortcuts } from './useShortcuts';
import { Viewport3D } from './Viewport3D';

/** CAD-style workspace: library left, viewport centre, inspector right, BOM below. */
export function Workspace() {
  const view = useEditorStore((s) => s.view);
  const showBom = useEditorStore((s) => s.showBom);
  const selected = useSelectedElement();
  const commandLine = useRef<CommandLineHandle>(null);
  const focusCommandLine = useCallback(() => commandLine.current?.focus(), []);
  useShortcuts(focusCommandLine);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (selectIsDirty(useEditorStore.getState())) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 overflow-y-auto border-r bg-card">
          <CatalogPanel />
          <SceneOutline />
        </aside>
        <main className="flex min-h-0 flex-col bg-viewport">
          {/* The canvas stays mounted while the plan is shown: remounting WebGL is slow and loses the camera. */}
          <div className="relative min-h-0 flex-1">
            <div className={view === '3d' ? 'size-full' : 'invisible absolute inset-0'} aria-hidden={view !== '3d'}>
              <Viewport3D active={view === '3d'} />
            </div>
            {view === 'plan' && <PlanView />}
          </div>
          {showBom && (
            <div className="h-64 shrink-0 border-t bg-card">
              <BomPanel />
            </div>
          )}
          <CommandLine ref={commandLine} />
        </main>
        <aside className="min-h-0 overflow-y-auto border-l bg-card">
          <FeedbackBanner />
          {selected ? <ElementInspector key={selected.id} element={selected} /> : <RoomPanel />}
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
