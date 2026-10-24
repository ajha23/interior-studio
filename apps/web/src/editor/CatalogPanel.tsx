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
import { TemplatesList } from './TemplatesPanel';
import { patternUrl } from '../materials/patterns';
import { MAX_MODEL_BYTES, useDeleteModel, useModels, useUploadModel, type StudioModel } from '../data/models';
import { canAdmin as roleCanAdmin, canEdit as roleCanEdit, useAuth } from '../auth/AuthProvider';
import type { ConvertReport, UnitChoice } from '../convert/convert';

// Files the picker accepts: models plus the textures and material libraries that travel with them.
const ACCEPT_MODELS = '.glb,.gltf,.bin,.fbx,.obj,.mtl,.dae,.3ds,.stl,.ply,.3mf,.zip,.png,.jpg,.jpeg,.tga,.bmp,.webp';
const UNIT_NAME = { mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches' } as const;

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
  const [cat, setCat] = useState<CatalogCategory | 'all' | 'studio' | 'templates'>('all');
  const { place, targetRoom } = usePlaceFurniture();
  const readOnly = useStudio((s) => s.readOnly);
  const results = cat === 'studio' || cat === 'templates' ? [] : searchCatalog(q, cat);
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
          <button className={`chip ${cat === 'templates' ? 'on' : ''}`} onClick={() => setCat('templates')}>Room templates</button>
        </div>
        {targetRoom && <div className="field-hint">Adds to {targetRoom.info.name}. Select a room first to add elsewhere.</div>}
      </div>
      {cat === 'templates' ? (
        <TemplatesList query={q} />
      ) : cat === 'studio' ? (
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
  const [unit, setUnit] = useState<UnitChoice>('auto');
  const [dragOver, setDragOver] = useState(false);
  const [lastReport, setLastReport] = useState<ConvertReport | null>(null);
  const start = (files: File[]) => {
    setLastReport(null);
    upload.mutate({ files, name, category, unit }, { onSuccess: (r) => {
      setName('');
      setLastReport(r.report);
    } });
  };
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
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as UnitChoice)} aria-label="File units">
            <option value="auto">Units: detect automatically</option>
            <option value="mm">Units: millimetres</option>
            <option value="cm">Units: centimetres</option>
            <option value="m">Units: metres</option>
            <option value="in">Units: inches</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_MODELS}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) start(files);
            }}
          />
          <div
            className={`drop ${dragOver ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length) start(files);
            }}
          >
            <button className="btn primary" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              {upload.isPending ? 'Converting & uploading…' : 'Choose files'}
            </button>
            <span>or drop them here</span>
          </div>
          {upload.error && <div className="field-hint" style={{ color: 'var(--error)' }}>{(upload.error as Error).message}</div>}
          {lastReport && (
            <div className="convert-report">
              <strong>Converted from {lastReport.source.toUpperCase()}</strong>
              <span className="num">
                {lastReport.triangles.toLocaleString()} triangles · {lastReport.meshes} meshes · {lastReport.textures} textures · {UNIT_NAME[lastReport.unit]}
                {lastReport.unitGuessed ? ' (detected)' : ''}
              </span>
              {lastReport.warnings.map((w) => (
                <span key={w} className="warn">{w}</span>
              ))}
            </div>
          )}
          <div className="field-hint">
            GLB, glTF, FBX, OBJ (+MTL), DAE, 3DS, STL, PLY or 3MF — or a .zip with the model and its textures. Converted in your browser to GLB (max {MAX_MODEL_BYTES / 1024 / 1024} MB) and visible only to your studio. SketchUp: export as COLLADA (.dae).
          </div>
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
