import { useEffect, useRef, useState } from 'react';
import { bbox, interiorPoint, toM } from '@studio/core';
import { useDeleteRender, useRenders, useSaveRender, type SavedRender } from '../data/renders';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';
import { liveView } from '../render/live';
import { useStudio } from './store';
import { useRooms } from './hooks';

const PRESETS = [
  { id: 'draft', label: 'Draft', w: 1280, h: 720, spp: 64, hint: 'Quick check · ~20 s' },
  { id: 'hd', label: 'HD', w: 1920, h: 1080, spp: 256, hint: 'Client-ready · 1–3 min' },
  { id: 'qhd', label: '2K', w: 2560, h: 1440, spp: 512, hint: 'Print & presentation · 4–8 min' },
  { id: 'square', label: 'Square', w: 1600, h: 1600, spp: 256, hint: 'Social posts · 1–3 min' },
] as const;

type Job = { stage: 'preparing' | 'tracing'; fraction: number; started: number } | null;

export function RendersPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const renders = useRenders(projectId);
  const save = useSaveRender(projectId);
  const del = useDeleteRender(projectId);
  const readOnly = useStudio((s) => s.readOnly);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const versionNo = useStudio((s) => s.savedVersionNo);
  const rooms = useRooms();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('hd');
  const [mood, setMood] = useState<'day' | 'evening'>('day');
  const [caption, setCaption] = useState('');
  const [job, setJob] = useState<Job>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const has3d = view === 'split' || view === '3d';

  useEffect(() => () => abort.current?.abort(), []);
  // Framing needs the full-width 3D view; the drawer would cover most of the split view.
  useEffect(() => {
    if (useStudio.getState().view !== '3d') setView('3d');
  }, [setView]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const start = async () => {
    const live = liveView.current;
    if (!live) {
      setError('Open the 3D or Split view and frame the shot first.');
      return;
    }
    const p = PRESETS.find((x) => x.id === preset)!;
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
      const blob = await renderPathTraced(live, {
        width: p.w,
        height: p.h,
        samples: p.spp,
        rooms: lights,
        mood,
        signal: ctrl.signal,
        onProgress: (stage, fraction) => setJob((j) => (j ? { ...j, stage, fraction } : j)),
      });
      setPreview(URL.createObjectURL(blob));
      if (!readOnly) await save.mutateAsync({ blob, width: p.w, height: p.h, samples: p.spp, mood, caption: caption.trim(), versionNo });
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

  return (
    <aside className="versions renders" aria-label="Renders">
      <div className="versions-head">
        <strong>Photoreal renders</strong>
        <button className="btn" onClick={onClose} aria-label="Close renders">Close</button>
      </div>
      <div className="render-form">
        {!has3d && (
          <div className="render-note">
            Renders capture the 3D camera. <button className="btn" onClick={() => setView('split')}>Open 3D</button>
          </div>
        )}
        <div className="render-presets" role="radiogroup" aria-label="Quality">
          {PRESETS.map((p) => (
            <button key={p.id} role="radio" aria-checked={preset === p.id} className={`render-preset ${preset === p.id ? 'on' : ''}`} onClick={() => setPreset(p.id)} disabled={Boolean(job)}>
              <strong>{p.label}</strong>
              <span className="num">{p.w}×{p.h}</span>
              <span className="render-hint">{p.hint}</span>
            </button>
          ))}
        </div>
        <div className="chips render-mood" role="radiogroup" aria-label="Lighting">
          <button role="radio" aria-checked={mood === 'day'} className={`chip ${mood === 'day' ? 'on' : ''}`} onClick={() => setMood('day')} disabled={Boolean(job)}>Daylight</button>
          <button role="radio" aria-checked={mood === 'evening'} className={`chip ${mood === 'evening' ? 'on' : ''}`} onClick={() => setMood('evening')} disabled={Boolean(job)}>Evening</button>
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
            {save.isPending ? 'Saving…' : 'Render current 3D view'}
          </button>
        )}
        <p className="render-hint">Frame the shot in the 3D view first. The render uses the same camera, materials and lighting from ceiling panels and the sky through windows. Keep this tab open while it renders.</p>
        {error && <p className="versions-empty err">{error}</p>}
        {preview && readOnly && (
          <a className="btn" href={preview} download="render.png">Download render</a>
        )}
      </div>
      {renders.isLoading && <p className="versions-empty">Loading…</p>}
      {renders.error && <p className="versions-empty err">{errorMessage(renders.error)}</p>}
      {renders.data && renders.data.length === 0 && !preview && <p className="versions-empty">No renders yet.</p>}
      <ul className="render-gallery">
        {renders.data?.map((r) => (
          <RenderCard key={r.id} r={r} canDelete={!readOnly} onDelete={() => confirm('Delete this render? Share links will stop showing it.') && del.mutate(r)} />
        ))}
      </ul>
    </aside>
  );
}

function RenderCard({ r, canDelete, onDelete }: { r: SavedRender; canDelete: boolean; onDelete: () => void }) {
  return (
    <li className="render-card">
      {r.url ? (
        <a href={r.url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={r.url} alt={r.caption || 'Render'} loading="lazy" style={{ aspectRatio: `${r.width} / ${r.height}` }} />
        </a>
      ) : (
        <div className="render-missing">Image unavailable</div>
      )}
      <div className="render-meta">
        <span className="render-caption">{r.caption || `${r.mood === 'evening' ? 'Evening' : 'Daylight'} render`}</span>
        <span className="num">{r.width}×{r.height} · v{r.versionNo} · {relativeTime(r.createdAt)}</span>
      </div>
      <div className="btn-row">
        {r.url && (
          <a className="btn" href={r.url} download>Download</a>
        )}
        {canDelete && <button className="btn danger" onClick={onDelete}>Delete</button>}
      </div>
    </li>
  );
}
