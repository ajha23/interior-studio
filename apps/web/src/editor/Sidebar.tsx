import { useMemo } from 'react';
import { finishById } from '@studio/core';
import { coreOf, newDecor, newTvUnit, newWardrobe } from '@studio/core';
import { useStudio, type Tool } from './store';
import { isParametric, type DecorKind, type FurnitureItem } from '@studio/core';
import { fmtMm } from '@studio/core';
import { envelope } from '@studio/core';
import { footprint, interiorPoint, normDeg, outsideDistance, penetration, sideOf, wallGeom, wallIndexLabel, wallPoint } from '@studio/core';
import { validateProject } from '@studio/core';
import { severityById, useRooms, useValidation } from './hooks';

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
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const readOnly = useStudio((s) => s.readOnly);
  const rooms = useRooms();
  const results = useValidation();
  const sev = useMemo(() => severityById(results), [results]);
  const plan = project.plan;

  // New pieces go into the selected room, else the room of the selected piece, else the largest room.
  const targetRoom = (() => {
    if (selection?.kind === 'room') return rooms.find((r) => r.id === selection.id) ?? rooms[0];
    return rooms[0];
  })();

  const addFurniture = (item: FurnitureItem) => {
    if (!targetRoom) {
      dispatch({ type: 'furniture.add', item }, `Add ${item.name}`);
      select({ kind: 'furniture', id: item.id });
      return;
    }
    const env = envelope(item);
    const others = project.furniture.map((f) => footprint(f));
    const free = (c: FurnitureItem) =>
      outsideDistance(footprint(c), targetRoom.interior) <= 1000 &&
      others.every((o) => penetration(footprint(c), o) === 0) &&
      !validateProject({ ...coreOf(project), furniture: [...project.furniture, c] }, rooms).some((r) => r.itemIds.includes(c.id) && r.code !== 'SHUTTER_NARROW');
    const centre = interiorPoint(targetRoom.interior);
    const candidates: FurnitureItem[] = [];
    if (!isParametric(item)) candidates.push({ ...item, xUm: centre.x, yUm: centre.y });
    // Back against each wall of the room, centred then sliding along it.
    for (const t of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      for (const wid of targetRoom.wallIds) {
        const w = plan.walls.find((x) => x.id === wid);
        if (!w) continue;
        const g = wallGeom(w);
        const side = sideOf(g, centre);
        const n = { x: g.n.x * side, y: g.n.y * side };
        const along = Math.min(Math.max(g.len * t, env.widthUm / 2), g.len - env.widthUm / 2);
        const c = wallPoint(g, along, side * (w.thicknessUm / 2 + env.depthUm / 2));
        candidates.push({ ...item, xUm: c.x, yUm: c.y, rotDeg: normDeg((Math.atan2(-n.x, n.y) * 180) / Math.PI) });
      }
    }
    const placed = candidates.find(free) ?? candidates[0] ?? item;
    dispatch({ type: 'furniture.add', item: { ...placed, xUm: Math.round(placed.xUm), yUm: Math.round(placed.yUm), rotDeg: Math.round(placed.rotDeg * 1000) / 1000 } }, `Add ${item.name}`);
    select({ kind: 'furniture', id: item.id });
  };

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
        <h3>
          In this plan <span className="num" style={{ fontWeight: 400 }}>{project.furniture.length + project.openings.length}</span>
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
                {wallIndexLabel(plan, o.wallId).replace('wall ', 'W')} · {fmtMm(o.widthUm)}
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
