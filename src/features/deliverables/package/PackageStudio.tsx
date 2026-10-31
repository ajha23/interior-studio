import { ArrowDown, ArrowUp, Copy, FileDown, FileText, Minus, Plus, Redo2, StickyNote, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { WALL_LABEL, WALLS, type WallId } from '@/domain';
import { executePackageCommand, type PackageCommand } from '@/engine/package/commands';
import { composePackage, STATUS_LABEL, type PageStatus } from '@/engine/package/compose';
import { sheetArea } from '@/engine/deliverables/drawing';
import { TEMPLATE_LABEL, TEMPLATES, type Template } from '@/engine/package/schema';
import { newId } from '@/domain';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';
import { packageContext, usePackageStore } from '@/state/packageStore';
import { PackageInspector } from './PackageInspector';
import { moveCommand, PageCanvas } from './PageCanvas';

const DOT: Record<PageStatus, string> = {
  current: 'bg-success',
  customized: 'bg-sky-500',
  stale: 'bg-amber-500',
  'needs-review': 'bg-amber-500',
  'missing-source': 'bg-destructive',
};

/**
 * Client Deliverables Studio: the pages of the project's client package, each editable on its own
 * (notes, label positions, images, title block) while drawings and dimensions stay generated from
 * the design. Edits here never change the design; "Change the size in the design" goes there.
 */
export function PackageStudio() {
  const project = useEditorStore((s) => s.project)!;
  const { pkg, status, error, pageId, selection, message, past, future, assets } = usePackageStore();
  const { createStarter, dispatch, undo, redo, selectPage, select, exportPdf, exportSvg } = usePackageStore.getState();
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState<PackageCommand | null>(null);
  const [addTemplate, setAddTemplate] = useState<Template>('elevation');
  const [addWall, setAddWall] = useState<WallId>('back');

  // A drag previews its command on a copy of the package; nothing is stored until release.
  const shown = useMemo(() => {
    if (!pkg || !preview) return pkg;
    const r = executePackageCommand(pkg, preview, { project, now: new Date(), newId });
    return r.ok ? r.package : pkg;
  }, [pkg, preview, project]);
  const composed = useMemo(() => {
    const ctx = packageContext();
    return shown && ctx ? composePackage(shown, ctx) : [];
  }, [shown, project, assets]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = pkg?.pages.findIndex((p) => p.id === pageId) ?? -1;
  const page = index >= 0 ? pkg!.pages[index]! : null;
  const current = index >= 0 ? composed[index] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (page && selection && current && e.key.startsWith('Arrow')) {
        const h = current.handles.find((x) => x.key === selection);
        if (!h) return;
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        const cmd = moveCommand(page, h, d[0]!, d[1]!);
        if (cmd) dispatch(cmd);
      } else if (page && selection && (e.key === 'Delete' || e.key === 'Backspace')) {
        const h = current?.handles.find((x) => x.key === selection);
        if (h?.kind === 'note') dispatch({ type: 'remove-note', pageId: page.id, noteId: h.key });
        else if (h?.kind === 'card') dispatch({ type: 'remove-card', pageId: page.id, cardId: h.key });
      } else if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, selection, current, dispatch, undo, redo, select]);

  if (status === 'loading' || status === 'idle') return <p className="p-6 text-sm text-muted-foreground">Opening the client package…</p>;
  if (status === 'error') return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!pkg) {
    return (
      <section className="mx-auto mt-6 flex max-w-xl flex-col gap-3 rounded-lg border bg-card p-5" data-testid="package-empty">
        <h2 className="text-sm font-semibold">Client package</h2>
        <p className="text-sm">A multi-page client deliverable for {project.name}: a dimensioned kitchen layout with elevation references, an elevation for each wall in use (A, B, …), a hardware &amp; accessories board, a 3D view and the cabinet schedule, all with your studio title block.</p>
        <p className="text-xs text-muted-foreground">Drawings are generated from the current design and stay linked to it; your notes, label positions, images and page layout are kept separately and survive regeneration.</p>
        <Button className="self-start" onClick={createStarter} data-testid="create-package">
          <FileText /> Create client package
        </Button>
      </section>
    );
  }

  const addNote = () => {
    if (!page) return;
    const area = sheetArea({ paper: page.paper, orientation: page.orientation, client: current?.sheet.client, heading: page.heading || undefined });
    const r = dispatch({ type: 'add-note', pageId: page.id, note: { text: 'NOTE: ', x: Math.round(area.x + 10), y: Math.round(area.y + 10) } });
    if (r.ok) select(r.package.pages[index]!.notes.at(-1)!.id);
  };
  const staleCount = composed.filter((c) => c.status === 'stale').length;

  return (
    <div className="flex size-full min-h-0" data-testid="package-studio">
      <nav className="flex w-60 shrink-0 flex-col border-r bg-card max-md:w-44" aria-label="Package pages">
        <div className="border-b p-2">
          <p className="truncate text-[13px] font-semibold" title={pkg.name}>{pkg.name}</p>
          <p className="text-[11px] text-muted-foreground">{pkg.pages.length} pages{staleCount ? ` · ${staleCount} stale` : ''}</p>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto p-1" data-testid="page-list">
          {pkg.pages.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                aria-current={p.id === pageId ? 'page' : undefined}
                onClick={() => selectPage(p.id)}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]', p.id === pageId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
                title={composed[i] ? STATUS_LABEL[composed[i].status] : undefined}
                data-status={composed[i]?.status}
              >
                <span className="w-4 text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {composed[i] && <span className={cn('size-2 shrink-0 rounded-full', DOT[composed[i].status])} aria-label={STATUS_LABEL[composed[i].status]} />}
              </button>
            </li>
          ))}
        </ol>
        {page && (
          <div className="flex flex-wrap gap-1 border-t p-2" role="toolbar" aria-label="Page actions">
            <Button size="icon-sm" variant="ghost" aria-label="Move page up" title="Move up" disabled={index === 0} onClick={() => dispatch({ type: 'move-page', pageId: page.id, to: index - 1 })}><ArrowUp /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Move page down" title="Move down" disabled={index === pkg.pages.length - 1} onClick={() => dispatch({ type: 'move-page', pageId: page.id, to: index + 1 })}><ArrowDown /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Duplicate page" title="Duplicate" onClick={() => dispatch({ type: 'duplicate-page', pageId: page.id })}><Copy /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete page" title="Delete" disabled={pkg.pages.length === 1} onClick={() => { if (window.confirm(`Delete “${page.name}” from the package?`)) dispatch({ type: 'remove-page', pageId: page.id }); }}><Trash2 /></Button>
          </div>
        )}
        <div className="grid gap-1 border-t p-2">
          <Select aria-label="New page template" value={addTemplate} onChange={(e) => setAddTemplate(e.target.value as Template)} className="h-7 text-xs">
            {TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
          </Select>
          {addTemplate === 'elevation' && (
            <Select aria-label="Wall of the new elevation" value={addWall} onChange={(e) => setAddWall(e.target.value as WallId)} className="h-7 text-xs">
              {WALLS.map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
            </Select>
          )}
          <Button size="xs" variant="outline" onClick={() => dispatch({ type: 'add-page', template: addTemplate, wallId: addTemplate === 'elevation' ? addWall : undefined, at: index + 1 })} data-testid="add-page">
            <Plus /> Add page
          </Button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-card px-3 py-1.5 text-xs" role="toolbar" aria-label="Package editing">
          <Button size="xs" variant="ghost" onClick={undo} disabled={!past.length} title="Undo package edit (Ctrl+Z)" aria-label="Undo package edit"><Undo2 /></Button>
          <Button size="xs" variant="ghost" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo package edit"><Redo2 /></Button>
          <Button size="xs" variant="outline" onClick={addNote} disabled={!page} data-testid="add-note"><StickyNote /> Note</Button>
          <span className="mx-1 h-4 border-l" />
          <Button size="xs" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}><Minus /></Button>
          <button type="button" className="w-10 text-center tabular-nums" onClick={() => setZoom(1)} title="Fit width">{Math.round(zoom * 100)}%</button>
          <Button size="xs" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><Plus /></Button>
          {message && <span className={cn('ml-2 truncate', message.error ? 'text-destructive' : 'text-muted-foreground')} role="status" data-testid="package-message">{message.text}</span>}
          <div className="ml-auto flex gap-1">
            {page && <Button size="xs" variant="outline" onClick={() => exportSvg(page.id)}><FileDown /> Page SVG</Button>}
            <Button size="xs" onClick={() => exportPdf()} data-testid="export-package-pdf" title={staleCount ? `${staleCount} stale page(s) will be marked STALE in the PDF` : undefined}>
              <FileText /> Package PDF
            </Button>
          </div>
        </div>
        {current && current.status === 'stale' && page && (
          <div className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1 text-xs text-amber-800 dark:text-amber-300" data-testid="stale-banner">
            {current.reasons[0]}
            {page.template !== 'presentation' && (
              <Button size="xs" className="ml-auto" onClick={() => dispatch({ type: 'regenerate-page', pageId: page.id })}>Regenerate</Button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-viewport p-4" onPointerDown={(e) => e.target === e.currentTarget && select(null)}>
          {page && current && (
            <PageCanvas
              page={page}
              composed={current}
              zoom={zoom}
              selection={selection}
              onSelect={select}
              onPreview={setPreview}
              onCommit={(cmd) => dispatch(cmd)}
            />
          )}
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-y-auto border-l bg-card max-lg:w-64" aria-label="Package properties" data-testid="package-inspector">
        {page && current && <PackageInspector key={page.id} pkg={pkg} page={page} composed={current} />}
      </aside>
    </div>
  );
}
