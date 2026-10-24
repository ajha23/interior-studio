import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { bbox, interiorPoint, lightingOf, LIGHTING_PRESETS, toM, type LightingPreset } from '@studio/core';
import { useDeleteRender, useRenders, useSaveRender, type SavedRender } from '../data/renders';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';
import { liveView } from '../render/live';
import { useStudio } from './store';
import { useRooms } from './hooks';
import { planBounds } from './PlanView';

const PanoViewer = lazy(() => import('../render/PanoViewer').then((m) => ({ default: m.PanoViewer })));

const STILLS = [
  { id: 'draft', label: 'Draft', w: 1280, h: 720, spp: 64, hint: 'Quick check · ~20 s' },
  { id: 'hd', label: 'HD', w: 1920, h: 1080, spp: 256, hint: 'Client-ready · 1–3 min' },
  { id: 'qhd', label: '2K', w: 2560, h: 1440, spp: 512, hint: 'Presentation · 4–8 min' },
  { id: 'uhd', label: '4K', w: 3840, h: 2160, spp: 512, hint: 'Print · 8–15 min' },
  { id: 'square', label: 'Square', w: 1600, h: 1600, spp: 256, hint: 'Social posts · 1–3 min' },
] as const;
const PANOS = [
  { id: 'pano', label: '360° Standard', w: 4096, h: 2048, spp: 192, hint: 'Phones & share links · 4–8 min' },
  { id: 'pano-hi', label: '360° High', w: 6144, h: 3072, spp: 256, hint: 'Large screens & VR · 10–20 min' },
] as const;
const PRESET_ORDER: LightingPreset[] = ['daylight', 'golden', 'overcast', 'evening', 'night'];

type Job = { stage: 'preparing' | 'tracing'; fraction: number; started: number } | null;

