import { useEffect, useRef, useState } from 'react';
import { CATALOG_CATEGORIES, newModelItem, resizeRecipe, sanitizeRecipe, type CatalogCategory, type Recipe } from '@studio/core';
import { AI_COST, designAiModel, refineAiModel, uploadAiSource, useAiImage, useCredits, type AiImageOp, type AiImageRef } from '../data/ai';
import { useRenders, type SavedRender } from '../data/renders';
import { useUploadModel } from '../data/models';
import { canEdit as roleCanEdit, useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/supabase';
import { STYLES } from './TemplatesPanel';
import { usePlaceFurniture } from './place';
import { RecipePreview } from '../recipe/RecipePreview';
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

type Dims = { w: number; d: number; h: number };
const CATEGORY_IDS = new Set(CATALOG_CATEGORIES.map((c) => c.id as string));

/** Sanitise a model answer and make its stated size match what it actually builds. */
async function toRecipe(raw: unknown): Promise<Recipe> {
  const r = sanitizeRecipe(raw);
  const { measureRecipe } = await import('../recipe/build');
  const built = measureRecipe(r);
  return { ...r, size: { w: Math.max(1, built.w), d: Math.max(1, built.d), h: Math.max(1, built.h) } };
}

function DimInput({ label, value, onChange, disabled, placeholder }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <label className="ai-size">
      <span>{label}</span>
      <input className="input" type="number" min={20} max={8000} step={10} value={value ? Math.round(value) : ''} placeholder={placeholder} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} aria-label={`${label} mm`} />
    </label>
  );
}

