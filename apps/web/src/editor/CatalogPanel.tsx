import { useMemo, useRef, useState } from 'react';
import {
  CATALOG_CATEGORIES,
  catalogById,
  fmtMm,
  libraryPrims,
  materialsIn,
  mm,
  newLibraryItem,
  newModelItem,
  searchCatalog,
  type CatalogCategory,
  type CatalogDef,
  type MaterialCategory,
} from '@studio/core';
import { useStudio } from './store';
import { usePlaceFurniture } from './place';
import { patternUrl } from '../materials/patterns';
import { MAX_MODEL_BYTES, useDeleteModel, useModels, useUploadModel, type StudioModel } from '../data/models';
import { canAdmin as roleCanAdmin, canEdit as roleCanEdit, useAuth } from '../auth/AuthProvider';

/** Isometric line drawing of a catalogue piece at its default size, front-right view. */
function IsoThumb({ def }: { def: CatalogDef }) {
  const faces = useMemo(() => {
    const item = newLibraryItem(def, 0, 0);
    const prims = libraryPrims(item).sort((a, b) => a.x + a.w + a.y + a.d - (b.x + b.w + b.y + b.d) || a.z - b.z);
    const c = Math.cos(Math.PI / 6);
    const s = 0.5;
    const P = (x: number, y: number, z: number) => [(x - y) * c, (x + y) * s - z] as const;
    const out: { d: string; fill: string; key: string }[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const poly = (pts: (readonly [number, number])[]) => {
      for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return `M${pts.map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join('L')}Z`;
    };
    for (const p of prims) {
      const x0 = p.x;
      const x1 = p.x + p.w;
      const y0 = p.y;
      const y1 = p.y + p.d;
      const z0 = p.z;
      const z1 = z0 + p.h;
      const col = p.material.color;
      out.push({ key: `${p.key}t`, fill: col, d: poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]) });
      out.push({ key: `${p.key}f`, fill: `color-mix(in srgb, ${col} 82%, #000)`, d: poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]) });
      out.push({ key: `${p.key}r`, fill: `color-mix(in srgb, ${col} 68%, #000)`, d: poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]) });
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
    return { out, vb: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}` };
  }, [def]);
  return (
    <svg viewBox={faces.vb} className="iso" aria-hidden>
      {faces.out.map((f) => (
        <path key={f.key} d={f.d} fill={f.fill} stroke="rgba(30,34,32,.45)" strokeWidth={mm(6)} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function FurnitureTab() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CatalogCategory | 'all' | 'studio'>('all');
  const { place, targetRoom } = usePlaceFurniture();
  const readOnly = useStudio((s) => s.readOnly);
  const results = cat === 'studio' ? [] : searchCatalog(q, cat);
  // Ceiling pieces hang from the ceiling of the room they go into.
  const addable = (d: CatalogDef) => {
    const item = newLibraryItem(d, 0, 0);
    if (d.mount === 'ceiling' && targetRoom) item.params = { ...item.params, elevationUm: Math.max(0, targetRoom.info.ceilingUm - item.params.heightUm) };
    return item;
  };
  return (
    <>
      <div className="section">
        <input className="input" type="search" placeholder="Search sofa, pooja, fan…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalogue" />
        <div className="chips">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
          {CATALOG_CATEGORIES.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
          <button className={`chip ${cat === 'studio' ? 'on' : ''}`} onClick={() => setCat('studio')}>Studio models</button>
        </div>
        {targetRoom && <div className="field-hint">Adds to {targetRoom.info.name}. Select a room first to add elsewhere.</div>}
      </div>
      {cat === 'studio' ? (
        <StudioModels query={q} />
      ) : (
        <div className="section">
          {results.length === 0 && <div className="field-hint">Nothing matches “{q}”.</div>}
          <div className="cat-grid">
            {results.map((d) => (
              <button key={d.id} className="cat-card" disabled={readOnly} onClick={() => place(addable(d), { againstWall: d.mount === 'wall' })} title={`${d.name} · ${d.size.w} × ${d.size.d} × ${d.size.h} mm`}>
                <IsoThumb def={d} />
                <span className="cat-name">{d.name}</span>
                <span className="cat-size num">{d.size.w}×{d.size.d}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StudioModels({ query }: { query: string }) {
  const { activeOrg } = useAuth();
  const canEdit = roleCanEdit(activeOrg?.role);
  const canAdmin = roleCanAdmin(activeOrg?.role);
  const models = useModels();
  const upload = useUploadModel();
  const del = useDeleteModel();
  const { place } = usePlaceFurniture();
  const readOnly = useStudio((s) => s.readOnly);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('decor');
  const list = (models.data ?? []).filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
  const add = (m: StudioModel) => place(newModelItem(m, 0, 0));
  return (
    <>
      {canEdit && (
        <div className="section">
          <h3>Upload a model</h3>
          <input className="input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as CatalogCategory)} aria-label="Category">
            {CATALOG_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".glb,model/gltf-binary"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload.mutate({ file, name, category }, { onSuccess: () => setName('') });
            }}
          />
          <button className="btn primary" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            {upload.isPending ? 'Uploading…' : 'Choose .glb file'}
          </button>
          {upload.error && <div className="field-hint" style={{ color: 'var(--error)' }}>{(upload.error as Error).message}</div>}
          <div className="field-hint">Binary glTF up to {MAX_MODEL_BYTES / 1024 / 1024} MB, in metres. Visible only to your studio. Export from SketchUp, Blender or 3ds Max as .glb.</div>
        </div>
      )}
      <div className="section">
        {models.isLoading && <div className="field-hint">Loading…</div>}
        {models.error && <div className="field-hint" style={{ color: 'var(--error)' }}>Couldn't load models: {(models.error as Error).message}</div>}
        {models.data && list.length === 0 && <div className="field-hint">No studio models yet.</div>}
        <div className="cat-grid">
          {list.map((m) => (
            <div key={m.id} className="cat-card-wrap">
              <button className="cat-card" disabled={readOnly} onClick={() => add(m)} title={`${m.name} · ${fmtMm(m.widthUm)} × ${fmtMm(m.depthUm)} × ${fmtMm(m.heightUm)} mm`}>
                {m.thumbUrl ? <img src={m.thumbUrl} alt="" className="iso" /> : <span className="iso placeholder">3D</span>}
                <span className="cat-name">{m.name}</span>
                <span className="cat-size num">{fmtMm(m.widthUm)}×{fmtMm(m.depthUm)}</span>
              </button>
              {canAdmin && (
                <button className="cat-del" title="Delete from studio library" onClick={() => del.mutate(m)} aria-label={`Delete ${m.name}`}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const MAT_TABS: { id: MaterialCategory; label: string }[] = [
  { id: 'floor', label: 'Floors' },
  { id: 'wall', label: 'Walls' },
  { id: 'surface', label: 'Furniture' },
];

function MaterialsTab() {
  const [cat, setCat] = useState<MaterialCategory>('floor');
  const paint = useStudio((s) => s.paint);
  const tool = useStudio((s) => s.tool);
  const setPaint = useStudio((s) => s.setPaint);
  const setTool = useStudio((s) => s.setTool);
  const readOnly = useStudio((s) => s.readOnly);
  return (
    <>
      <div className="section">
        <div className="chips">
          {MAT_TABS.map((t) => (
            <button key={t.id} className={`chip ${cat === t.id ? 'on' : ''}`} onClick={() => setCat(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="field-hint">
          {readOnly ? 'View-only access.' : tool === 'paint' ? 'Painting: click a floor, a wall face or a piece in the plan or 3D. Alt-click a piece for its second finish. Esc stops.' : 'Pick a material to start painting.'}
        </div>
        {tool === 'paint' && (
          <button className="btn" onClick={() => setTool('select')}>Stop painting</button>
        )}
      </div>
      <div className="section">
        <div className="mat-grid">
          {materialsIn(cat).map((m) => (
            <button key={m.id} className={`mat ${tool === 'paint' && paint === m.id ? 'on' : ''}`} disabled={readOnly} onClick={() => setPaint(m.id)} title={m.name}>
              <span className="mat-swatch" style={m.pattern === 'plain' ? { background: m.color } : { backgroundImage: `url(${patternUrl(m.id)})`, backgroundSize: 'cover' }} />
              <span className="mat-name">{m.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export type LeftTab = 'plan' | 'catalogue' | 'materials';

export function CatalogPanel({ tab }: { tab: Exclude<LeftTab, 'plan'> }) {
  return tab === 'catalogue' ? <FurnitureTab /> : <MaterialsTab />;
}

/** Name of a catalogue piece's source, for the properties panel. */
export function catalogName(ref: string): string {
  return catalogById(ref)?.name ?? 'Removed catalogue piece';
}