export function RendersPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const renders = useRenders(projectId);
  const save = useSaveRender(projectId);
  const del = useDeleteRender(projectId);
  const readOnly = useStudio((s) => s.readOnly);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const versionNo = useStudio((s) => s.savedVersionNo);
  const project = useStudio((s) => s.project);
  const dispatch = useStudio((s) => s.dispatch);
  const selection = useStudio((s) => s.selection);
  const lighting = lightingOf(project);
  const rooms = useRooms();
  const [mode, setMode] = useState<'still' | 'panorama'>('still');
  const [still, setStill] = useState<(typeof STILLS)[number]['id']>('hd');
  const [pano, setPano] = useState<(typeof PANOS)[number]['id']>('pano');
  const [panoRoom, setPanoRoom] = useState<string>('');
  const [eyeMm, setEyeMm] = useState(1500);
  const [caption, setCaption] = useState('');
  const [job, setJob] = useState<Job>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'still' | 'panorama' } | null>(null);
  const [viewing, setViewing] = useState<SavedRender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const has3d = view === 'split' || view === '3d';

  useEffect(() => () => abort.current?.abort(), []);
  // Framing needs the full-width 3D view; the drawer would cover most of the split view.
  useEffect(() => {
    if (useStudio.getState().view !== '3d') setView('3d');
  }, [setView]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);
  // Default the panorama to the selected room, else the largest.
  useEffect(() => {
    const sel = selection?.kind === 'room' ? selection.id : null;
    if (sel && rooms.some((r) => r.id === sel)) setPanoRoom(sel);
    else if (!panoRoom || !rooms.some((r) => r.id === panoRoom)) setPanoRoom(rooms[0]?.id ?? '');
  }, [selection, rooms, panoRoom]);

  const setPreset = (p: LightingPreset) => {
    if (!readOnly) dispatch({ type: 'lighting.update', patch: { preset: p } }, `Lighting: ${LIGHTING_PRESETS[p].label}`);
  };

  const start = async () => {
    const live = liveView.current;
    if (!live) {
      setError('Open the 3D view and frame the shot first.');
      return;
    }
    const p = mode === 'still' ? STILLS.find((x) => x.id === still)! : PANOS.find((x) => x.id === pano)!;
    const room = rooms.find((r) => r.id === panoRoom);
    if (mode === 'panorama' && !room) {
      setError('Draw a room first: panoramas are taken from inside a room.');
      return;
    }
    setError(null);
    setPreview(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setJob({ stage: 'preparing', fraction: 0, started: performance.now() });
    try {
      const { renderPathTraced } = await import('../render/pathtrace');
      const lights = rooms.map((r) => {
        const c = interiorPoint(r.interior);
        const b = bbox(r.interior);
        return { x: toM(c.x), z: toM(c.y), ceiling: toM(r.info.ceilingUm), w: toM(b.maxX - b.minX), d: toM(b.maxY - b.minY) };
      });
      const pb = planBounds(project.plan);
      const eye = room ? interiorPoint(room.interior) : null;
      const big = p.w * p.h > 4_000_000;
      const blob = await renderPathTraced(live, {
        width: p.w,
        height: p.h,
        samples: p.spp,
        rooms: lights,
        lighting,
        centre: { x: toM((pb.minX + pb.maxX) / 2), z: toM((pb.minY + pb.maxY) / 2) },
        panorama: mode === 'panorama' && eye ? { x: toM(eye.x), y: eyeMm / 1000, z: toM(eye.y) } : undefined,
        format: big || mode === 'panorama' ? 'jpeg' : 'png',
        ceilings: mode === 'panorama' ? rooms.map((r) => ({ poly: r.interior.map((v) => ({ x: toM(v.x), z: toM(v.y) })), height: toM(r.info.ceilingUm) })) : undefined,
        signal: ctrl.signal,
        onProgress: (stage, fraction) => setJob((j) => (j ? { ...j, stage, fraction } : j)),
      });
      setPreview({ url: URL.createObjectURL(blob), kind: mode });
      if (!readOnly) {
        const defaultCaption = mode === 'panorama' && room ? `${room.info.name} — 360°` : '';
        await save.mutateAsync({ blob, width: p.w, height: p.h, samples: p.spp, mood: lighting.preset, kind: mode, caption: caption.trim() || defaultCaption, versionNo });
      }
      setCaption('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`Render failed: ${errorMessage(e)}. Your browser may not support GPU path tracing (WebGL 2 with float textures).`);
    } finally {
      setJob(null);
      abort.current = null;
    }
  };

  const elapsed = job ? Math.round((performance.now() - job.started) / 1000) : 0;
  const eta = job && job.stage === 'tracing' && job.fraction > 0.03 ? Math.round((elapsed / job.fraction) * (1 - job.fraction)) : null;
  const presets = mode === 'still' ? STILLS : PANOS;
  const chosen = mode === 'still' ? still : pano;

  return (
    <aside className="versions renders" aria-label="Renders">
      <div className="versions-head">
        <strong>Photoreal renders</strong>
        <button className="btn" onClick={onClose} aria-label="Close renders">Close</button>
      </div>
      <div className="render-form">
        {!has3d && (
          <div className="render-note">
            Renders capture the 3D camera. <button className="btn" onClick={() => setView('3d')}>Open 3D</button>
          </div>
        )}
        <div className="chips" role="radiogroup" aria-label="Render type">
          <button role="radio" aria-checked={mode === 'still'} className={`chip ${mode === 'still' ? 'on' : ''}`} onClick={() => setMode('still')} disabled={Boolean(job)}>Still image</button>
          <button role="radio" aria-checked={mode === 'panorama'} className={`chip ${mode === 'panorama' ? 'on' : ''}`} onClick={() => setMode('panorama')} disabled={Boolean(job)}>360° panorama</button>
        </div>
        <div className="render-presets" role="radiogroup" aria-label="Quality">
          {presets.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={chosen === p.id}
              className={`render-preset ${chosen === p.id ? 'on' : ''}`}
              onClick={() => (mode === 'still' ? setStill(p.id as (typeof STILLS)[number]['id']) : setPano(p.id as (typeof PANOS)[number]['id']))}
              disabled={Boolean(job)}
            >
              <strong>{p.label}</strong>
              <span className="num">{p.w}×{p.h}</span>
              <span className="render-hint">{p.hint}</span>
            </button>
          ))}
        </div>
        {mode === 'panorama' && (
          <div className="tpl-row">
            <select className="input" value={panoRoom} onChange={(e) => setPanoRoom(e.target.value)} aria-label="Room" disabled={Boolean(job)}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.info.name}</option>)}
            </select>
            <select className="input" value={eyeMm} onChange={(e) => setEyeMm(Number(e.target.value))} aria-label="Eye height" disabled={Boolean(job)}>
              <option value={1100}>Seated · 1100 mm</option>
              <option value={1500}>Standing · 1500 mm</option>
              <option value={1700}>Tall · 1700 mm</option>
            </select>
          </div>
        )}
        <div className="render-lighting">
          <span className="render-hint">Lighting {readOnly ? '' : '(also changes the 3D view)'}</span>
          <div className="chips" role="radiogroup" aria-label="Lighting">
            {PRESET_ORDER.map((p) => (
              <button key={p} role="radio" aria-checked={lighting.preset === p} className={`chip ${lighting.preset === p ? 'on' : ''}`} onClick={() => setPreset(p)} disabled={Boolean(job) || readOnly}>
                {LIGHTING_PRESETS[p].label}
              </button>
            ))}
          </div>
        </div>
        {!readOnly && <input className="input" placeholder="Caption (optional), e.g. Living room — option B" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} disabled={Boolean(job)} />}
        {job ? (
          <div className="render-progress" aria-live="polite">
            <div className="bar"><span style={{ width: `${Math.round((job.stage === 'preparing' ? job.fraction * 0.1 : 0.1 + job.fraction * 0.9) * 100)}%` }} /></div>
            <div className="render-status">
              <span>{job.stage === 'preparing' ? 'Preparing scene…' : `Tracing light · ${Math.round(job.fraction * 100)}%`}</span>
              <span className="num">{elapsed}s{eta !== null ? ` · ~${eta}s left` : ''}</span>
            </div>
            <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => void start()} disabled={!has3d || save.isPending}>
            {save.isPending ? 'Saving…' : mode === 'still' ? 'Render current 3D view' : 'Render 360° panorama'}
          </button>
        )}
        <p className="render-hint">
          {mode === 'still'
            ? 'Frame the shot in the 3D view first; the render uses the same camera. Keep this tab open while it renders.'
            : 'Taken from the centre of the room at eye height, looking all around. Clients can drag to look around on the share link.'}
        </p>
        {error && <p className="versions-empty err">{error}</p>}
        {preview && readOnly && (
          <a className="btn" href={preview.url} download={preview.kind === 'panorama' ? 'panorama.jpg' : 'render.png'}>Download render</a>
        )}
      </div>
      {renders.isLoading && <p className="versions-empty">Loading…</p>}
      {renders.error && <p className="versions-empty err">{errorMessage(renders.error)}</p>}
      {renders.data && renders.data.length === 0 && !preview && <p className="versions-empty">No renders yet.</p>}
      <ul className="render-gallery">
        {renders.data?.map((r) => (
          <RenderCard key={r.id} r={r} onOpen={() => setViewing(r)} canDelete={!readOnly} onDelete={() => confirm('Delete this render? Share links will stop showing it.') && del.mutate(r)} />
        ))}
      </ul>
      {viewing?.url && viewing.kind === 'panorama' && (
        <div className="pano-modal" role="dialog" aria-label="360° panorama">
          <div className="pano-modal-head">
            <strong>{viewing.caption || '360° panorama'}</strong>
            <button className="btn" onClick={() => setViewing(null)}>Close</button>
          </div>
          <Suspense fallback={<div className="pano" />}>
            <PanoViewer url={viewing.url} />
          </Suspense>
        </div>
      )}
    </aside>
  );
}

