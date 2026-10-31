import { Download, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useEditorStore } from '@/state/editorStore';
import { useVisionStore } from '@/state/visionStore';

/** The AI photoreal render of the 3D view: options, progress, result and download. */
export function RenderDialog() {
  const render = useVisionStore((s) => s.render);
  const revision = useEditorStore((s) => s.revision);
  const name = useEditorStore((s) => s.project?.name ?? 'design');
  const { closeRender, startRender, setRenderOptions } = useVisionStore.getState();
  if (!render.open) return null;
  const busy = render.status === 'rendering';
  const stale = render.status === 'done' && render.revision !== null && render.revision !== revision;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-label="Photoreal render" data-testid="render-dialog" onClick={closeRender}>
      <div className="flex max-h-full w-[min(1100px,100%)] flex-col overflow-hidden rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b px-4 py-2.5">
          <Sparkles className="size-4 text-highlight" />
          <h2 className="text-sm font-semibold">Photoreal render</h2>
          <span className="text-xs text-muted-foreground">of the current 3D view</span>
          <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Close render" onClick={closeRender}>
            <X />
          </Button>
        </header>
        <div className="flex flex-wrap items-end gap-3 border-b px-4 py-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Light</span>
            <Select aria-label="Render lighting" value={render.lighting} onChange={(e) => setRenderOptions({ lighting: e.target.value as 'daylight' | 'evening' })} className="h-7 w-36 text-xs">
              <option value="daylight">Daylight</option>
              <option value="evening">Evening, lights on</option>
            </Select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-muted-foreground">Styling (decor only, optional)</span>
            <input value={render.style} onChange={(e) => setRenderOptions({ style: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="e.g. a fruit bowl and plants, morning light" maxLength={300} className="h-7 rounded-md border border-input bg-background px-2" aria-label="Render styling" />
          </label>
          <Button size="sm" onClick={() => void startRender()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {render.status === 'idle' ? 'Render' : 'Render again'}
          </Button>
          {render.url && render.status === 'done' && (
            <a href={render.url} download={`${name.replace(/[^\w-]+/g, '-')}-render.jpg`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted [&_svg]:size-4">
              <Download /> Download
            </a>
          )}
        </div>
        <div className="relative grid min-h-64 flex-1 place-items-center overflow-auto bg-muted/40 p-3">
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" /> Rendering a photograph of this view… (about 30 seconds)
            </p>
          )}
          {render.status === 'error' && (
            <p role="alert" className="max-w-md text-center text-sm text-destructive" data-testid="render-error">
              {render.error}
            </p>
          )}
          {render.url && render.status === 'done' && <img src={render.url} alt="Photoreal render of the 3D view" className="max-h-[70vh] w-auto rounded-md shadow" data-testid="render-image" />}
        </div>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          AI visualisation for presenting the look: it keeps the layout, finishes and colours of the 3D view but may simplify or invent small details. Sizes and construction come from the drawings and schedules, not from this image.
          {stale && <strong className="ml-1 text-amber-700 dark:text-amber-300">The design changed since this render.</strong>}
        </p>
      </div>
    </div>
  );
}
