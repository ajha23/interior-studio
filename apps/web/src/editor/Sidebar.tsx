import { useMemo } from 'react';
import { finishById } from '@studio/core';
import { coreOf, newDecor, newOpening, newTvUnit, newWardrobe } from '@studio/core';
import { useStudio } from './store';
import { isParametric, type DecorKind, type FurnitureItem } from '@studio/core';
import { fmtMm } from '@studio/core';
import { envelope } from '@studio/core';
import { footprint, outsideBy, penetration } from '@studio/core';
import { validateProject } from '@studio/core';
import { severityById, useValidation } from './hooks';

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

export function Sidebar() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const results = useValidation();
  const sev = useMemo(() => severityById(results), [results]);
  const { room } = project;

  const addFurniture = (item: FurnitureItem) => {
    // Try each wall (back to wall, centred then sliding) and pick the first spot with no conflicts;
    // catalogue pieces try the room centre first.
    const env = envelope(item);
    const others = project.furniture.map((f) => footprint(f));
    const free = (c: FurnitureItem) =>
      outsideBy(footprint(c), room) <= 1000 &&
      others.every((o) => penetration(footprint(c), o) === 0) &&
      !validateProject({ ...coreOf(project), furniture: [...project.furniture, c] }).some((r) => r.itemIds.includes(c.id) && r.code !== 'SHUTTER_NARROW');
    const candidates: FurnitureItem[] = [];
    if (!isParametric(item)) candidates.push({ ...item, xUm: room.widthUm / 2, yUm: room.depthUm / 2 });
    const d = env.depthUm / 2;
    const steps = [0.5, 0.25, 0.75, 0.1, 0.9];
    for (const t of steps) {
      const x = Math.min(Math.max(room.widthUm * t, env.widthUm / 2), room.widthUm - env.widthUm / 2);
      const y = Math.min(Math.max(room.depthUm * t, env.widthUm / 2), room.depthUm - env.widthUm / 2);
      candidates.push({ ...item, rotDeg: 0, xUm: x, yUm: d }, { ...item, rotDeg: 270, xUm: d, yUm: y }, { ...item, rotDeg: 90, xUm: room.widthUm - d, yUm: y }, { ...item, rotDeg: 180, xUm: x, yUm: room.depthUm - d });
    }
    const placed = candidates.find(free) ?? candidates[0];
    dispatch({ type: 'furniture.add', item: { ...placed, xUm: Math.round(placed.xUm), yUm: Math.round(placed.yUm) } }, `Add ${item.name}`);
    select({ kind: 'furniture', id: item.id });
  };

  return (
    <>
      <div className="section">
        <h3>Room</h3>
        <div className={`obj ${selection?.kind === 'room' ? 'sel' : ''}`} onClick={() => select({ kind: 'room' })}>
          <Icon d="M2 2h12v12H2z" />
          <span>{room.name}</span>
          <span className="meta num">
            {fmtMm(room.widthUm)}×{fmtMm(room.depthUm)}
          </span>
        </div>
      </div>
      <div className="section">
        <h3>Custom furniture</h3>
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
        <h3>Catalogue</h3>
        <div className="add-grid">
          {DECOR.map((d) => (
            <button key={d.kind} className="add-btn" onClick={() => addFurniture(newDecor(d.kind, 0, 0))}>
              <Icon d="M3 5h10v7H3z" /> {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="section">
        <h3>Openings</h3>
        <div className="add-grid">
          <button
            className="add-btn"
            onClick={() => {
              const o = newOpening('door');
              dispatch({ type: 'opening.add', opening: o });
              select({ kind: 'opening', id: o.id });
            }}
          >
            <Icon d="M3 14V2h7v12M3 14h10" /> Door
          </button>
          <button
            className="add-btn"
            onClick={() => {
              const o = newOpening('window');
              dispatch({ type: 'opening.add', opening: o });
              select({ kind: 'opening', id: o.id });
            }}
          >
            <Icon d="M2 4h12v8H2zM8 4v8" /> Window
          </button>
        </div>
      </div>
      <div className="section">
        <h3>
          In this room <span className="num" style={{ fontWeight: 400 }}>{project.furniture.length + project.openings.length}</span>
        </h3>
        <ul className="obj-list">
          {project.furniture.map((f) => (
            <li key={f.id} className={`obj ${selection?.kind === 'furniture' && selection.id === f.id ? 'sel' : ''}`} onClick={() => select({ kind: 'furniture', id: f.id })}>
              <span className={`dot ${sev.get(f.id) ?? ''}`} />
              <span className="swatch" style={{ background: isParametric(f) ? finishById(f.materials.shutter).color : f.params.color }} />
              <span>{f.name}</span>
              <span className="meta num">{fmtMm(envelope(f).widthUm)}</span>
            </li>
          ))}
          {project.openings.map((o) => (
            <li key={o.id} className={`obj ${selection?.kind === 'opening' && selection.id === o.id ? 'sel' : ''}`} onClick={() => select({ kind: 'opening', id: o.id })}>
              <span className={`dot ${sev.get(o.id) ?? ''}`} />
              <span>{o.kind === 'door' ? 'Door' : 'Window'}</span>
              <span className="meta num">
                {o.wall} · {fmtMm(o.widthUm)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="section field-hint">
        Custom pieces marked <span className="tag" style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'var(--accent-tint)', color: 'var(--accent)', fontWeight: 600 }}>CUT</span> generate elevations and a cut list. Catalogue pieces are visual only.
      </div>
    </>
  );
}
