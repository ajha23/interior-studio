import { allElements, openingPlacement, type KitchenProject, type WallId } from '@/domain';
import type { Box } from '@/engine/geometry/box';
import type { Preview, VisualStyle } from '@/state/editorStore';
import { Countertops } from '../cabinets/Countertops';
import { ElementModel } from '../cabinets/ElementModel';
import { OpeningModel } from '../cabinets/OpeningModel';
import { useSceneMaterials } from '../materials/useSceneMaterials';
import { useMemo } from 'react';
import type { Openness } from '@/state/openings';
import { useDirectEdit, type DirectEditCallbacks } from '../selection/directEdit';
import { useInteraction, type InteractCallbacks } from '../selection/interaction';
import { InvalidGhost, ResizeGrips } from '../selection/Grips';
import { toWorld } from '../units';
import { RoomShell } from './RoomShell';

const NONE: Record<string, number> = {};

interface Props {
  project: KitchenProject;
  selectedId: string | null;
  showGrid: boolean;
  visualStyle: VisualStyle;
  autoHideWalls: boolean;
  showInteriors: boolean;
  interactMode: boolean;
  walking: boolean;
  openness: Openness;
  preview: Preview | null;
  /** Amber areas to highlight: what a selected unit's doors sweep, or a too-narrow walkway. */
  zones: Box[];
  callbacks: DirectEditCallbacks & InteractCallbacks & { deselect: () => void; walkTo: (x: number, z: number) => void };
  selectedWall: WallId | null;
}

/**
 * The whole kitchen, derived from the project on every change. While a drag is in progress the
 * dry-run result is shown instead, so neighbours and worktops move live.
 */
export function KitchenScene({ project, selectedId, showGrid, visualStyle, autoHideWalls, showInteriors, interactMode, walking, openness, preview, zones, callbacks, selectedWall }: Props) {
  const shown = preview?.project ?? project;
  const materials = useSceneMaterials(shown.materials, visualStyle);
  const edit = useDirectEdit(project, callbacks);
  const interact = useInteraction(callbacks);
  // Openness grouped by element, so each element gets only its own movers.
  const openByElement = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const [key, t] of Object.entries(openness)) {
      const slash = key.indexOf('/');
      (out[key.slice(0, slash)] ??= {})[key.slice(slash + 1)] = t;
    }
    return out;
  }, [openness]);
  /** In interact mode a unit's body only selects (and double-click focuses); it never moves. */
  const selectOnly = (id: string) => ({
    onPointerDown: (e: { button: number; stopPropagation: () => void }) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      callbacks.select(id);
    },
    onPointerMove: () => {},
    onPointerUp: () => {},
    onDoubleClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      callbacks.focus(id);
    },
  });
  const { width, length, height } = shown.room;
  const selected = selectedId ? allElements(shown).find((e) => e.id === selectedId) : undefined;

  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#ffffff', '#b9ad9c', 0.8]} />
      <directionalLight
        castShadow
        intensity={1.3}
        position={[toWorld(width) * 0.7, toWorld(height) + 2.5, toWorld(length) + 2]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
      />
      <RoomShell project={shown} materials={materials} showGrid={showGrid} autoHideWalls={autoHideWalls && !walking} onBackgroundClick={callbacks.deselect} onWallClick={(w) => callbacks.select(`wall-${w}`)} selectedWall={selectedWall} onFloorClick={walking ? callbacks.walkTo : undefined} />
      <Countertops project={shown} materials={materials} />
      {allElements(shown).map((el) => (
        <ElementModel
          key={el.id}
          element={el}
          carcassMaterialId={shown.surfaces.carcass}
          materials={materials}
          selected={el.id === selectedId}
          showInterior={showInteriors}
          handlers={interactMode ? selectOnly(el.id) : edit.body(el)}
          openness={openByElement[el.id] ?? NONE}
          moverHandlers={interactMode ? (m) => interact(el, m) : null}
        />
      ))}
      {shown.openings.map((o) => {
        const place = openingPlacement(shown.room, o);
        return (
          <OpeningModel
            key={o.id}
            opening={o}
            room={shown.room}
            joineryMaterialId={shown.surfaces.carcass}
            materials={materials}
            selected={o.id === selectedId}
            openness={openByElement[o.id] ?? NONE}
            onSelect={callbacks.select}
            moverHandlers={interactMode ? (m) => interact({ id: o.id, ...place }, m) : null}
          />
        );
      })}
      {selected && !interactMode && <ResizeGrips element={selected} grip={(axis) => edit.grip(selected, axis)} />}
      {preview && !preview.valid && preview.attempt && <InvalidGhost attempt={preview.attempt} />}
      {zones.map((z, i) => (
        <mesh key={`zone${i}`} position={[toWorld((z.minX + z.maxX) / 2), toWorld((z.minY + z.maxY) / 2), toWorld((z.minZ + z.maxZ) / 2)]} raycast={() => null}>
          <boxGeometry args={[toWorld(z.maxX - z.minX), toWorld(Math.max(10, z.maxY - z.minY)), toWorld(z.maxZ - z.minZ)]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
