import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { envelope, fmtMm, itemSwatch, materialById, migrateScene, SCHEMA_VERSION, type Project } from '@studio/core';
import { fetchSharedDesign, type SharedDesign } from '../data/shares';
import { SCENE_MIGRATIONS } from '../editor/migrations';
import { useStudio } from '../editor/store';
import { useRooms } from '../editor/hooks';
import { PlanView } from '../editor/PlanView';
import { FullPageMessage } from '../ui/FullPageMessage';
import { ClientComments } from './ClientComments';
import '../editor/editor.css';

const PanoViewer = lazy(() => import('../render/PanoViewer').then((m) => ({ default: m.PanoViewer })));
const View3D = lazy(() => import('../editor/View3D').then((m) => ({ default: m.View3D })));

type Tab = '3d' | 'plan' | 'renders';

/** Public, view-only presentation of a design opened from a client share link. */
export default function SharedPage() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const hydrate = useStudio((s) => s.hydrate);
  const [ready, setReady] = useState(false);
  const q = useQuery({ queryKey: ['shared', token], queryFn: () => fetchSharedDesign(token), retry: false, refetchOnWindowFocus: false, staleTime: 30 * 60 * 1000 });

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    if (d.schemaVersion > SCHEMA_VERSION) return;
    const scene = migrateScene<Project>(d.scene, d.schemaVersion, SCENE_MIGRATIONS);
    // Uploaded models resolve through the share's signed URLs instead of the studio's library.
    for (const [id, url] of Object.entries(d.models)) qc.setQueryData(['model-url', id], url);
    hydrate(scene, { versionNo: d.version.no, readOnly: true, saver: null, clientView: true });
    document.title = `${d.project.name} — ${d.studio || 'Interior Studio'}`;
    setReady(true);
  }, [q.data, hydrate, qc]);

  if (q.isLoading) return <FullPageMessage title="Opening design…" />;
  if (q.error) return <FullPageMessage title="Can't open this design" body="Check your connection and try again." />;
  if (!q.data) return <FullPageMessage title="This link isn't available" body="It may have expired or been withdrawn by the studio. Ask your designer for a new link." />;
  if (q.data.schemaVersion > SCHEMA_VERSION) return <FullPageMessage title="Please reload" body="This design was saved by a newer version of the app." />;
  if (!ready) return <FullPageMessage title="Opening design…" />;
  return <Presentation d={q.data} token={token} />;
}

function Presentation({ d, token }: { d: SharedDesign; token: string }) {
  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [{ id: '3d', label: '3D view' }];
    if (d.showPlan) t.push({ id: 'plan', label: 'Floor plan' });
    if (d.renders.length) t.push({ id: 'renders', label: `Renders (${d.renders.length})` });
    return t;
  }, [d]);
  const [tab, setTab] = useState<Tab>(d.renders.length ? 'renders' : '3d');
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % d.renders.length));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + d.renders.length) % d.renders.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, d.renders.length]);

  return (
    <div className="editor-root share-root">
      <header className="share-top">
        <div className="share-title">
          <span className="share-studio">{d.studio || 'Interior Studio'}</span>
          <h1>{d.project.name}</h1>
          <span className="share-sub">
            {d.project.client ? `For ${d.project.client} · ` : ''}
            {d.version.pinned ? `Version ${d.version.no}` : 'Latest design'} · updated {new Date(d.version.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <nav className="share-tabs" aria-label="View">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="share-main">
        {tab === '3d' && (
          <div className="share-canvas">
            <Suspense fallback={<div className="view"><div className="view-label">Loading 3D…</div></div>}>
              <View3D />
            </Suspense>
            <SelectedCard />
          </div>
        )}
        {tab === 'plan' && (
          <div className="share-canvas">
            <PlanView />
            <SelectedCard />
          </div>
        )}
        {tab === 'renders' && (
          <div className="share-renders">
            {d.renders.map((r, i) => (
              <figure key={r.url} onClick={() => setLightbox(i)} className={r.kind === 'panorama' ? 'is-pano' : ''}>
                <img src={r.url} alt={r.caption || `Render ${i + 1}`} loading="lazy" style={{ aspectRatio: r.kind === 'panorama' ? '2 / 1' : `${r.width} / ${r.height}` }} />
                {r.kind === 'panorama' && <span className="pano-badge">360° · tap to look around</span>}
                {r.caption && <figcaption>{r.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        <RoomSummary />
        {d.allowComments && <ClientComments token={token} initial={d.comments ?? []} />}
      </main>
      {lightbox !== null && d.renders[lightbox]?.kind === 'panorama' && (
        <div className="lightbox pano-box" role="dialog" aria-label="360° view">
          <div className="pano-box-head">
            <span>{d.renders[lightbox].caption || '360° view'} — drag to look around</span>
            <button className="btn" onClick={() => setLightbox(null)}>Close</button>
          </div>
          <Suspense fallback={<div className="pano" />}>
            <PanoViewer url={d.renders[lightbox].url} />
          </Suspense>
        </div>
      )}
      {lightbox !== null && d.renders[lightbox] && d.renders[lightbox].kind !== 'panorama' && (
        <div className="lightbox" role="dialog" aria-label="Render" onClick={() => setLightbox(null)}>
          <img src={d.renders[lightbox].url} alt={d.renders[lightbox].caption || 'Render'} />
          {d.renders[lightbox].caption && <p>{d.renders[lightbox].caption}</p>}
        </div>
      )}
      <footer className="share-foot">View-only design shared by {d.studio || 'your designer'}. Drag to look around in 3D; dimensions in millimetres.</footer>
    </div>
  );
}

/** What the client clicked on: name, size and finish — never construction data. */
function SelectedCard() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const f = selection?.kind === 'furniture' ? project.furniture.find((x) => x.id === selection.id) : null;
  if (!f) return <div className="share-hint">Tap a piece to see its size and finish.</div>;
  const e = envelope(f);
  const finish = f.kind === 'library' ? materialById(f.materials.main).name : f.kind === 'wardrobe' || f.kind === 'tvunit' ? materialById(f.materials.shutter).name : null;
  return (
    <div className="share-card">
      <span className="swatch" style={{ background: itemSwatch(f) }} />
      <div>
        <strong>{f.name}</strong>
        <div className="num">{fmtMm(e.widthUm)} W × {fmtMm(e.depthUm)} D × {fmtMm(e.heightUm - e.zMinUm)} H mm</div>
        {finish && <div className="share-finish">{finish}</div>}
      </div>
    </div>
  );
}

function RoomSummary() {
  const rooms = useRooms();
  if (!rooms.length) return null;
  return (
    <section className="share-rooms" aria-label="Rooms">
      {rooms.map((r) => (
        <div key={r.id} className="share-room">
          <strong>{r.info.name}</strong>
          <span className="num">{(r.areaUm2 / 1e12).toFixed(1)} m² · ceiling {fmtMm(r.info.ceilingUm)} mm</span>
          <span className="share-finish">
            {materialById(r.info.floorFinish, 'floor').name} floor · {materialById(r.info.wallColor, 'wall').name} walls
          </span>
        </div>
      ))}
    </section>
  );
}
