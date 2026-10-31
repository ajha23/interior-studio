/**
 * Captures named 3D views onto presentation pages: new pages ("add the standard 3D views") or
 * existing ones ("capture the stale 3D views again", using each page's stored camera). All captures
 * of one request become a single package edit (one undo step).
 */
import { allElements, newId } from '@/domain';
import { executePackageCommand, type PackageCommand } from '@/engine/package/commands';
import type { SnapshotCamera } from '@/engine/package/schema';
import type { PresentationView } from '@/engine/package/views';
import { useEditorStore } from './editorStore';
import { captureViewport, HiddenPageError, type CaptureCamera } from './packageImages';
import { usePackageStore } from './packageStore';

export interface CaptureTarget {
  /** An existing presentation page, or null for a new one at the end. */
  pageId: string | null;
  view: PresentationView;
}

let busy = false;

function cameraFor(camera: SnapshotCamera): CaptureCamera | 'missing' {
  const editor = useEditorStore.getState();
  if (camera.kind === 'preset') return { orbit: { kind: 'preset', preset: camera.preset } };
  if (camera.kind === 'focus') return editor.project && allElements(editor.project).some((e) => e.id === camera.id) ? { orbit: { kind: 'focus', id: camera.id } } : 'missing';
  const v = editor.project?.viewpoints.find((x) => x.id === camera.id);
  if (!v) return 'missing';
  editor.setEyeHeight(v.eye);
  return { walk: { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch } };
}

/** Captures the views and stores them on their pages; returns what happened, in words. */
export async function captureViews(targets: CaptureTarget[]): Promise<string> {
  const store = usePackageStore.getState();
  if (!store.pkg) return 'There is no client package.';
  if (busy) return 'Already capturing 3D views; wait for it to finish.';
  if (!targets.length) return 'There are no 3D views to capture.';
  busy = true;
  try {
    const shots: { target: CaptureTarget; assetId: string }[] = [];
    const skipped: string[] = [];
    for (const t of targets) {
      const camera = cameraFor(t.view.camera);
      if (camera === 'missing') {
        skipped.push(`${t.view.label} (its viewpoint or element was deleted)`);
        continue;
      }
      let jpeg;
      try {
        jpeg = await captureViewport(camera);
      } catch (e) {
        if (e instanceof HiddenPageError) {
          skipped.push(...targets.slice(targets.indexOf(t)).map((x) => x.view.label));
          usePackageStore.setState({ message: { text: e.message, error: true } });
          break;
        }
        throw e;
      }
      const assetId = jpeg ? await usePackageStore.getState().addImage({ ...jpeg, name: `${t.view.key}.jpg` }) : null;
      if (!assetId) {
        skipped.push(t.view.label);
        continue;
      }
      shots.push({ target: t, assetId });
    }
    const project = useEditorStore.getState().project;
    let pkg = usePackageStore.getState().pkg;
    if (!project || !pkg) return 'The project was closed during the capture.';
    const env = { project, now: new Date(), newId };
    const run = (cmd: PackageCommand) => {
      const r = executePackageCommand(pkg!, cmd, env);
      if (r.ok) pkg = r.package;
      return r;
    };
    let lastPage: string | undefined;
    for (const { target, assetId } of shots) {
      let pageId = target.pageId;
      if (!pageId || !pkg.pages.some((p) => p.id === pageId)) {
        const added = run({ type: 'add-page', template: 'presentation' });
        if (!added.ok) {
          skipped.push(`${target.view.label} (${added.error})`);
          continue;
        }
        pageId = added.selectPageId!;
        run({ type: 'update-page', pageId, patch: { name: target.view.label } });
      }
      const caption = pkg.pages.find((p) => p.id === pageId)?.snapshot?.caption || `${target.view.label} · illustration, not to scale`;
      run({ type: 'set-snapshot', pageId, snapshot: { assetId, caption, camera: target.view.camera } });
      lastPage = pageId;
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    const text = `${hidden ? 'Capture stopped: keep the window visible while 3D views are captured. ' : ''}${shots.length ? `Captured ${shots.length} 3D view${shots.length === 1 ? '' : 's'} from the current design (${shots.map((s) => s.target.view.label).join(', ')}).` : 'No 3D view was captured.'}${skipped.length ? ` Not captured: ${skipped.join('; ')}.` : ''}`;
    if (pkg !== usePackageStore.getState().pkg) usePackageStore.getState().applyPackage(pkg, text);
    else usePackageStore.setState({ message: { text, error: !shots.length } });
    if (lastPage && targets.length === 1) usePackageStore.getState().selectPage(lastPage);
    return text;
  } finally {
    busy = false;
  }
}
