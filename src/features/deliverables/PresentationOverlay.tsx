import { Camera, Eye, X } from 'lucide-react';
import { allElements, isCabinet, WALL_LABEL } from '@/domain';
import { designRevision, shortRevision } from '@/engine/deliverables/revision';
import { Button } from '@/components/ui/button';
import { useEditorStore, type CameraPreset } from '@/state/editorStore';

/** Camera preset that faces each wall from the room. */
const FACING: Partial<Record<'back' | 'left' | 'right', CameraPreset>> = { back: 'front', left: 'left', right: 'right' };

/**
 * Presentation controls over the live 3D model: reusable views (overall, each wall run, island,
 * selection, saved viewpoints), a labelled snapshot, and exit. Nothing here edits the design.
 */
export function PresentationOverlay() {
  const project = useEditorStore((s) => s.project)!;
  const selectedId = useEditorStore((s) => s.selectedId);
  const { requestCamera, requestWalk, setPresenting } = useEditorStore.getState();
  const runs = (['back', 'left', 'right'] as const).filter((w) => allElements(project).some((e) => e.wallId === w));
  const island = allElements(project).find((e) => !e.wallId && isCabinet(e));
  const revision = shortRevision(designRevision(project));
  const views: { label: string; go: () => void }[] = [
    { label: 'Overall', go: () => requestCamera({ kind: 'preset', preset: 'iso' }) },
    ...runs.map((w) => ({ label: `${WALL_LABEL[w]} run`, go: () => requestCamera({ kind: 'preset', preset: FACING[w]! }) })),
    ...(island ? [{ label: 'Island', go: () => requestCamera({ kind: 'focus', id: island.id }) }] : []),
    ...(selectedId ? [{ label: 'Selected', go: () => requestCamera({ kind: 'focus', id: selectedId }) }] : []),
    ...project.viewpoints.map((v) => ({ label: v.name, go: () => requestWalk({ kind: 'pose', pose: { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch } }) })),
  ];
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3" data-testid="presentation-overlay">
        <div className="pointer-events-auto rounded-lg bg-card/90 px-3 py-2 shadow backdrop-blur">
          <p className="text-sm font-semibold">{project.name}</p>
          <p className="text-[11px] text-muted-foreground">
            Revision {revision} · {new Date().toLocaleDateString()} · illustrative view, not to scale
          </p>
        </div>
        <div className="pointer-events-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => snapshot(project.name, revision)} data-testid="snapshot">
            <Camera /> Snapshot
          </Button>
          <Button size="sm" onClick={() => setPresenting(false)} data-testid="exit-presentation">
            <X /> Exit presentation
          </Button>
        </div>
      </div>
      <nav className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap justify-center gap-1 p-3" aria-label="Presentation views">
        {views.map((v) => (
          <Button key={v.label} size="sm" variant="outline" className="bg-card/90 backdrop-blur" onClick={v.go}>
            <Eye /> {v.label}
          </Button>
        ))}
      </nav>
    </>
  );
}

/** Saves the current 3D view as a PNG with a caption (project, revision, date, "not to scale"). */
export function snapshot(projectName: string, revision: string): void {
  const gl = document.querySelector<HTMLCanvasElement>('[data-testid="viewport-3d"] canvas');
  if (!gl) return;
  const caption = 44;
  const c = document.createElement('canvas');
  c.width = gl.width;
  c.height = gl.height + caption;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(gl, 0, 0);
  ctx.fillStyle = '#222222';
  ctx.font = '600 18px Helvetica, Arial, sans-serif';
  ctx.fillText(projectName, 16, gl.height + 28);
  ctx.font = '14px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Revision ${revision} · ${new Date().toLocaleDateString()} · Illustration, not to scale: see the drawings for dimensions`, c.width - 16, gl.height + 28);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `${projectName.replace(/[^\w-]+/g, '-').toLowerCase()}-${revision}-view.png`;
  a.click();
}
