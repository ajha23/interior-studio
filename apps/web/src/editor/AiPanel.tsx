import { useEffect, useRef, useState } from 'react';
import { CATALOG_CATEGORIES, newModelItem, type CatalogCategory } from '@studio/core';
import { AI_COST, aiModelStatus, startAiModel, uploadAiSource, useAiImage, useCredits, type AiImageOp, type AiImageRef } from '../data/ai';
import { useRenders, type SavedRender } from '../data/renders';
import { useUploadModel } from '../data/models';
import { canEdit as roleCanEdit, useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/supabase';
import { STYLES } from './TemplatesPanel';
import { usePlaceFurniture } from './place';
import { useStudio } from './store';

const OPS: { id: AiImageOp; label: string; hint: string }[] = [
  { id: 'enhance', label: 'Photo finish', hint: 'Make a render look like a real photograph, same design' },
  { id: 'restyle', label: 'Restyle', hint: 'Same room, new style: finishes, furniture styling and decor' },
  { id: 'style_transfer', label: 'Match a reference', hint: 'Borrow the look of an inspiration photo' },
  { id: 'clear_room', label: 'Empty the room', hint: 'Remove furniture from a site photo' },
  { id: 'sketch_to_render', label: 'Sketch to render', hint: 'Hand sketch or clay view to a photoreal image' },
  { id: 'edit', label: 'Change one thing', hint: 'e.g. “make the sofa emerald velvet”' },
];

type Source = { kind: 'render'; render: SavedRender } | { kind: 'upload'; path: string; preview: string; name: string } | null;

/** Pick a saved render, or upload a photo/sketch. */
function SourcePicker({ label, value, onChange, renders, orgId }: { label: string; value: Source; onChange: (s: Source) => void; renders: SavedRender[]; orgId: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="ai-source">
      <span className="render-hint">{label}</span>
      <div className="ai-thumbs">
        <button className="ai-thumb upload" onClick={() => file.current?.click()} disabled={busy} title="Upload a photo or sketch">
          {busy ? '…' : '+ Photo'}
        </button>
        {value?.kind === 'upload' && (
          <button className="ai-thumb on" title={value.name}>
            <img src={value.preview} alt="" />
          </button>
        )}
        {renders.filter((r) => r.url && r.kind !== 'panorama').slice(0, 11).map((r) => (
          <button key={r.id} className={`ai-thumb ${value?.kind === 'render' && value.render.id === r.id ? 'on' : ''}`} onClick={() => onChange({ kind: 'render', render: r })} title={r.caption || 'Render'}>
            <img src={r.url!} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setErr(null);
          setBusy(true);
          try {
            const path = await uploadAiSource(orgId, f);
            onChange({ kind: 'upload', path, preview: URL.createObjectURL(f), name: f.name });
          } catch (er) {
            setErr(errorMessage(er));
          } finally {
            setBusy(false);
          }
        }}
      />
      {err && <span className="field-hint" style={{ color: 'var(--error)' }}>{err}</span>}
    </div>
  );
}

const refOf = (s: Source): AiImageRef | undefined => (!s ? undefined : s.kind === 'render' ? { renderId: s.render.id } : { aiPath: s.path });

function ImageTab({ projectId, orgId }: { projectId: string; orgId: string }) {
  const renders = useRenders(projectId);
  const run = useAiImage(projectId);
  const credits = useCredits();
  const [op, setOp] = useState<AiImageOp>('enhance');
  const [source, setSource] = useState<Source>(null);
  const [reference, setReference] = useState<Source>(null);
  const [style, setStyle] = useState(STYLES[0]);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<{ url: string | null; before: string | null } | null>(null);
  const meta = OPS.find((o) => o.id === op)!;
  const needsStyle = op === 'restyle' || op === 'sketch_to_render';
  const short = (credits.data ?? 0) < AI_COST.image;

  // Pick the newest render as the default source.
  useEffect(() => {
    if (!source && renders.data?.length) {
      const first = renders.data.find((r) => r.url && r.kind !== 'panorama');
      if (first) setSource({ kind: 'render', render: first });
    }
  }, [renders.data, source]);

  const go = () => {
    const image = refOf(source);
    if (!image) return;
    const before = source?.kind === 'render' ? source.render.url : source?.kind === 'upload' ? source.preview : null;
    setResult(null);
    run.mutate(
      { op, image, reference: op === 'style_transfer' ? refOf(reference) : undefined, style: needsStyle ? style : undefined, prompt: prompt.trim() || undefined },
      { onSuccess: (r) => setResult({ url: r.url, before }) },
    );
  };

  return (
    <div className="render-form">
      <div className="ai-ops" role="radiogroup" aria-label="What to do">
        {OPS.map((o) => (
          <button key={o.id} role="radio" aria-checked={op === o.id} className={`render-preset ${op === o.id ? 'on' : ''}`} onClick={() => setOp(o.id)} disabled={run.isPending}>
            <strong>{o.label}</strong>
          </button>
        ))}
      </div>
      <p className="render-hint">{meta.hint}</p>
      <SourcePicker label={op === 'clear_room' ? 'Site photo' : op === 'sketch_to_render' ? 'Sketch or clay view' : 'Image to work on'} value={source} onChange={setSource} renders={renders.data ?? []} orgId={orgId} />
      {op === 'style_transfer' && <SourcePicker label="Inspiration image" value={reference} onChange={setReference} renders={renders.data ?? []} orgId={orgId} />}
      {needsStyle && (
        <select className="input" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style">
          {STYLES.map((s) => <option key={s}>{s}</option>)}
        </select>
      )}
      <textarea
        className="input ai-prompt"
        rows={op === 'edit' ? 3 : 2}
        maxLength={800}
        placeholder={op === 'edit' ? 'What should change? e.g. Replace the rug with a jute rug; make the wall behind the bed sage green.' : 'Extra direction (optional), e.g. warm evening light, brass accents'}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button className="btn primary" disabled={run.isPending || !source || (op === 'style_transfer' && !reference) || (op === 'edit' && !prompt.trim()) || short} onClick={go}>
        {run.isPending ? 'Generating… (10–30 s)' : `Generate · ${AI_COST.image} credits`}
      </button>
      {short && <p className="field-hint" style={{ color: 'var(--warn)' }}>Not enough credits. An admin can top up on the Team page.</p>}
      {run.error && <p className="versions-empty err">{errorMessage(run.error)}</p>}
      {result?.url && (
        <div className="ai-result">
          <BeforeAfter before={result.before} after={result.url} />
          <span className="render-hint">Saved to this project’s renders. AI images can change details — check before sending to a client.</span>
        </div>
      )}
    </div>
  );
}

/** Drag the divider to compare the source and the result. */
function BeforeAfter({ before, after }: { before: string | null; after: string }) {
  const [split, setSplit] = useState(50);
  if (!before) return <img className="ai-after" src={after} alt="AI result" />;
  return (
    <div className="ba" onPointerMove={(e) => e.buttons === 1 && setSplit(Math.max(0, Math.min(100, ((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth) * 100)))}>
      <img src={after} alt="After" />
      <img src={before} alt="Before" className="ba-before" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
      <input className="ba-range" type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Compare before and after" />
      <span className="ba-tag l">Before</span>
      <span className="ba-tag r">After</span>
    </div>
  );
}

function ModelTab({ projectId, orgId }: { projectId: string; orgId: string }) {
  const renders = useRenders(projectId);
  const credits = useCredits();
  const upload = useUploadModel();
  const { place } = usePlaceFurniture();
  const readOnly = useStudio((s) => s.readOnly);
  const [mode, setMode] = useState<'photo' | 'text'>('photo');
  const [source, setSource] = useState<Source>(null);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('decor');
  const [sizeMm, setSizeMm] = useState(800);
  const [job, setJob] = useState<{ id: string; stage: string; started: number } | null>(null);
  const [done, setDone] = useState<{ id: string; name: string; widthUm: number; depthUm: number; heightUm: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cost = AI_COST.model + (mode === 'text' ? AI_COST.textModelExtra : 0);
  const short = (credits.data ?? 0) < cost;
  const cancelled = useRef(false);
  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const go = async () => {
    setError(null);
    setDone(null);
    try {
      const n = name.trim() || (mode === 'text' ? prompt.trim().slice(0, 60) : 'AI model');
      const { jobId } = await startAiModel({ orgId, projectId, name: n, category, sizeMm, image: mode === 'photo' ? refOf(source) : undefined, prompt: mode === 'text' ? prompt.trim() : undefined });
      void credits.refetch();
      setJob({ id: jobId, stage: 'queued', started: Date.now() });
      // Generation takes a few minutes; poll every 6 s.
      for (;;) {
        await new Promise((r) => setTimeout(r, 6000));
        if (cancelled.current) return;
        const st = await aiModelStatus(jobId);
        if (st.status === 'running') {
          setJob({ id: jobId, stage: st.stage ?? 'generating', started: Date.now() });
          continue;
        }
        if (st.status === 'failed' || !st.glbUrl) throw new Error(st.error || 'Generation failed. Credits were refunded.');
        setJob({ id: jobId, stage: 'importing', started: Date.now() });
        const blob = await (await fetch(st.glbUrl)).blob();
        const res = await upload.mutateAsync({ files: [new File([blob], `${n}.glb`, { type: 'model/gltf-binary' })], name: n, category, unit: 'auto', fitMaxMm: sizeMm, source: 'ai' });
        setDone({ id: res.id, name: n, ...res.info });
        break;
      }
    } catch (e) {
      setError(errorMessage(e));
      void credits.refetch();
    } finally {
      setJob(null);
    }
  };

  return (
    <div className="render-form">
      <div className="chips" role="radiogroup" aria-label="From">
        <button role="radio" aria-checked={mode === 'photo'} className={`chip ${mode === 'photo' ? 'on' : ''}`} onClick={() => setMode('photo')} disabled={Boolean(job)}>From a photo</button>
        <button role="radio" aria-checked={mode === 'text'} className={`chip ${mode === 'text' ? 'on' : ''}`} onClick={() => setMode('text')} disabled={Boolean(job)}>From a description</button>
      </div>
      {mode === 'photo' ? (
        <SourcePicker label="Photo of one piece, whole object visible, plain background works best" value={source} onChange={setSource} renders={renders.data ?? []} orgId={orgId} />
      ) : (
        <textarea className="input ai-prompt" rows={3} maxLength={600} placeholder="e.g. Carved teak jhoola with brass chains and mustard cushions" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={Boolean(job)} />
      )}
      <input className="input" placeholder="Name in the library" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={Boolean(job)} />
      <div className="tpl-row">
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as CatalogCategory)} aria-label="Category" disabled={Boolean(job)}>
          {CATALOG_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <label className="ai-size">
          <span>Largest side</span>
          <input className="input" type="number" min={50} max={6000} step={10} value={sizeMm} onChange={(e) => setSizeMm(Number(e.target.value))} disabled={Boolean(job)} />
          <span>mm</span>
        </label>
      </div>
      <button className="btn primary" disabled={Boolean(job) || short || (mode === 'photo' ? !source : !prompt.trim())} onClick={() => void go()}>
        {job ? 'Working…' : `Generate 3D model · ${cost} credits`}
      </button>
      {job && (
        <div className="render-progress" aria-live="polite">
          <div className="bar indeterminate"><span /></div>
          <div className="render-status">
            <span>{job.stage === 'queued' ? 'Waiting in the queue…' : job.stage === 'importing' ? 'Adding to the studio library…' : 'Sculpting and texturing (2–5 min)…'}</span>
          </div>
          <span className="render-hint">You can keep designing; leave this panel open.</span>
        </div>
      )}
      {short && <p className="field-hint" style={{ color: 'var(--warn)' }}>Not enough credits. An admin can top up on the Team page.</p>}
      {error && <p className="versions-empty err">{error}</p>}
      {done && (
        <div className="ai-result">
          <strong>{done.name} added to Studio models</strong>
          <span className="render-hint">AI models are approximate: check proportions and adjust the size after placing.</span>
          {!readOnly && (
            <button className="btn" onClick={() => place(newModelItem({ id: done.id, name: done.name, widthUm: done.widthUm, depthUm: done.depthUm, heightUm: done.heightUm }, 0, 0))}>
              Place in the design
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AiPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { activeOrg } = useAuth();
  const credits = useCredits();
  const [tab, setTab] = useState<'image' | 'model'>('image');
  const canEdit = roleCanEdit(activeOrg?.role);
  return (
    <aside className="versions ai" aria-label="AI studio">
      <div className="versions-head">
        <strong>AI studio</strong>
        <span className="ai-credits num" title="Studio credits this month">{credits.data ?? '…'} credits</span>
        <button className="btn" onClick={onClose} aria-label="Close AI studio">Close</button>
      </div>
      <div className="left-tabs ai-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'image'} className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}>Images</button>
        <button role="tab" aria-selected={tab === 'model'} className={tab === 'model' ? 'on' : ''} onClick={() => setTab('model')}>3D models</button>
      </div>
      {!canEdit || !activeOrg ? (
        <p className="versions-empty">Designer access is needed for AI tools.</p>
      ) : tab === 'image' ? (
        <ImageTab projectId={projectId} orgId={activeOrg.orgId} />
      ) : (
        <ModelTab projectId={projectId} orgId={activeOrg.orgId} />
      )}
    </aside>
  );
}
