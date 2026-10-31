import { BookOpen, CheckCircle2, Download, FileSpreadsheet, FileText, History, MonitorPlay, RefreshCw, ShieldCheck, Table2 } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { buildBom } from '@/engine/deliverables/bom';
import { SCALES, type Paper, type ScaleChoice } from '@/engine/deliverables/drawing';
import { designRevision, shortRevision } from '@/engine/deliverables/revision';
import { scheduleRows } from '@/engine/deliverables/schedule';
import { sheetToSvg } from '@/engine/deliverables/svg';
import { LENGTH_UNITS, UNIT_LABEL, type LengthUnit } from '@/engine/measurement/units';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { configFor, downloadFile, drawingSetFor, isStale, KIND_LABEL, sourceProject, useDeliverablesStore, type DeliverableKind } from '@/state/deliverablesStore';
import { useEditorStore } from '@/state/editorStore';
import { BomTable } from './BomTable';
import { PackageStudio } from './package/PackageStudio';
import { ReadinessPanel } from './ReadinessPanel';
import { ScheduleTable } from './ScheduleTable';

/** Deliverables: readiness, dimensioned drawings, schedule, BOM, exports, history and presentation. */
export function DeliverablesView() {
  const project = useEditorStore((s) => s.project)!;
  const { source, approvals, history, section, config: stored } = useDeliverablesStore();
  const { setSection, setConfig, setSource, approveCurrent, generate, regenerate } = useDeliverablesStore.getState();
  const config = configFor(project, stored);
  // Everything below is recomputed from the exact revision whenever the design or settings change.
  const set = useMemo(() => drawingSetFor(source, approvals, stored), [project, source, approvals, stored]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = useMemo(() => sourceProject(source, approvals), [project, source, approvals]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (src ? scheduleRows(src.project, src.revision) : []), [src]);
  const bom = useMemo(() => (src ? buildBom(src.project) : null), [src]);
  if (section === 'package') {
    return (
      <div className="flex size-full min-h-0 flex-col" data-testid="drawings-view">
        <div className="flex items-center gap-2 border-b bg-card px-3 py-1 text-xs">
          <Button size="xs" variant="ghost" onClick={() => setSection('readiness')}>← Technical deliverables</Button>
          <span className="font-medium">Client package</span>
        </div>
        <div className="min-h-0 flex-1">
          <PackageStudio />
        </div>
      </div>
    );
  }
  if (!set || !src || !bom) return <p className="p-6 text-sm">The approved revision could not be loaded.</p>;

  const viewSheets = set.sheets.filter((s) => s.body.kind === 'view');
  const currentSheet = section.startsWith('sheet:') ? set.sheets.find((s) => s.id === section.slice(6)) : undefined;
  const editable = source.kind === 'current';
  const approved = approvals.find((a) => a.revision === src.revision);
  const exportFile = (kind: DeliverableKind, sheetId?: string) => {
    const f = generate(kind, sheetId);
    if (f) downloadFile(f);
  };

  const nav = (id: string, label: ReactNode, badge?: ReactNode) => (
    <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]', section === id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
    </button>
  );
  const dot = (status: string) => <span className={cn('size-2 shrink-0 rounded-full', status === 'ready' ? 'bg-success' : status === 'warnings' ? 'bg-amber-500' : 'bg-destructive')} />;

  return (
    <div className="flex size-full min-h-0" data-testid="drawings-view">
      <nav className="w-56 shrink-0 overflow-y-auto border-r bg-card p-2 max-md:w-40" aria-label="Sheets">
        <h3 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Check</h3>
        {nav('readiness', 'Readiness & settings', dot(set.readiness.outputs.manufacturing.status))}
        <h3 className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Drawings</h3>
        {viewSheets.map((s) => nav(`sheet:${s.id}`, s.title.title, <span className="text-[10px] text-muted-foreground tabular-nums">{s.title.drawingNo.slice(-2)}</span>))}
        {set.missing.length > 0 && <p className="px-2 text-[11px] text-destructive">Missing: {set.missing.join(', ')}</p>}
        <h3 className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Schedules</h3>
        {nav('schedule', 'Cabinet schedule', <Table2 className="size-3.5 text-muted-foreground" />)}
        {nav('bom', 'Bill of materials', !bom.complete ? <span className="text-[10px] text-amber-600">partial</span> : undefined)}
        <h3 className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Share</h3>
        {nav('package', 'Client package', <BookOpen className="size-3.5 text-muted-foreground" />)}
        {nav('history', 'Generated files', history.some((r) => isStale(r, approvals)) ? <span className="text-[10px] text-amber-600">stale</span> : <History className="size-3.5 text-muted-foreground" />)}
        {nav('presentation', 'Client presentation', <MonitorPlay className="size-3.5 text-muted-foreground" />)}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-card px-3 py-1.5 text-xs" role="toolbar" aria-label="Deliverable settings">
          <Select aria-label="Revision" value={source.kind === 'current' ? 'current' : source.revision} onChange={(e) => setSource(e.target.value === 'current' ? { kind: 'current' } : { kind: 'approved', revision: e.target.value })} className="h-7 w-56 text-xs" data-testid="revision-select">
            <option value="current">Current design · {shortRevision(designRevision(project))}</option>
            {approvals.map((a) => (
              <option key={a.revision} value={a.revision}>
                Approved {shortRevision(a.revision)} · {new Date(a.approvedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </option>
            ))}
          </Select>
          {editable && (
            <Button size="xs" variant={approved ? 'ghost' : 'outline'} disabled={!!approved} onClick={() => approveCurrent()} title="Mark this exact design as approved; drawings can be regenerated from it later" data-testid="approve-revision">
              <CheckCircle2 /> {approved ? 'Approved' : 'Approve revision'}
            </Button>
          )}
          <Select aria-label="Drawing units" value={config.unit} onChange={(e) => setConfig({ unit: e.target.value as LengthUnit })} className="h-7 w-36 text-xs">
            {LENGTH_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
          </Select>
          <Select aria-label="Paper" value={config.paper} onChange={(e) => setConfig({ paper: e.target.value as Paper })} className="h-7 w-16 text-xs">
            <option value="A3">A3</option>
            <option value="A4">A4</option>
          </Select>
          <Select aria-label="Scale" value={String(config.scale)} onChange={(e) => setConfig({ scale: (e.target.value === 'fit' ? 'fit' : Number(e.target.value)) as ScaleChoice })} className="h-7 w-24 text-xs">
            <option value="fit">Fit scale</option>
            {SCALES.map((n) => <option key={n} value={n}>1:{n}</option>)}
          </Select>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center rounded border px-2 py-1">Annotations</summary>
            <div className="absolute z-10 mt-1 grid w-56 gap-1 rounded-md border bg-card p-2 shadow-lg">
              {(
                [
                  ['overall', 'Overall dimensions'],
                  ['walls', 'Wall thickness & external'],
                  ['openings', 'Opening positions'],
                  ['units', 'Unit widths & heights'],
                  ['tags', 'Reference tags'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={config.annotations[k]} onChange={(e) => setConfig({ annotations: { ...config.annotations, [k]: e.target.checked } })} />
                  {label}
                </label>
              ))}
            </div>
          </details>
          <div className="ml-auto flex flex-wrap gap-1">
            <Button size="xs" onClick={() => exportFile('pdf-set')} data-testid="export-pdf-set">
              <FileText /> PDF set
            </Button>
            {currentSheet && (
              <>
                <Button size="xs" variant="outline" onClick={() => exportFile('pdf-sheet', currentSheet.id)}>
                  <Download /> PDF sheet
                </Button>
                <Button size="xs" variant="outline" onClick={() => exportFile('svg-sheet', currentSheet.id)}>
                  <Download /> SVG
                </Button>
              </>
            )}
            {section === 'schedule' && (
              <Button size="xs" variant="outline" onClick={() => exportFile('schedule-csv')}>
                <FileSpreadsheet /> CSV
              </Button>
            )}
            {section === 'bom' && (
              <>
                <Button size="xs" variant="outline" onClick={() => exportFile('bom-csv')}>
                  <FileSpreadsheet /> BOM CSV
                </Button>
                <Button size="xs" variant="outline" disabled={!bom.rules} onClick={() => exportFile('cutlist-csv')} title={bom.rules ? 'Panels for the workshop’s cutting software' : 'Choose a construction method first'}>
                  <FileSpreadsheet /> Cut list CSV
                </Button>
              </>
            )}
          </div>
        </div>
        {!editable && <p className="border-b bg-accent px-3 py-1 text-xs text-accent-foreground">Showing approved revision {shortRevision(src.revision)}. The current design may have changed since.</p>}

        <div className="min-h-0 flex-1 overflow-auto bg-viewport p-4">
          {section === 'readiness' && (
            <Panel title="Readiness" subtitle={`Revision ${shortRevision(src.revision)}${approved ? ' · approved' : ''}`}>
              <ReadinessPanel readiness={set.readiness} project={src.project} editable={editable} />
            </Panel>
          )}
          {currentSheet && (
            <figure className="mx-auto max-w-[1400px]" data-testid="drawing-sheet">
              <figcaption className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span data-testid="sheet-title" className="font-medium text-foreground">{currentSheet.title.title}</span>
                <span>{currentSheet.title.drawingNo} · {currentSheet.title.scale} · {currentSheet.title.status}</span>
              </figcaption>
              {/* The SVG comes from our own writer, which escapes every text and attribute. */}
              <div className="bg-white shadow-md [&>svg]:h-auto [&>svg]:w-full" data-testid="sheet-preview" data-sheet-id={currentSheet.id} dangerouslySetInnerHTML={{ __html: sheetToSvg(currentSheet).replace(/^<\?xml[^>]*>\n/, '') }} />
            </figure>
          )}
          {section.startsWith('sheet:') && !currentSheet && <p className="text-sm">This drawing is not in the set any more (the design changed). Choose another sheet.</p>}
          {section === 'schedule' && (
            <Panel title="Cabinet & furniture schedule" subtitle={`Revision ${shortRevision(src.revision)} · ${rows.length} objects`}>
              <ScheduleTable rows={rows} columns={config.scheduleColumns} onColumns={(scheduleColumns) => setConfig({ scheduleColumns })} editable={editable} />
            </Panel>
          )}
          {section === 'bom' && (
            <Panel title="Bill of materials" subtitle={`Revision ${shortRevision(src.revision)} · ${bom.rules ? bom.rules.name : 'no construction method'}`}>
              <BomTable bom={bom} />
            </Panel>
          )}
          {section === 'history' && (
            <Panel title="Generated files" subtitle="Downloaded from this browser; each records the revision it was made from">
              {history.length === 0 && <p className="text-sm text-muted-foreground">Nothing generated yet.</p>}
              <ul className="flex flex-col gap-1.5" data-testid="deliverable-history">
                {history.map((r) => {
                  const stale = isStale(r, approvals);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-xs" data-stale={stale}>
                      <span className="font-medium">{KIND_LABEL[r.kind]}</span>
                      <span className="text-muted-foreground">{r.fileName}</span>
                      <span className="rounded bg-muted px-1 tabular-nums">{shortRevision(r.revision)}{r.source === 'approved' ? ' · approved' : ''}</span>
                      <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                      {stale ? <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-400" data-testid="stale-badge">Stale: the design changed</span> : <span className="rounded bg-success/10 px-1 text-success">Current</span>}
                      <Button size="xs" variant={stale ? 'default' : 'ghost'} className="ml-auto" onClick={() => { const f = regenerate(r.id); if (f) downloadFile(f); }}>
                        <RefreshCw /> {stale ? 'Regenerate for the latest revision' : 'Download again'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          {section === 'presentation' && <PresentationPanel />}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mx-auto flex max-w-[1200px] flex-col gap-3 rounded-lg border bg-card p-4">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function PresentationPanel() {
  const setPresenting = useEditorStore((s) => s.setPresenting);
  return (
    <Panel title="Client presentation" subtitle="The live 3D model with editing tools hidden">
      <p className="text-sm">Present the design with the same 3D model and finishes: overall view, each wall run, the island and saved viewpoints, with doors and drawers you can open. Snapshots are labelled as illustrations: use the drawings for dimensions.</p>
      <Button className="self-start" onClick={() => setPresenting(true)} data-testid="start-presentation">
        <MonitorPlay /> Start presentation
      </Button>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Nothing is changed while presenting.</p>
    </Panel>
  );
}
