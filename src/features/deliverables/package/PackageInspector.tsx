import { Camera, Eye, EyeOff, ImagePlus, MoveLeft, MoveRight, RefreshCw, RotateCcw, Ruler, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { WALL_LABEL, WALLS, type WallId } from '@/domain';
import { STATUS_LABEL, type ComposedPage, type Handle } from '@/engine/package/compose';
import { TECHNICAL, TEMPLATE_LABEL, type ClientPackage, type Note, type Page, type PackageInfo } from '@/engine/package/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useEditorStore } from '@/state/editorStore';
import { usePackageStore } from '@/state/packageStore';
import { presentationViews, viewKeyOf } from '@/engine/package/views';
import { captureViews } from '@/state/packageCapture';
import { captureViewport, fileToJpeg } from '@/state/packageImages';

/** A text field that commits on blur or Enter (one undo step per edit, not per keystroke). */
function Field({ label, value, onCommit, multiline, testId, placeholder }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; testId?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  // Follow the stored value when it changes elsewhere (undo, another field).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setV(value);
  }
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <label className="grid gap-0.5 text-[11px] text-muted-foreground">
      {label}
      {multiline ? (
        <textarea className="min-h-16 rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} data-testid={testId} placeholder={placeholder} />
      ) : (
        <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} data-testid={testId} placeholder={placeholder} />
      )}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-b p-3">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Properties of the selected element, or of the page and package when nothing is selected. */
export function PackageInspector({ pkg, page, composed }: { pkg: ClientPackage; page: Page; composed: ComposedPage }) {
  const selection = usePackageStore((s) => s.selection);
  const handle = composed.handles.find((h) => h.key === selection);
  if (handle?.kind === 'note') return <NoteProps page={page} id={handle.key} />;
  if (handle && (handle.kind === 'dim' || handle.kind === 'tag' || handle.kind === 'text' || handle.kind === 'marker')) return <GeneratedProps pkg={pkg} page={page} handle={handle} />;
  if (handle?.kind === 'card') return <CardProps page={page} id={handle.key} />;
  return <PageProps pkg={pkg} page={page} composed={composed} />;
}

