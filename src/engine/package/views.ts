/**
 * Named 3D views for presentation pages: the same set the presentation mode offers (overall, each
 * wall run seen from the room, the island, top, and the project's saved viewpoints). A page stores
 * the view's camera so its snapshot can be captured again exactly after the design changes.
 */
import { allElements, isCabinet, WALL_LABEL, type KitchenProject } from '@/domain';
import type { SnapshotCamera } from './schema';

export interface PresentationView {
  key: string;
  label: string;
  camera: SnapshotCamera;
}

/** Camera preset that faces each wall from inside the room. */
const FACING = { back: 'front', left: 'left', right: 'right' } as const;

export function presentationViews(project: KitchenProject): PresentationView[] {
  const elements = allElements(project);
  const runs = (['back', 'left', 'right'] as const).filter((w) => elements.some((e) => e.wallId === w));
  const island = elements.find((e) => !e.wallId && isCabinet(e));
  return [
    { key: 'overall', label: 'Overall view', camera: { kind: 'preset', preset: 'iso' } },
    ...runs.map((w): PresentationView => ({ key: `run-${w}`, label: `${WALL_LABEL[w]} run`, camera: { kind: 'preset', preset: FACING[w] } })),
    ...(island ? [{ key: 'island', label: 'Island', camera: { kind: 'focus', id: island.id } } satisfies PresentationView] : []),
    { key: 'top', label: 'Top view', camera: { kind: 'preset', preset: 'top' } },
    ...project.viewpoints.map((v): PresentationView => ({ key: `viewpoint-${v.id}`, label: v.name, camera: { kind: 'viewpoint', id: v.id } })),
  ];
}

/** Whether a stored camera can still be reproduced (its element or viewpoint may have been deleted). */
export function cameraAvailable(project: KitchenProject, camera: SnapshotCamera): boolean {
  if (camera.kind === 'focus') return allElements(project).some((e) => e.id === camera.id);
  if (camera.kind === 'viewpoint') return project.viewpoints.some((v) => v.id === camera.id);
  return true;
}

/** The view a stored camera corresponds to, by key. */
export function viewKeyOf(camera: SnapshotCamera): string {
  if (camera.kind === 'viewpoint') return `viewpoint-${camera.id}`;
  if (camera.kind === 'focus') return 'island';
  return camera.preset === 'iso' ? 'overall' : camera.preset === 'top' ? 'top' : `run-${{ front: 'back', left: 'left', right: 'right' }[camera.preset]}`;
}