function ModelTab({ projectId, orgId }: { projectId: string; orgId: string }) {
  const renders = useRenders(projectId);
  const credits = useCredits();
  const upload = useUploadModel();
  const { place } = usePlaceFurniture();
  const readOnly = useStudio((s) => s.readOnly);
  const [mode, setMode] = useState<'photo' | 'text'>('text');
  const [source, setSource] = useState<Source>(null);
  const [prompt, setPrompt] = useState('');
  const [hint, setHint] = useState<Dims>({ w: 0, d: 0, h: 0 });
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [history, setHistory] = useState<Recipe[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('decor');
  const [lockRatio, setLockRatio] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<null | 'design' | 'refine' | 'save'>(null);
  const [done, setDone] = useState<{ id: string; name: string; widthUm: number; depthUm: number; heightUm: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const short = (credits.data ?? 0) < AI_COST.model;
  const sizeHint = hint.w || hint.d || hint.h ? hint : undefined;

  const accept = async (raw: unknown, first: boolean) => {
    const r = await toRecipe(raw);
    if (recipe) setHistory((h) => [...h.slice(-9), recipe]);
    setRecipe(r);
    if (first || !name.trim()) setName(r.name);
    if (first && CATEGORY_IDS.has(r.category)) setCategory(r.category as CatalogCategory);
  };

  const run = async (kind: 'design' | 'refine') => {
    setError(null);
    setDone(null);
    setBusy(kind);
    try {
      if (kind === 'design') {
        const res = await designAiModel({ orgId, projectId, image: mode === 'photo' ? refOf(source) : undefined, prompt: prompt.trim() || undefined, sizeHint });
        setHistory([]);
        await accept(res.recipe, true);
      } else if (recipe) {
        const res = await refineAiModel({ orgId, projectId, recipe, instruction: instruction.trim() });
        await accept(res.recipe, false);
        setInstruction('');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      void credits.refetch();
    }
  };

  const resize = (key: keyof Dims, v: number) => {
    if (!recipe || !Number.isFinite(v) || v < 20 || v > 8000) return;
    const k = v / recipe.size[key];
    const size = lockRatio ? { w: recipe.size.w * k, d: recipe.size.d * k, h: recipe.size.h * k } : { ...recipe.size, [key]: v };
    setRecipe(resizeRecipe(recipe, size));
  };

  const save = async () => {
    if (!recipe) return;
    setError(null);
    setBusy('save');
    try {
      const { recipeToGlb } = await import('../recipe/build');
      const n = name.trim() || recipe.name;
      const glb = await recipeToGlb(recipe);
      const res = await upload.mutateAsync({ files: [new File([glb], `${n}.glb`, { type: 'model/gltf-binary' })], name: n, category, unit: 'auto', source: 'ai', recipe: { ...recipe, name: n, category } });
      setDone({ id: res.id, name: n, ...res.info });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const canDesign = mode === 'photo' ? Boolean(source) : Boolean(prompt.trim());
  return (
    <div className="render-form">
      <div className="chips" role="radiogroup" aria-label="From">
        <button role="radio" aria-checked={mode === 'text'} className={`chip ${mode === 'text' ? 'on' : ''}`} onClick={() => setMode('text')} disabled={Boolean(busy)}>From a description</button>
        <button role="radio" aria-checked={mode === 'photo'} className={`chip ${mode === 'photo' ? 'on' : ''}`} onClick={() => setMode('photo')} disabled={Boolean(busy)}>From a photo</button>
      </div>
      {mode === 'photo' && <SourcePicker label="Photo of the piece — the whole object visible works best" value={source} onChange={setSource} renders={renders.data ?? []} orgId={orgId} />}
      <textarea
        className="input ai-prompt"
        rows={mode === 'text' ? 3 : 2}
        maxLength={800}
        placeholder={mode === 'text' ? 'e.g. Teak bench with cane seat, tapered legs, 1200 wide' : 'Notes (optional), e.g. the legs are brass, seat is mustard velvet'}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={Boolean(busy)}
      />
      <div className="tpl-row ai-dims" aria-label="Target size (optional)">
        <DimInput label="W" value={hint.w} placeholder="auto" onChange={(w) => setHint({ ...hint, w })} disabled={Boolean(busy)} />
        <DimInput label="D" value={hint.d} placeholder="auto" onChange={(d) => setHint({ ...hint, d })} disabled={Boolean(busy)} />
        <DimInput label="H" value={hint.h} placeholder="auto" onChange={(h) => setHint({ ...hint, h })} disabled={Boolean(busy)} />
        <span className="render-hint">mm, optional</span>
      </div>
      <button className="btn primary" disabled={Boolean(busy) || short || !canDesign} onClick={() => void run('design')}>
        {busy === 'design' ? 'Designing… (10–40 s)' : `${recipe ? 'Start over' : 'Design 3D model'} · ${AI_COST.model} credits`}
      </button>
      {short && <p className="field-hint" style={{ color: 'var(--warn)' }}>Not enough credits. An admin can top up on the Team page.</p>}
      {error && <p className="versions-empty err">{error}</p>}

      {recipe && (
        <div className="ai-result recipe-result">
          <RecipePreview recipe={recipe} />
          {recipe.notes && <span className="render-hint">{recipe.notes}</span>}
          <div className="tpl-row ai-dims" aria-label="Size">
            <DimInput label="W" value={recipe.size.w} onChange={(v) => resize('w', v)} disabled={Boolean(busy)} />
            <DimInput label="D" value={recipe.size.d} onChange={(v) => resize('d', v)} disabled={Boolean(busy)} />
            <DimInput label="H" value={recipe.size.h} onChange={(v) => resize('h', v)} disabled={Boolean(busy)} />
            <label className="ai-lock" title="Scale all sides together">
              <input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} /> <span>Keep proportions</span>
            </label>
          </div>
          <div className="ai-refine">
            <input
              className="input"
              placeholder="Change something, e.g. make the legs brass and 50 mm taller"
              value={instruction}
              maxLength={800}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && instruction.trim() && !busy && !short && void run('refine')}
              disabled={Boolean(busy)}
            />
            <button className="btn" disabled={Boolean(busy) || short || !instruction.trim()} onClick={() => void run('refine')}>
              {busy === 'refine' ? 'Changing…' : `Refine · ${AI_COST.model}`}
            </button>
            {history.length > 0 && (
              <button className="btn" disabled={Boolean(busy)} onClick={() => { setRecipe(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); }} title="Back to the previous version">
                Undo
              </button>
            )}
          </div>
          <input className="input" placeholder="Name in the library" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={Boolean(busy)} />
          <div className="tpl-row">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as CatalogCategory)} aria-label="Category" disabled={Boolean(busy)}>
              {CATALOG_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button className="btn primary" disabled={Boolean(busy)} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : 'Save to Studio models'}
            </button>
          </div>
          <span className="render-hint">Resizing, undo and saving are free; only Design and Refine use credits.</span>
        </div>
      )}
      {done && (
        <div className="ai-result">
          <strong>{done.name} added to Studio models</strong>
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
