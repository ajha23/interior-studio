import { Canvas } from '@react-three/fiber';
import { BrickWall, Crosshair, DoorClosed, DoorOpen, Footprints, Grid3x3, Hand, Maximize2, PanelsTopLeft } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { EYE_HEIGHTS } from '@/rendering/scene/walk';
import { formatLength } from '@/engine/measurement/units';
import { ViewpointsMenu } from './ViewpointsMenu';
import { wallFromId } from '@/features/room-editor/WallInspector';
import { WalkMinimap } from './WalkMinimap';
import { useMemo, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { CameraRig } from '@/rendering/scene/CameraRig';
import { KitchenScene } from '@/rendering/scene/KitchenScene';
import { RenderedMarker } from '@/rendering/scene/RenderedMarker';
import { sceneLabels } from '@/rendering/selection/labels';
import { LabelProjector } from '@/rendering/selection/LabelProjector';
import { useEditorStore, type CameraPreset, type VisualStyle } from '@/state/editorStore';
import { openKey } from '@/state/openings';
import { useSelectedChecks } from '@/features/checks/useDesignChecks';

const VIEWS: { preset: CameraPreset; label: string; title: string }[] = [
  { preset: 'iso', label: 'Iso', title: 'Isometric view' },
  { preset: 'top', label: 'Top', title: 'Plan view from above' },
  { preset: 'front', label: 'Back', title: 'Elevation of the back wall' },
  { preset: 'left', label: 'Left', title: 'Elevation of the left wall' },
  { preset: 'right', label: 'Right', title: 'Elevation of the right wall' },
];

const STYLES: { style: VisualStyle; label: string }[] = [
  { style: 'realistic', label: 'Realistic' },
  { style: 'edges', label: 'Edges' },
  { style: 'xray', label: 'X-ray' },
];

const LABEL_TONE = {
  room: 'border bg-card/95 font-medium text-card-foreground',
  selection: 'bg-highlight text-white',
  readout: 'bg-foreground text-background',
  invalid: 'bg-destructive text-white',
} as const;

function Toolbar({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-0.5 rounded-lg border bg-card/95 p-1 shadow-sm', className)} role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * Interactive 3D viewport: orbit (drag), pan (right-drag), zoom (scroll); click selects, drag moves
 * along the wall, the blue grip resizes, double-click focuses. ViewCube top right.
 */
export function Viewport3D({ active = true }: { active?: boolean }) {
  const s = useEditorStore();
  const project = s.project!;
  const overlay = useRef<HTMLDivElement>(null);
  const selectedChecks = useSelectedChecks();
  const zones = useMemo(() => selectedChecks.flatMap((c) => (c.severity === 'warning' && c.zone ? [c.zone] : [])), [selectedChecks]);
  const labels = useMemo(() => sceneLabels(s.preview?.project ?? project, s.selectedId, s.preview), [project, s.selectedId, s.preview]);
  const callbacks = useMemo(
    () => ({
      select: (id: string) => useEditorStore.getState().select(id),
      deselect: () => useEditorStore.getState().select(null),
      // Orbiting: fly to it. Walking: go and stand in front of it.
      focus: (id: string) => {
        const st = useEditorStore.getState();
        st.select(id);
        st.focusSelection();
      },
      preview: s.setPreview,
      commit: (command: Parameters<typeof s.dispatch>[0]) => useEditorStore.getState().dispatch(command),
      opening: (elementId: string, moverId: string) => useEditorStore.getState().openness[openKey(elementId, moverId)] ?? 0,
      setOpening: (elementId: string, moverId: string, t: number) => useEditorStore.getState().setOpening(elementId, moverId, t),
      toggle: (elementId: string, moverId: string) => useEditorStore.getState().toggleOpening(elementId, moverId),
      walkTo: (x: number, z: number) => useEditorStore.getState().requestWalk({ kind: 'goto', x, z }),
    }),
    // The store's actions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="relative size-full" data-testid="viewport-3d">
      <Canvas frameloop={active ? 'always' : 'never'} shadows dpr={[1, 2]} onPointerMissed={(e) => e.button === 0 && s.select(null)} gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <color attach="background" args={['#e8eaee']} />
        <KitchenScene project={project} selectedId={s.selectedId} showGrid={s.showGrid} visualStyle={s.visualStyle} autoHideWalls={s.autoHideWalls} showInteriors={s.showInteriors} interactMode={s.interactMode} walking={s.navMode === 'walk'} openness={s.openness} preview={s.preview} zones={zones} selectedWall={wallFromId(s.selectedId)} callbacks={callbacks} />
        <CameraRig
          project={project}
          request={s.camera.request}
          nonce={s.camera.nonce}
          projection={s.projection}
          walk={s.navMode === 'walk' ? { eye: s.eyeHeight, request: s.walk.request, nonce: s.walk.nonce, onPose: s.setWalkPose } : null}
        />
        <LabelProjector labels={labels} overlay={overlay} />
        <RenderedMarker />
      </Canvas>

      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((l) => (
          <span
            key={l.id}
            data-label={l.id}
            data-testid={l.id === 'room-width' ? 'room-width-label' : l.id === 'room-length' ? 'room-length-label' : l.id}
            style={{ visibility: 'hidden' }}
            className={cn('absolute top-0 left-0 rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-sm', LABEL_TONE[l.tone])}
          >
            {l.text}
          </span>
        ))}
      </div>

      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
        <Toolbar label="Navigation">
          <Button size="xs" variant="ghost" onClick={() => s.requestCamera({ kind: 'fit' })} title="Zoom extents: fit the whole room (Home)" aria-label="Zoom extents">
            <Maximize2 /> Fit
          </Button>
          <Button size="xs" variant="ghost" onClick={s.focusSelection} disabled={!s.selectedId} title="Focus the selected unit and orbit around it (F, or double-click a unit)" aria-label="Focus selection">
            <Crosshair /> Focus
          </Button>
          <Separator vertical className="mx-0.5" />
          {VIEWS.map((v) => (
            <Button key={v.preset} size="xs" variant="ghost" onClick={() => s.requestCamera({ kind: 'preset', preset: v.preset })} title={v.title}>
              {v.label}
            </Button>
          ))}
        </Toolbar>
        <Toolbar label="Walk">
          <Button
            size="xs"
            variant={s.navMode === 'walk' ? 'selected' : 'ghost'}
            aria-pressed={s.navMode === 'walk'}
            onClick={() => s.setNavMode(s.navMode === 'walk' ? 'orbit' : 'walk')}
            title="Walk through the room at eye height (V)"
            aria-label="Walk mode"
          >
            <Footprints /> Walk
          </Button>
          {s.navMode === 'walk' && (
            <Select
              aria-label="Eye height"
              className="h-7 w-auto text-xs"
              value={EYE_HEIGHTS.some((e) => e.value === s.eyeHeight) ? s.eyeHeight : 'custom'}
              onChange={(e) => e.target.value !== 'custom' && s.setEyeHeight(Number(e.target.value))}
            >
              {EYE_HEIGHTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              {!EYE_HEIGHTS.some((e) => e.value === s.eyeHeight) && <option value="custom">Eye {formatLength(s.eyeHeight, project.preferences.unit)}</option>}
            </Select>
          )}
          <ViewpointsMenu />
        </Toolbar>
        <Toolbar label="Interaction">
          <Button
            size="xs"
            variant={s.interactMode ? 'selected' : 'ghost'}
            aria-pressed={s.interactMode}
            onClick={() => s.setInteractMode(!s.interactMode)}
            title="Interact: open doors and drawers like in real life (H)"
            aria-label="Interact mode"
          >
            <Hand /> Interact
          </Button>
          {s.interactMode && (
            <>
              <Button size="xs" variant="ghost" onClick={() => s.setAllOpen(null, true)} title="Open every door and drawer">
                <DoorOpen /> Open all
              </Button>
              <Button size="xs" variant="ghost" onClick={() => s.setAllOpen(null, false)} title="Close every door and drawer">
                <DoorClosed /> Close all
              </Button>
            </>
          )}
        </Toolbar>
        <Toolbar label="Display">
          {STYLES.map((v) => (
            <Button key={v.style} size="xs" variant={s.visualStyle === v.style ? 'selected' : 'ghost'} aria-pressed={s.visualStyle === v.style} onClick={() => s.setVisualStyle(v.style)} title={`Visual style: ${v.label}${v.style === 'xray' ? ' (X)' : ''}`}>
              {v.label}
            </Button>
          ))}
          <Separator vertical className="mx-0.5" />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => s.setProjection(s.projection === 'perspective' ? 'orthographic' : 'perspective')}
            title="Switch between perspective and parallel (orthographic) projection"
            aria-label={`Projection: ${s.projection}`}
          >
            {s.projection === 'perspective' ? 'Perspective' : 'Parallel'}
          </Button>
          <Button
            size="xs"
            variant={s.showInteriors ? 'selected' : 'ghost'}
            aria-pressed={s.showInteriors}
            onClick={() => s.setShowInteriors(!s.showInteriors)}
            title="Show cabinet interiors: fronts become see-through (I)"
            aria-label="Show interiors"
          >
            <PanelsTopLeft /> Inside
          </Button>
          <Button size="xs" variant={s.autoHideWalls ? 'selected' : 'ghost'} aria-pressed={s.autoHideWalls} onClick={s.toggleAutoHideWalls} title="Cut away walls between the camera and the room" aria-label="Cut away walls">
            <BrickWall />
          </Button>
          <Button size="xs" variant={s.showGrid ? 'selected' : 'ghost'} onClick={s.toggleGrid} aria-pressed={s.showGrid} aria-label="Toggle grid" title="Grid (100 mm cells, 1 m sections)">
            <Grid3x3 />
          </Button>
        </Toolbar>
      </div>

      {s.navMode === 'walk' && (
        <div className="absolute right-3 bottom-12">
          <WalkMinimap />
        </div>
      )}
      {s.preview && !s.preview.valid && s.preview.error && (
        <p role="status" className="pointer-events-none absolute bottom-12 left-1/2 max-w-[70%] -translate-x-1/2 rounded-md bg-destructive px-3 py-1.5 text-xs text-white shadow">
          {s.preview.error}
        </p>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
        {s.navMode === 'walk'
          ? `Walking at ${formatLength(s.eyeHeight, project.preferences.unit)} eye height · W A S D: walk · Q / E: turn · Shift: hurry · drag: look around · scroll: step · click the floor: go there · F / double-click a unit: stand at it${s.interactMode ? ' · click doors and drawers to open them' : ''}`
          : s.interactMode
          ? 'Interact: click a door, drawer or appliance door to open or close it · drag a handle to pull it · H to go back to editing'
          : 'Orbit: drag · Pan: right-drag · Zoom: scroll · Move: drag a unit anywhere · Resize: blue W / green H / amber D grips · Rotate: R · Focus: double-click / F · Fit: Home · Interact: H'}
      </p>
    </div>
  );
}
