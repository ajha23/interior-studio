import { useMemo } from 'react';
import { envelope, fmtMm, itemSwatch, newDecor, newTvUnit, newWardrobe, wallIndexLabel, type DecorKind } from '@studio/core';
import { useStudio, type Tool } from './store';
import { severityById, useRooms, useValidation } from './hooks';
import { usePlaceFurniture } from './place';

const DECOR: { kind: DecorKind; label: string }[] = [
  { kind: 'bed', label: 'Bed' },
  { kind: 'sofa', label: 'Sofa' },
  { kind: 'table', label: 'Table' },
  { kind: 'side-table', label: 'Side table' },
  { kind: 'box', label: 'Box / block' },
];

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d={d} />
  </svg>
);

const DRAW: { t: Tool; label: string; icon: string }[] = [
  { t: 'wall', label: 'Wall', icon: 'M2 8h12' },
  { t: 'room', label: 'Room', icon: 'M2 2h12v12H2z' },
  { t: 'door', label: 'Door', icon: 'M3 14V2h7v12M3 14h10' },
  { t: 'window', label: 'Window', icon: 'M2 4h12v8H2zM8 4v8' },
];

export function Sidebar() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const readOnly = useStudio((s) => s.readOnly);
  const rooms = useRooms();
  const results = useValidation();
  const sev = useMemo(() => severityById(results), [results]);
  const plan = project.plan;

  const { place: addFurniture, targetRoom } = usePlaceFurniture();

  return (
    <>
      <div className="section">
        <h3>
          Rooms <span className="num" style={{ fontWeight: 400 }}>{rooms.length}</span>
        </h3>
        {rooms.length === 0 && <div className="field-hint">No closed room yet. Draw a room, or draw walls until they close.</div>}
        <ul className="obj-list">
          {rooms.map((r) => (
            <li key={r.id} className={`obj ${selection?.kind === 'room' && selection.id === r.id ? 'sel' : ''}`} onClick={() => select({ kind: 'room', id: r.id })}>
              <span className={`dot ${sev.get(r.id) ?? ''}`} />
              <Icon d="M2 2h12v12H2z" />
              <span>{r.info.name}</span>
              <span className="meta num">{(r.areaUm2 / 1e12).toFixed(1)} m²</span>
            </li>
          ))}
        </ul>
      </div>
      {!readOnly && (
        <div className="section">
          <h3>Draw</h3>
          <div className="add-grid">
            {DRAW.map((d) => (
              <button key={d.t} className={`add-btn ${tool === d.t ? 'on' : ''}`} aria-pressed={tool === d.t} onClick={() => setTool(tool === d.t ? 'select' : d.t)}>
                <Icon d={d.icon} /> {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="section">
        <h3>Custom furniture{targetRoom ? <span className="num" style={{ fontWeight: 400 }}> → {targetRoom.info.name}</span> : null}</h3>
        <div className="add-grid" style={{ gridTemplateColumns: '1fr' }}>
          <button className="add-btn" onClick={() => addFurniture(newWardrobe())}>
            <Icon d="M2 2h12v12H2zM6 2v12M10 2v12" /> Wardrobe <span className="tag">CUT</span>
          </button>
          <button className="add-btn" onClick={() => addFurniture(newTvUnit())}>
            <Icon d="M2 3h12v6H2zM2 11h12v2H2z" /> TV unit <span className="tag">CUT</span>
          </button>
        </div>
      </div>
      <div className="section">
        <h3>Basic blocks</h3>
        <div className="add-grid">
          {DECOR.map((d) => (
            <button key={d.kind} className="add-btn" onClick={() => addFurniture(newDecor(d.kind, 0, 0))}>
              <Icon d="M3 5h10v7H3z" /> {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="section">
        <h3>
          In this plan <span className="num" style={{ fontWeight: 400 }}>{project.furniture.length + project.openings.length}</span>
        </h3>
        <ul className="obj-list">
          {project.furniture.map((f) => (
            <li key={f.id} className={`obj ${selection?.kind === 'furniture' && selection.id === f.id ? 'sel' : ''}`} onClick={() => select({ kind: 'furniture', id: f.id })}>
              <span className={`dot ${sev.get(f.id) ?? ''}`} />
              <span className="swatch" style={{ background: itemSwatch(f) }} />
              <span>{f.name}</span>
              <span className="meta num">{fmtMm(envelope(f).widthUm)}</span>
            </li>
          ))}
          {project.openings.map((o) => (
            <li key={o.id} className={`obj ${selection?.kind === 'opening' && selection.id === o.id ? 'sel' : ''}`} onClick={() => select({ kind: 'opening', id: o.id })}>
              <span className={`dot ${sev.get(o.id) ?? ''}`} />
              <span>{o.kind === 'door' ? 'Door' : 'Window'}</span>
              <span className="meta num">
                {wallIndexLabel(plan, o.wallId).replace('wall ', 'W')} · {fmtMm(o.widthUm)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="section field-hint">
        Custom pieces marked <span className="tag" style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'var(--accent-tint)', color: 'var(--accent)', fontWeight: 600 }}>CUT</span> generate elevations and a cut list. Catalogue pieces and blocks are visual only — find 70+ pieces in the Catalogue tab.
      </div>
    </>
  );
}