function RenderCard({ r, canDelete, onDelete, onOpen }: { r: SavedRender; canDelete: boolean; onDelete: () => void; onOpen: () => void }) {
  const pano = r.kind === 'panorama';
  return (
    <li className="render-card">
      {r.url ? (
        pano ? (
          <button className="render-thumb" onClick={onOpen} title="Look around">
            <img src={r.url} alt={r.caption || '360° panorama'} loading="lazy" style={{ aspectRatio: '2 / 1' }} />
            <span className="pano-badge">360°</span>
          </button>
        ) : (
          <a href={r.url} target="_blank" rel="noreferrer" title="Open full size">
            <img src={r.url} alt={r.caption || 'Render'} loading="lazy" style={{ aspectRatio: `${r.width} / ${r.height}` }} />
          </a>
        )
      ) : (
        <div className="render-missing">Image unavailable</div>
      )}
      <div className="render-meta">
        <span className="render-caption">{r.caption || `${LIGHTING_PRESETS[r.mood].label} ${pano ? 'panorama' : 'render'}`}</span>
        <span className="num">{r.width}×{r.height} · {LIGHTING_PRESETS[r.mood].label} · v{r.versionNo} · {relativeTime(r.createdAt)}</span>
      </div>
      <div className="btn-row">
        {r.url && <a className="btn" href={r.url} download>Download</a>}
        {canDelete && <button className="btn danger" onClick={onDelete}>Delete</button>}
      </div>
    </li>
  );
}
