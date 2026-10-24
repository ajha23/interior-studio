import { useMemo } from 'react';
import { envelope, fmtMm, itemSwatch, mm, newBaseCabinet, newDecor, newTallCabinet, newTvUnit, newWallCabinet, newWardrobe, wallIndexLabel, type DecorKind, type FurnitureItem } from '@studio/core';
import { useStudio } from './store';
import { severityById, useRooms, useValidation } from './hooks';
import { usePlaceFurniture } from './place';
import { Icon, type IconName } from './icons';

const DECOR: { kind: DecorKind; label: string }[] = [
  { kind: 'bed', label: 'Bed' },
  { kind: 'sofa', label: 'Sofa' },
  { kind: 'table', label: 'Table' },
  { kind: 'side-table', label: 'Side table' },
  { kind: 'box', label: 'Box / block' },
];

const KITCHEN: { label: string; hint: string; icon: IconName; make: () => FurnitureItem }[] = [
  { label: 'Base cabinet', hint: '600 · 1 door', icon: 'cabinet', make: () => newBaseCabinet() },
  { label: 'Double-door base', hint: '900 · 2 doors', icon: 'cabinet', make: () => ({ ...newBaseCabinet(undefined, undefined, { widthUm: mm(900), doorCount: 2 }), name: 'Double base cabinet' }) },
  { label: 'Drawer unit', hint: '450 · 3 drawers', icon: 'drawers', make: () => newBaseCabinet(undefined, undefined, { widthUm: mm(450), front: 'drawers', drawerCount: 3 }) },
  { label: 'Sink unit', hint: '800 · 2 doors', icon: 'cabinet', make: () => ({ ...newBaseCabinet(undefined, undefined, { widthUm: mm(800), doorCount: 2, shelfCount: 0 }), name: 'Sink unit' }) },
  { label: 'Wall cabinet', hint: '600 · at 1450', icon: 'wallunit', make: () => newWallCabinet() },
  { label: 'Wall unit, lift-up', hint: '900 × 360 · flap', icon: 'wallunit', make: () => newWallCabinet(undefined, undefined, { widthUm: mm(900), heightUm: mm(360), front: 'flap', shelfCount: 0, mountHeightUm: mm(1810) }) },
  { label: 'Tall pantry', hint: '600 × 2170', icon: 'tall', make: () => newTallCabinet() },
];

function AddButton({ icon, label, hint, tag, onClick }: { icon: IconName; label: string; hint?: string; tag?: string; onClick: () => void }) {
  return (
    <button className="add-tile" onClick={onClick}>
      <span className="add-ico"><Icon name={icon} size={18} /></span>
      <span className="add-txt">
        <span>{label}</span>
        {hint && <span className="add-hint num">{hint}</span>}
      </span>
      {tag && <span className="tag">{tag}</span>}
    </button>
  );
}

/** Add tab: parametric (manufacturable) pieces first, then visual blocks. */
export function AddPanel() {
  const readOnly = useStudio((s) => s.readOnly);
  const { place, targetRoom } = usePlaceFurniture();
  if (readOnly) return <div className="section field-hint">View-only: you can browse the design but not add pieces.</div>;
  return (
    <>
      <div className="section">
        <h3>Kitchen{targetRoom ? <span className="num h3-meta"> → {targetRoom.info.name}</span> : null}</h3>
        <div className="field-hint" style={{ marginBottom: 8 }}>Tip: select a wall and use “Kitchen run” to fill it in one step.</div>
        <div className="add-list">
          {KITCHEN.map((k) => (
            <AddButton key={k.label} icon={k.icon} label={k.label} hint={k.hint} tag="CUT" onClick={() => place(k.make(), { againstWall: true })} />
          ))}
        </div>
      </div>
      <div className="section">
        <h3>Custom furniture</h3>
        <div className="add-list">
          <AddButton icon="wardrobe" label="Wardrobe" hint="2400 · 4 modules" tag="CUT" onClick={() => place(newWardrobe())} />
          <AddButton icon="tv" label="TV unit" hint="1800 · wall-hung" tag="CUT" onClick={() => place(newTvUnit())} />
        </div>
      </div>
      <div className="section">
        <h3>Basic blocks</h3>
        <div className="add-grid">
          {DECOR.map((d) => (
            <button key={d.kind} className="add-btn" onClick={() => place(newDecor(d.kind, 0, 0))}>
              <Icon name="block" /> {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="section field-hint">
        Pieces marked <span className="tag inline">CUT</span> are parametric: they regenerate from their dimensions and produce elevations and a cut list. Find 70+ visual pieces in the Catalogue tab.
      </div>
    </>
  );
}

/** Scene tab: an outline of rooms, pieces and openings with their check status. */
export function ScenePanel() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const rooms = useRooms();
  const results = useValidation();
  const sev = useMemo(() => severityById(results), [results]);
  const plan = project.plan;
  return (
    <>
      <div className="section">
        <h3>
          Rooms <span className="num h3-meta">{rooms.length}</span>
        </h3>
        {rooms.length === 0 && <div className="field-hint">No closed room yet. Draw a room (M), or draw walls (W) until they close.</div>}
        <ul className="obj-list">
          {rooms.map((r) => (
            <li key={r.id} className={`obj ${selection?.kind === 'room' && selection.id === r.id ? 'sel' : ''}`} onClick={() => select({ kind: 'room', id: r.id })}>
              <span className={`dot ${sev.get(r.id) ?? ''}`} />
              <Icon name="room" />
              <span>{r.info.name}</span>
              <span className="meta num">{(r.areaUm2 / 1e12).toFixed(1)} m²</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="section">
        <h3>
          Objects <span className="num h3-meta">{project.furniture.length + project.openings.length}</span>
        </h3>
        <ul className="obj-list" aria-label="Objects">
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
              <Icon name={o.kind === 'door' ? 'door' : 'window'} />
              <span>{o.kind === 'door' ? 'Door' : 'Window'}</span>
              <span className="meta num">
                {wallIndexLabel(plan, o.wallId).replace('wall ', 'W')} · {fmtMm(o.widthUm)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