function NoteProps({ page, id }: { page: Page; id: string }) {
  const dispatch = usePackageStore((s) => s.dispatch);
  const note = page.notes.find((n) => n.id === id);
  if (!note) return null;
  const update = (patch: Partial<Omit<Note, 'id'>>) => dispatch({ type: 'update-note', pageId: page.id, noteId: id, patch });
  return (
    <Section title="Note">
      <Field label="Text" value={note.text} multiline onCommit={(text) => update({ text })} testId="note-text" />
      <div className="grid grid-cols-3 gap-2">
        <label className="grid gap-0.5 text-[11px] text-muted-foreground">
          Size (mm)
          <Select value={String(note.size)} onChange={(e) => update({ size: Number(e.target.value) })}>
            {[2, 2.5, 3, 3.5, 4, 5, 6, 8].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </label>
        <label className="grid gap-0.5 text-[11px] text-muted-foreground">
          Colour
          <Select value={note.color} onChange={(e) => update({ color: e.target.value as 'red' | 'black' })}>
            <option value="red">Red</option>
            <option value="black">Black</option>
          </Select>
        </label>
        <label className="flex items-end gap-1 pb-2 text-xs">
          <input type="checkbox" checked={note.bold} onChange={(e) => update({ bold: e.target.checked })} /> Bold
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">At {note.x} × {note.y} mm on the paper. Drag it on the page or use the arrow keys.</p>
      <Button size="xs" variant="outline" className="justify-self-start" onClick={() => dispatch({ type: 'remove-note', pageId: page.id, noteId: id })}>
        <Trash2 /> Delete note
      </Button>
    </Section>
  );
}

function GeneratedProps({ pkg, page, handle }: { pkg: ClientPackage; page: Page; handle: Handle }) {
  const dispatch = usePackageStore((s) => s.dispatch);
  const selectPage = usePackageStore((s) => s.selectPage);
  const o = page.overrides[handle.key];
  const toDesign = (id?: string) => {
    const editor = useEditorStore.getState();
    if (id) editor.select(id);
    editor.setView('3d');
  };
  const markerPage = handle.kind === 'marker' ? pkg.pages.find((p) => p.label === handle.label) : undefined;
  return (
    <Section title={handle.kind === 'dim' ? 'Dimension' : handle.kind === 'marker' ? 'Elevation marker' : handle.kind === 'tag' ? 'Reference tag' : 'Label'}>
      {handle.kind === 'dim' && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs" data-testid="dimension-value">
          <p className="flex items-center gap-1 font-medium"><Ruler className="size-3.5" /> {handle.label} <span className="text-muted-foreground">({handle.value} mm)</span></p>
          <p className="mt-1 text-muted-foreground">Measured from the design model; it cannot be typed over here. Moving the label or line changes only this page.</p>
          <Button size="xs" variant="outline" className="mt-2" onClick={() => toDesign()} data-testid="edit-in-design">
            Change the size in the design
          </Button>
        </div>
      )}
      {handle.kind === 'tag' && (
        <div className="text-xs">
          <p>Reference <b>{handle.label}</b> ({handle.elementId}).</p>
          {handle.elementId && (
            <Button size="xs" variant="outline" className="mt-2" onClick={() => toDesign(handle.elementId)}>
              Select {handle.label} in the design
            </Button>
          )}
        </div>
      )}
      {markerPage && (
        <Button size="xs" variant="outline" className="justify-self-start" onClick={() => selectPage(markerPage.id)}>
          Open “{markerPage.name}”
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground tabular-nums">{o ? `Moved ${o.dx} / ${o.dy} mm on the paper${o.hidden ? ', hidden' : ''}.` : 'In its generated position.'}</p>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" disabled={!o} onClick={() => dispatch({ type: 'set-override', pageId: page.id, key: handle.key, override: null })}>
          <RotateCcw /> Reset position
        </Button>
        <Button size="xs" variant="outline" onClick={() => dispatch({ type: 'set-override', pageId: page.id, key: handle.key, override: { dx: o?.dx ?? 0, dy: o?.dy ?? 0, hidden: !o?.hidden } })} data-testid="toggle-hidden">
          {o?.hidden ? <Eye /> : <EyeOff />} {o?.hidden ? 'Show' : 'Hide on this page'}
        </Button>
      </div>
    </Section>
  );
}

function CardProps({ page, id }: { page: Page; id: string }) {
  const dispatch = usePackageStore((s) => s.dispatch);
  const cards = page.cards ?? [];
  const i = cards.findIndex((c) => c.id === id);
  const card = cards[i];
  if (!card) return null;
  return (
    <Section title={`Reference card ${i + 1} of ${cards.length}`}>
      <ImagePicker label={card.assetId ? 'Replace image' : 'Choose image'} onPicked={(assetId) => dispatch({ type: 'update-card', pageId: page.id, cardId: id, patch: { assetId } })} />
      <Field label="Caption" value={card.caption} onCommit={(caption) => dispatch({ type: 'update-card', pageId: page.id, cardId: id, patch: { caption } })} testId="card-caption" />
      <Field label="Specification (only what is known: product, size…)" value={card.spec} multiline onCommit={(spec) => dispatch({ type: 'update-card', pageId: page.id, cardId: id, patch: { spec } })} />
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" disabled={i === 0} onClick={() => dispatch({ type: 'move-card', pageId: page.id, cardId: id, to: i - 1 })} aria-label="Move card earlier"><MoveLeft /></Button>
        <Button size="xs" variant="outline" disabled={i === cards.length - 1} onClick={() => dispatch({ type: 'move-card', pageId: page.id, cardId: id, to: i + 1 })} aria-label="Move card later"><MoveRight /></Button>
        <Button size="xs" variant="outline" onClick={() => dispatch({ type: 'remove-card', pageId: page.id, cardId: id })}><Trash2 /> Remove</Button>
      </div>
    </Section>
  );
}

/** Uploads an image (re-encoded as JPEG) into this project's image store. */
function ImagePicker({ label, onPicked, testId }: { label: string; onPicked: (assetId: string) => void; testId?: string }) {
  const addImage = usePackageStore((s) => s.addImage);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid={testId}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const jpeg = await fileToJpeg(file);
            const id = await addImage({ ...jpeg, name: file.name });
            if (id) onPicked(id);
          } catch (err) {
            usePackageStore.setState({ message: { text: err instanceof Error ? err.message : String(err), error: true } });
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button size="xs" variant="outline" className="justify-self-start" disabled={busy} onClick={() => input.current?.click()}>
        <ImagePlus /> {busy ? 'Reading…' : label}
      </Button>
    </>
  );
}

/** The 3D view of a presentation page: a named, reproducible view or the camera as it is now. */
function SnapshotProps({ page }: { page: Page }) {
  const dispatch = usePackageStore((s) => s.dispatch);
  const project = useEditorStore((s) => s.project)!;
  const views = presentationViews(project);
  const stored = page.snapshot?.camera ? viewKeyOf(page.snapshot.camera) : page.snapshot ? 'free' : 'overall';
  const [choice, setChoice] = useState(stored);
  const [capturing, setCapturing] = useState(false);
  const view = views.find((v) => v.key === choice);
  const capture = async () => {
    setCapturing(true);
    try {
      if (view) {
        await captureViews([{ pageId: page.id, view }]);
        return;
      }
      // The camera as it is now: an illustration that cannot be framed again automatically.
      const jpeg = await captureViewport().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
      if (jpeg instanceof Error) return void usePackageStore.setState({ message: { text: jpeg.message, error: true } });
      if (!jpeg) return void usePackageStore.setState({ message: { text: 'Open the 3D view once so there is something to capture.', error: true } });
      const id = await usePackageStore.getState().addImage({ ...jpeg, name: '3d-view.jpg' });
      if (id) dispatch({ type: 'set-snapshot', pageId: page.id, snapshot: { assetId: id, caption: page.snapshot?.caption || 'Kitchen 3D view · illustration, not to scale' } });
    } finally {
      setCapturing(false);
    }
  };
  return (
    <>
      <label className="grid gap-0.5 text-[11px] text-muted-foreground">
        View
        <Select value={choice} onChange={(e) => setChoice(e.target.value)} data-testid="snapshot-view">
          {views.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          <option value="free">Current 3D camera (as set up)</option>
        </Select>
      </label>
      <p className="text-xs text-muted-foreground">
        {view ? 'Named views are framed automatically and can be captured again after the design changes.' : 'Set the camera up in the 3D view or presentation mode first; this view cannot be framed again automatically.'} A snapshot is an illustration, not a dimensioned drawing, and is marked stale when the design changes.
      </p>
      <Button size="xs" className="justify-self-start" disabled={capturing} data-testid="capture-view" onClick={capture}>
        <Camera /> {capturing ? 'Capturing…' : page.snapshot ? 'Capture again' : 'Capture the 3D view'}
      </Button>
      {page.snapshot && <Field label="Caption" value={page.snapshot.caption} onCommit={(caption) => dispatch({ type: 'set-snapshot-caption', pageId: page.id, caption })} />}
    </>
  );
}

const INFO_FIELDS: [keyof PackageInfo, string][] = [
  ['projectTitle', 'Project'],
  ['client', 'Client'],
  ['address', 'Address'],
  ['date', 'Date'],
  ['drawnBy', 'Drawn by'],
  ['approvedBy', 'Approved by'],
  ['referenceBy', 'Reference by'],
  ['studio', 'Studio name'],
  ['studioAddress', 'Studio address'],
];

function PageProps({ pkg, page, composed }: { pkg: ClientPackage; page: Page; composed: ComposedPage }) {
  const dispatch = usePackageStore((s) => s.dispatch);
  const select = usePackageStore((s) => s.select);
  const technical = TECHNICAL.includes(page.template);
  const hidden = composed.handles.filter((h) => h.hidden);
  const [rev, setRev] = useState({ no: '', date: '', description: '' });
  return (
    <>
      <Section title={`Page · ${TEMPLATE_LABEL[page.template]}`}>
        <div className="rounded-md border p-2 text-xs" data-testid="page-status" data-status={composed.status}>
          <p className="font-medium">{STATUS_LABEL[composed.status]}</p>
          {composed.reasons.map((r) => <p key={r} className="text-muted-foreground">{r}</p>)}
          {technical && page.source && <p className="mt-1 text-[11px] text-muted-foreground">Generated from revision {page.source.revision.slice(0, 8)}.</p>}
          {technical && (
            <Button size="xs" variant={composed.status === 'stale' || composed.status === 'missing-source' ? 'default' : 'outline'} className="mt-2" onClick={() => dispatch({ type: 'regenerate-page', pageId: page.id })} data-testid="regenerate-page">
              <RefreshCw /> Regenerate from the current design
            </Button>
          )}
          {composed.orphaned.length > 0 && (
            <Button size="xs" variant="outline" className="mt-2 ml-1" onClick={() => dispatch({ type: 'discard-orphans', pageId: page.id, keys: composed.orphaned })} data-testid="discard-orphans">
              Discard {composed.orphaned.length} unmatched edit{composed.orphaned.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
        <Field label="Page name" value={page.name} onCommit={(name) => dispatch({ type: 'update-page', pageId: page.id, patch: { name } })} testId="page-name" />
        <Field label="Heading (optional)" value={page.heading} onCommit={(heading) => dispatch({ type: 'update-page', pageId: page.id, patch: { heading } })} />
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-0.5 text-[11px] text-muted-foreground">
            Paper
            <Select value={page.paper} onChange={(e) => dispatch({ type: 'update-page', pageId: page.id, patch: { paper: e.target.value as 'A3' | 'A4' } })} data-testid="page-paper">
              <option value="A3">A3</option>
              <option value="A4">A4</option>
            </Select>
          </label>
          <label className="grid gap-0.5 text-[11px] text-muted-foreground">
            Orientation
            <Select value={page.orientation} onChange={(e) => dispatch({ type: 'update-page', pageId: page.id, patch: { orientation: e.target.value as 'landscape' | 'portrait' } })}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </Select>
          </label>
        </div>
        {page.template === 'elevation' && (
          <div className="grid grid-cols-[4rem_1fr] gap-2">
            <Field label="Reference" value={page.label ?? ''} onCommit={(label) => dispatch({ type: 'update-page', pageId: page.id, patch: { label } })} />
            <label className="grid gap-0.5 text-[11px] text-muted-foreground">
              Wall
              <Select value={page.wallId} onChange={(e) => dispatch({ type: 'set-wall', pageId: page.id, wallId: e.target.value as WallId })}>
                {WALLS.map((w) => <option key={w} value={w}>{WALL_LABEL[w]}</option>)}
              </Select>
            </label>
          </div>
        )}
        {page.template === 'hardware' && (
          <>
            <label className="grid gap-0.5 text-[11px] text-muted-foreground">
              Columns
              <Select value={String(page.columns ?? 5)} onChange={(e) => dispatch({ type: 'update-page', pageId: page.id, patch: { columns: Number(e.target.value) } })}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
            <div className="flex flex-wrap gap-1">
              <ImagePicker label="Add reference image" testId="add-card-image" onPicked={(assetId) => {
                const r = dispatch({ type: 'add-card', pageId: page.id, card: { assetId, caption: 'Reference image' } });
                if (r.ok) select(r.package.pages.find((p) => p.id === page.id)!.cards!.at(-1)!.id);
              }} />
            </div>
          </>
        )}
        {page.template === 'presentation' && <SnapshotProps page={page} />}
        {hidden.length > 0 && (
          <div className="grid gap-1 text-xs">
            <p className="text-[11px] text-muted-foreground">Hidden on this page</p>
            {hidden.map((h) => (
              <Button key={h.key} size="xs" variant="ghost" className="justify-start" onClick={() => dispatch({ type: 'set-override', pageId: page.id, key: h.key, override: null })}>
                <Eye /> Show {h.key.split(':')[0]} {h.key.split(':').slice(1, 2).join('')}
              </Button>
            ))}
          </div>
        )}
      </Section>
      <Section title="Title block (all pages)">
        <Field label="Package name" value={pkg.name} onCommit={(name) => dispatch({ type: 'rename-package', name })} />
        {INFO_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} value={pkg.info[k]} onCommit={(v) => dispatch({ type: 'set-info', patch: { [k]: v } })} testId={`info-${k}`} />
        ))}
        <p className="text-[11px] text-muted-foreground">Drawing revisions</p>
        {pkg.revisions.map((r, i) => (
          <div key={`${r.no}-${i}`} className="flex items-center gap-1 text-xs">
            <span className="w-8 tabular-nums">{r.no}</span>
            <span className="w-20 tabular-nums">{r.date}</span>
            <span className="min-w-0 flex-1 truncate">{r.description}</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove revision ${r.no}`} onClick={() => dispatch({ type: 'remove-revision', index: i })}><Trash2 /></Button>
          </div>
        ))}
        <div className="grid grid-cols-[3rem_5.5rem_1fr_auto] gap-1">
          <Input aria-label="Revision number" placeholder="No." value={rev.no} onChange={(e) => setRev({ ...rev, no: e.target.value })} />
          <Input aria-label="Revision date" placeholder="Date" value={rev.date} onChange={(e) => setRev({ ...rev, date: e.target.value })} />
          <Input aria-label="Revision description" placeholder="Description" value={rev.description} onChange={(e) => setRev({ ...rev, description: e.target.value })} />
          <Button size="sm" variant="outline" disabled={!rev.no.trim() && !rev.description.trim()} onClick={() => { if (dispatch({ type: 'add-revision', revision: rev }).ok) setRev({ no: '', date: '', description: '' }); }}>Add</Button>
        </div>
      </Section>
    </>
  );
}
