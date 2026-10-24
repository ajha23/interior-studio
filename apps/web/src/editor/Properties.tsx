import { useMemo, useState } from 'react';
import { FINISHES, isDecor, materialById, materialsIn, type MaterialCategory } from '@studio/core';
import { patternUrl } from '../materials/patterns';
import { catalogName } from './CatalogPanel';
import { SaveTemplateForm } from './TemplatesPanel';
import type { Command } from '@studio/core';
import { uid } from '@studio/core';
import { useStudio } from './store';
import { isParametric, type DetectedRoom, type FurnitureItem, type Opening, type Plan, type Provenance, type TvModuleType, type Wall, type WardrobeModuleType } from '@studio/core';
import { fmtMm, mm } from '@studio/core';
import { envelope, resolveParametric } from '@studio/core';
import { endpointsAt, nearestWall, normDeg, sideOf, wallGaps, wallGeom, wallIndexLabel, wallLength, wallPoint } from '@studio/core';
import { DegField, IntField, MmField, SelectField, TextField } from './fields';
import { useRooms, useValidation } from './hooks';

function Issues({ ids }: { ids: string[] }) {
  const results = useValidation().filter((r) => r.itemIds.some((i) => ids.includes(i)));
  if (!results.length) return <div className="issue" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}><span className="dot" />No issues detected</div>;
  return (
    <div className="issues-inline">
      {results.map((r) => (
        <div key={r.id} className={`issue ${r.severity}`}>
          <span className={`dot ${r.severity}`} />
          <span>{r.message}</span>
        </div>
      ))}
    </div>
  );
}

function PlanSettings() {
  const plan = useStudio((s) => s.project.plan);
  const dispatch = useStudio((s) => s.dispatch);
  return (
    <div className="section">
      <h3>Plan settings</h3>
      <SelectField<Provenance>
        label="Measurements"
        value={plan.source}
        options={[
          { value: 'site_measured', label: 'Site measured' },
          { value: 'drawing', label: 'Supplied drawing' },
          { value: 'estimate', label: 'Estimate' },
        ]}
        onChange={(source) => dispatch({ type: 'plan.update', patch: { source } }, 'Change measurement source')}
      />
      <MmField label="New wall thickness" value={plan.defaultWallThicknessUm} min={75} max={600} onCommit={(v) => dispatch({ type: 'plan.update', patch: { defaultWallThicknessUm: v } })} />
      <MmField label="New wall height" value={plan.defaultCeilingUm} min={2000} max={6000} onCommit={(v) => dispatch({ type: 'plan.update', patch: { defaultCeilingUm: v } })} />
    </div>
  );
}

/** Swatch grid for one material category; patterned materials show their tile. */
export function MaterialPicker({ category, value, onPick, allowNone }: { category: MaterialCategory; value: string | undefined; onPick: (id: string | undefined) => void; allowNone?: string }) {
  const list = materialsIn(category);
  return (
    <>
      <div className="finish-grid">
        {allowNone && <button className={`finish none ${!value ? 'on' : ''}`} title={allowNone} onClick={() => onPick(undefined)}>∅</button>}
        {list.map((m) => (
          <button
            key={m.id}
            className={`finish ${value === m.id ? 'on' : ''}`}
            style={m.pattern === 'plain' ? { background: m.color } : { backgroundImage: `url(${patternUrl(m.id)})`, backgroundSize: 'cover' }}
            title={m.name}
            onClick={() => onPick(m.id)}
          />
        ))}
      </div>
      <div className="finish-name">{value ? materialById(value, category).name : allowNone}</div>
    </>
  );
}

function RoomProps({ room }: { room: DetectedRoom }) {
  const dispatch = useStudio((s) => s.dispatch);
  const plan = useStudio((s) => s.project.plan);
  const info = room.info;
  const readOnlyRoom = useStudio((s) => s.readOnly);
  // Editing an automatic room stores its properties for the first time.
  const set = (patch: Partial<typeof info>, label = 'Edit room') => dispatch({ type: 'room.upsert', info: { ...info, ...patch, id: room.auto ? uid('room') : info.id } }, label);
  const areaM2 = room.areaUm2 / 1e12;
  return (
    <>
      <div className="section">
        <div className="prop-head">
          <strong>{info.name}</strong>
          <span className={`provenance ${plan.source === 'estimate' ? 'estimate' : ''}`}>{plan.source === 'site_measured' ? 'Site measured' : plan.source === 'drawing' ? 'From drawing' : 'Estimate'}</span>
        </div>
      </div>
      <div className="section">
        <h3>Room</h3>
        <TextField label="Room name" value={info.name} onCommit={(name) => set({ name }, 'Rename room')} />
        <MmField label="Ceiling height" value={info.ceilingUm} min={2000} max={6000} onCommit={(v) => set({ ceilingUm: v }, 'Change ceiling')} />
        <div className="field-hint">
          Clear floor {areaM2.toFixed(2)} m² · perimeter {fmtMm(room.perimeterUm)} mm · {room.wallIds.length} walls. Change the size by dragging walls in the plan.
        </div>
      </div>
      <div className="section">
        <h3>Floor</h3>
        <MaterialPicker category="floor" value={info.floorFinish} onPick={(id) => set({ floorFinish: id }, 'Change floor')} />
      </div>
      <div className="section">
        <h3>Walls</h3>
        <MaterialPicker category="wall" value={info.wallColor} onPick={(id) => set({ wallColor: id }, 'Change wall finish')} />
        <div className="field-hint">Applies to every wall face in this room without its own finish. Use Materials → Paint for single faces.</div>
      </div>
      <div className="section">
        <h3>Checks</h3>
        <Issues ids={[room.id]} />
      </div>
      {!readOnlyRoom && <SaveTemplateForm room={room} />}
      <PlanSettings />
    </>
  );
}

/** Commands that change a wall's length from its start, carrying any wall ends attached to its far end. */
function resizeWall(plan: Plan, w: Wall, len: number): Command[] {
  const g = wallGeom(w);
  const nb = { x: Math.round(w.a.x + g.u.x * len), y: Math.round(w.a.y + g.u.y * len) };
  const cmds: Command[] = [];
  for (const e of endpointsAt(plan, w.b)) cmds.push({ type: 'wall.update', id: e.wallId, patch: { [e.end]: nb } });
  return cmds;
}

function WallProps({ w }: { w: Wall }) {
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const plan = useStudio((s) => s.project.plan);
  const allOpenings = useStudio((s) => s.project.openings);
  const openings = useMemo(() => allOpenings.filter((o) => o.wallId === w.id), [allOpenings, w.id]);
  const set = (patch: Partial<Wall>, label = 'Edit wall') => dispatch({ type: 'wall.update', id: w.id, patch }, label);
  const len = wallLength(w);
  const ang = normDeg((Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI);
  return (
    <>
      <div className="section">
        <div className="prop-head">
          <strong>{wallIndexLabel(plan, w.id).replace(/^w/, 'W')}</strong>
          <span className="kind">{openings.length ? `${openings.length} opening${openings.length > 1 ? 's' : ''}` : 'Solid wall'}</span>
        </div>
      </div>
      <div className="section">
        <h3>Size</h3>
        <MmField label="Length (centreline)" value={Math.round(len)} min={100} max={50000} onCommit={(v) => dispatch({ type: 'batch', label: 'Change wall length', commands: resizeWall(plan, w, v) })} hint="Grows from the start end; walls joined at the far end follow." />
        <MmField label="Thickness" value={w.thicknessUm} min={50} max={600} onCommit={(v) => set({ thicknessUm: v }, 'Change wall thickness')} />
        <MmField label="Height" value={w.heightUm} min={1000} max={6000} onCommit={(v) => set({ heightUm: v }, 'Change wall height')} />
        <div className="field-hint">Direction {ang.toFixed(1)}° · start ({fmtMm(w.a.x)}, {fmtMm(w.a.y)})</div>
      </div>
      <div className="section">
        <h3>Face finishes</h3>
        <div className="field-hint" style={{ marginBottom: 6 }}>Right-hand face (walking start → end)</div>
        <MaterialPicker category="wall" value={w.finishes?.pos} allowNone="Room colour" onPick={(id) => set({ finishes: { ...w.finishes, pos: id } }, 'Change wall face')} />
        <div className="field-hint" style={{ margin: '10px 0 6px' }}>Left-hand face</div>
        <MaterialPicker category="wall" value={w.finishes?.neg} allowNone="Room colour" onPick={(id) => set({ finishes: { ...w.finishes, neg: id } }, 'Change wall face')} />
      </div>
      <div className="section">
        <h3>Checks</h3>
        <Issues ids={[w.id]} />
      </div>
      <div className="section btn-row">
        <button
          className="btn danger"
          onClick={() => {
            dispatch({ type: 'batch', label: 'Delete wall', commands: [...openings.map((o): Command => ({ type: 'opening.remove', id: o.id })), { type: 'wall.remove', id: w.id }] });
            select(null);
          }}
        >
          Delete wall{openings.length ? ` and its ${openings.length} opening${openings.length > 1 ? 's' : ''}` : ''}
        </button>
      </div>
    </>
  );
}

function OpeningProps({ o }: { o: Opening }) {
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const plan = useStudio((s) => s.project.plan);
  const set = (patch: Partial<Opening>, label?: string) => dispatch({ type: 'opening.update', id: o.id, patch }, label);
  const wall = plan.walls.find((w) => w.id === o.wallId);
  const len = wall ? wallLength(wall) : 0;
  return (
    <>
      <div className="section">
        <div className="prop-head">
          <strong>{o.kind === 'door' ? 'Door' : 'Window'}</strong>
          <span className="kind">on {wallIndexLabel(plan, o.wallId)} ({fmtMm(len)} mm)</span>
        </div>
      </div>
      <div className="section">
        <h3>Placement</h3>
        <SelectField<string>
          label="Wall"
          value={o.wallId}
          options={plan.walls.map((w) => ({ value: w.id, label: `${wallIndexLabel(plan, w.id).replace(/^w/, 'W')} · ${fmtMm(wallLength(w))} mm` }))}
          onChange={(wallId) => {
            const nw = plan.walls.find((w) => w.id === wallId)!;
            set({ wallId, offsetUm: Math.max(0, Math.min(o.offsetUm, wallLength(nw) - o.widthUm)) }, 'Move to another wall');
          }}
        />
        <MmField label="Offset from wall start" value={o.offsetUm} min={0} max={50000} onCommit={(v) => set({ offsetUm: v })} hint="Measured along the wall centreline. Drag it in the plan to slide." />
        <MmField label="Width" value={o.widthUm} min={300} max={6000} onCommit={(v) => set({ widthUm: v })} />
        <MmField label="Height" value={o.heightUm} min={300} max={6000} onCommit={(v) => set({ heightUm: v })} />
        {o.kind === 'window' && <MmField label="Sill height" value={o.sillUm} min={0} max={3000} onCommit={(v) => set({ sillUm: v })} />}
        {o.kind === 'door' && (
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn" onClick={() => set({ hinge: o.hinge === 'start' ? 'end' : 'start' }, 'Flip hinge')}>Flip hinge</button>
            <button className="btn" onClick={() => set({ side: o.side === 1 ? -1 : 1 }, 'Flip swing')}>Flip swing side</button>
          </div>
        )}
      </div>
      <div className="section">
        <h3>Checks</h3>
        <Issues ids={[o.id]} />
      </div>
      <div className="section btn-row">
        <button
          className="btn danger"
          onClick={() => {
            dispatch({ type: 'opening.remove', id: o.id });
            select(null);
          }}
        >
          Delete {o.kind}
        </button>
      </div>
    </>
  );
}

const WR_MODULES: { value: WardrobeModuleType; label: string }[] = [
  { value: 'hanging', label: 'Hanging' },
  { value: 'shelves', label: 'Shelves' },
  { value: 'drawers', label: 'Drawers + shelves' },
];
const TV_MODULES: { value: TvModuleType; label: string }[] = [
  { value: 'drawer', label: 'Drawer' },
  { value: 'flap', label: 'Flap door' },
  { value: 'open', label: 'Open' },
];

function ModulesEditor<T extends string>({ modules, options, onChange, max }: { modules: T[]; options: { value: T; label: string }[]; onChange: (m: T[]) => void; max: number }) {
  return (
    <div className="modules">
      {modules.map((m, i) => (
        <div className="module-row" key={i}>
          <span className="idx">M{i + 1}</span>
          <div className="inp">
            <select value={m} onChange={(e) => onChange(modules.map((x, j) => (j === i ? (e.target.value as T) : x)))}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button className="icon-btn" disabled={modules.length <= 1} onClick={() => onChange(modules.filter((_, j) => j !== i))} title="Remove module">
            ×
          </button>
        </div>
      ))}
      {modules.length < max && (
        <button className="btn" onClick={() => onChange([...modules, options[1]?.value ?? options[0].value])}>
          + Add module
        </button>
      )}
    </div>
  );
}

/** Turn a piece so its back is flush against the nearest wall face, keeping its position along that wall. */
function againstNearestWall(f: FurnitureItem, plan: Plan): Command | null {
  const hit = nearestWall(plan, { x: f.xUm, y: f.yUm }, mm(5000));
  if (!hit) return null;
  const env = envelope(f);
  const side = sideOf(hit.geom, { x: f.xUm, y: f.yUm });
  const n = { x: hit.geom.n.x * side, y: hit.geom.n.y * side }; // into the room
  // rot 0 → back faces −y; back direction for rot θ is (sin θ, −cos θ) and must equal −n.
  const rot = normDeg((Math.atan2(-n.x, n.y) * 180) / Math.PI);
  const along = Math.min(Math.max(hit.along, env.widthUm / 2), hit.geom.len - env.widthUm / 2);
  const c = wallPoint(hit.geom, along, side * (hit.wall.thicknessUm / 2 + env.depthUm / 2));
  return { type: 'furniture.update', id: f.id, patch: { xUm: Math.round(c.x), yUm: Math.round(c.y), rotDeg: Math.round(rot * 1000) / 1000 } };
}

function FurnitureProps({ f }: { f: FurnitureItem }) {
  const project = useStudio((s) => s.project);
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const [showRules, setShowRules] = useState(false);
  const env = envelope(f);
  const update = (patch: Record<string, unknown>, label?: string) => dispatch({ type: 'furniture.update', id: f.id, patch }, label);

  /** Change params; if depth changes on an axis-aligned piece, keep its back edge where it is. */
  const setParams = (params: Record<string, unknown>, label = 'Change dimensions') => {
    const cmds: Command[] = [{ type: 'furniture.params', id: f.id, params }];
    const newW = params.widthUm as number | undefined;
    if (newW !== undefined && Math.round(f.rotDeg) % 90 === 0) {
      // Keep whichever end is against a wall fixed; otherwise grow about the centre.
      const g = wallGaps(f, project.plan);
      const a = (f.rotDeg * Math.PI) / 180;
      const ax = { x: Math.round(Math.cos(a)), y: Math.round(Math.sin(a)) }; // local +x (width) direction in plan
      const delta = (newW - f.params.widthUm) / 2;
      const startGap = ax.x === 1 ? g.west : ax.x === -1 ? g.east : ax.y === 1 ? g.north : g.south;
      const endGap = ax.x === 1 ? g.east : ax.x === -1 ? g.west : ax.y === 1 ? g.south : g.north;
      const sign = startGap <= mm(1) ? 1 : endGap <= mm(1) ? -1 : 0;
      if (sign !== 0) cmds.push({ type: 'furniture.update', id: f.id, patch: { xUm: Math.round(f.xUm + ax.x * delta * sign), yUm: Math.round(f.yUm + ax.y * delta * sign) } });
    }
    const newD = params.depthUm as number | undefined;
    if (newD !== undefined && Math.round(f.rotDeg) % 90 === 0) {
      const delta = (newD - f.params.depthUm) / 2;
      const a = (f.rotDeg * Math.PI) / 180;
      // front direction in plan = (−sin a, cos a)
      const last = cmds.at(-1);
      const base = last && last.type === 'furniture.update' ? (last.patch as { xUm: number; yUm: number }) : { xUm: f.xUm, yUm: f.yUm };
      cmds.push({ type: 'furniture.update', id: f.id, patch: { xUm: Math.round(base.xUm - Math.sin(a) * delta), yUm: Math.round(base.yUm + Math.cos(a) * delta) } });
    }
    dispatch(cmds.length === 1 ? cmds[0] : { type: 'batch', label, commands: cmds }, label);
  };

  const resolved = isParametric(f) ? resolveParametric(f, project.rulePack) : null;
  const shutterW = resolved?.parts.find((p) => p.role === 'shutter')?.widthUm;

  return (
    <>
      <div className="section">
        <div className="prop-head">
          <strong>{f.name}</strong>
          <span className="kind">{isParametric(f) ? `Parametric · template v${f.templateVersion}` : f.kind === 'library' ? `Catalogue · ${catalogName(f.ref)}` : f.kind === 'model' ? 'Studio model' : 'Block · visual only'}</span>
        </div>
      </div>
      <div className="section">
        <h3>Placement</h3>
        <TextField label="Name" value={f.name} onCommit={(name) => update({ name }, 'Rename')} />
        <MmField label="Centre X (from W)" value={f.xUm} min={-5000} max={25000} onCommit={(v) => update({ xUm: v })} />
        <MmField label="Centre Y (from N)" value={f.yUm} min={-5000} max={25000} onCommit={(v) => update({ yUm: v })} />
        <DegField label="Rotation" value={f.rotDeg} onCommit={(v) => update({ rotDeg: v }, 'Rotate')} />
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={() => update({ rotDeg: normDeg(f.rotDeg - 90) }, 'Rotate')}>⟲ 90°</button>
          <button className="btn" onClick={() => update({ rotDeg: normDeg(f.rotDeg + 90) }, 'Rotate')}>⟳ 90°</button>
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button
            className="btn"
            onClick={() => {
              const cmd = againstNearestWall(f, project.plan);
              if (cmd) dispatch(cmd, 'Back against wall');
            }}
          >
            Back against nearest wall
          </button>
        </div>
      </div>

      <div className="section">
        <h3>Dimensions</h3>
        <MmField label="Width" value={f.params.widthUm} min={f.kind === 'library' || f.kind === 'model' ? 10 : 200} max={6000} onCommit={(v) => setParams({ widthUm: v })} testId="furn-width" />
        {f.kind === 'tvunit' ? (
          <>
            <MmField label="Console height" value={f.params.heightUm} min={150} max={1200} onCommit={(v) => setParams({ heightUm: v })} />
            <MmField label="Depth" value={f.params.depthUm} min={250} max={700} onCommit={(v) => setParams({ depthUm: v })} />
            <MmField label="Mount height" value={f.params.mountHeightUm} min={0} max={1500} onCommit={(v) => setParams({ mountHeightUm: v })} />
            <MmField label="Wall panel height" value={f.params.wallPanelHeightUm} min={0} max={2440} onCommit={(v) => setParams({ wallPanelHeightUm: v })} hint="0 = no panel." />
          </>
        ) : (
          <>
            <MmField label="Height" value={f.params.heightUm} min={f.kind === 'library' || f.kind === 'model' ? 5 : 100} max={4000} onCommit={(v) => setParams({ heightUm: v })} />
            <MmField label={f.kind === 'wardrobe' ? 'Depth (incl. shutters)' : 'Depth'} value={f.params.depthUm} min={f.kind === 'library' || f.kind === 'model' ? 10 : 200} max={4000} onCommit={(v) => setParams({ depthUm: v })} />
          </>
        )}
        {(f.kind === 'library' || f.kind === 'model') && (
          <MmField label="Height above floor" value={f.params.elevationUm} min={0} max={4000} onCommit={(v) => setParams({ elevationUm: v }, 'Change elevation')} hint="For wall- and ceiling-mounted pieces." />
        )}
        {f.kind === 'model' && (
          <button className="btn" style={{ marginTop: 6 }} onClick={() => setParams({ ...f.native }, 'Reset size')}>
            Reset to file size ({fmtMm(f.native.widthUm)} × {fmtMm(f.native.depthUm)} × {fmtMm(f.native.heightUm)})
          </button>
        )}
        <div className="field-hint num">
          Envelope {fmtMm(env.widthUm)} × {fmtMm(env.depthUm)} × {fmtMm(env.heightUm)} mm{env.zMinUm > 0 ? `, from ${fmtMm(env.zMinUm)} above floor` : ''}
        </div>
      </div>

      {f.kind === 'wardrobe' && (
        <div className="section">
          <h3>Configuration</h3>
          <IntField label="Shutters" value={f.params.shutterCount} min={1} max={8} onCommit={(v) => setParams({ shutterCount: v }, 'Change shutters')} />
          <IntField label="Shelves per module" value={f.params.shelvesPerModule} min={0} max={8} onCommit={(v) => setParams({ shelvesPerModule: v })} />
          <IntField label="Drawers per drawer module" value={f.params.drawersPerModule} min={1} max={6} onCommit={(v) => setParams({ drawersPerModule: v })} />
          {shutterW && <div className="field-hint num">Each shutter {fmtMm(shutterW)} mm wide</div>}
          <div className="field-hint" style={{ margin: '10px 0 6px' }}>Modules, left → right</div>
          <ModulesEditor modules={f.params.modules} options={WR_MODULES} max={6} onChange={(modules) => setParams({ modules }, 'Change modules')} />
        </div>
      )}
      {f.kind === 'tvunit' && (
        <div className="section">
          <h3>Configuration</h3>
          <ModulesEditor modules={f.params.modules} options={TV_MODULES} max={6} onChange={(modules) => setParams({ modules }, 'Change modules')} />
        </div>
      )}

      {isParametric(f) && (
        <div className="section">
          <h3>Finishes</h3>
          <div className="field-hint" style={{ marginBottom: 6 }}>Shutters / fronts</div>
          <div className="finish-grid">
            {FINISHES.map((fin) => (
              <button key={fin.id} className={`finish ${f.materials.shutter === fin.id ? 'on' : ''}`} style={{ background: fin.color }} title={fin.name} onClick={() => update({ materials: { ...f.materials, shutter: fin.id } }, 'Change finish')} />
            ))}
          </div>
          <div className="finish-name">{FINISHES.find((x) => x.id === f.materials.shutter)?.name}</div>
          <div className="field-hint" style={{ margin: '10px 0 6px' }}>Carcass</div>
          <div className="finish-grid">
            {FINISHES.slice(0, 5).map((fin) => (
              <button key={fin.id} className={`finish ${f.materials.carcass === fin.id ? 'on' : ''}`} style={{ background: fin.color }} title={fin.name} onClick={() => update({ materials: { ...f.materials, carcass: fin.id } }, 'Change finish')} />
            ))}
          </div>
          <div className="finish-name">{FINISHES.find((x) => x.id === f.materials.carcass)?.name}</div>
        </div>
      )}
      {f.kind === 'library' && (
        <div className="section">
          <h3>Finishes</h3>
          <div className="field-hint" style={{ marginBottom: 6 }}>Main</div>
          <MaterialPicker category="surface" value={f.materials.main} onPick={(id) => id && update({ materials: { ...f.materials, main: id } }, 'Change finish')} />
          <div className="field-hint" style={{ margin: '10px 0 6px' }}>Accent (legs, frame, handles)</div>
          <MaterialPicker category="surface" value={f.materials.accent} onPick={(id) => id && update({ materials: { ...f.materials, accent: id } }, 'Change finish')} />
        </div>
      )}
      {isDecor(f) && (
        <div className="section">
          <h3>Colour</h3>
          <div className="finish-grid">
            {['#8b6b52', '#7d8a83', '#a07a55', '#b9b2a6', '#5b6b7a', '#c4a484', '#3f4a45', '#d9cbb3'].map((c) => (
              <button key={c} className={`finish ${f.params.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setParams({ color: c }, 'Change colour')} />
            ))}
          </div>
        </div>
      )}

      {isParametric(f) && (
        <div className="section">
          <h3>
            Construction rules
            <button className="btn" style={{ height: 22, fontSize: 11 }} onClick={() => setShowRules((x) => !x)}>
              {showRules ? 'Hide' : 'Edit'}
            </button>
          </h3>
          <div className="field-hint">
            {project.rulePack.name} · v{project.rulePack.version}
          </div>
          {showRules && (
            <>
              <div className="field-hint" style={{ margin: '6px 0' }}>{project.rulePack.method}</div>
              <MmField label="Carcass board" value={project.rulePack.carcassThicknessUm} min={9} max={30} onCommit={(v) => dispatch({ type: 'rulepack.update', patch: { carcassThicknessUm: v } })} />
              <MmField label="Back panel" value={project.rulePack.backThicknessUm} min={3} max={18} onCommit={(v) => dispatch({ type: 'rulepack.update', patch: { backThicknessUm: v } })} />
              <MmField label="Shutter board" value={project.rulePack.shutterThicknessUm} min={9} max={30} onCommit={(v) => dispatch({ type: 'rulepack.update', patch: { shutterThicknessUm: v } })} />
              <MmField label="Shutter gap" value={project.rulePack.shutterGapUm} min={1} max={10} onCommit={(v) => dispatch({ type: 'rulepack.update', patch: { shutterGapUm: v } })} />
              <div className="field-hint">Applies to every piece in this project and bumps the rule-pack version. Issued revisions keep their own frozen copy.</div>
            </>
          )}
        </div>
      )}

      <div className="section">
        <h3>Checks</h3>
        <Issues ids={[f.id]} />
      </div>
      <div className="section btn-row">
        <button
          className="btn"
          onClick={() => {
            const copy = { ...f, id: uid(f.kind), name: `${f.name} copy`, xUm: f.xUm + 200_000, yUm: f.yUm + 200_000 } as FurnitureItem;
            dispatch({ type: 'furniture.add', item: copy }, 'Duplicate');
            select({ kind: 'furniture', id: copy.id });
          }}
        >
          Duplicate
        </button>
        <button
          className="btn danger"
          onClick={() => {
            dispatch({ type: 'furniture.remove', id: f.id });
            select(null);
          }}
        >
          Delete
        </button>
      </div>
    </>
  );
}

export function Properties() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const rooms = useRooms();
  if (selection?.kind === 'room') {
    const r = rooms.find((x) => x.id === selection.id);
    if (r) return <RoomProps room={r} />;
  }
  if (selection?.kind === 'wall') {
    const w = project.plan.walls.find((x) => x.id === selection.id);
    if (w) return <WallProps w={w} />;
  }
  if (selection?.kind === 'opening') {
    const o = project.openings.find((x) => x.id === selection.id);
    if (o) return <OpeningProps o={o} />;
  }
  if (selection?.kind === 'furniture') {
    const f = project.furniture.find((x) => x.id === selection.id);
    if (f) return <FurnitureProps key={f.id} f={f} />;
  }
  return (
    <div className="empty">
      <strong style={{ color: 'var(--ink)' }}>Nothing selected</strong>
      <p>Click a piece, wall or room in the plan. Use the Wall and Room tools above the plan to draw.</p>
      <p>
        <span className="kbd">⌘/Ctrl Z</span> undo · <span className="kbd">⇧⌘Z</span> redo
        <br />
        <span className="kbd">←↑→↓</span> nudge 10 mm (<span className="kbd">⇧</span> 100 mm)
        <br />
        <span className="kbd">R</span> rotate 90° · <span className="kbd">Del</span> delete
        <br />
        <span className="kbd">W</span> wall · <span className="kbd">M</span> room · <span className="kbd">D</span> door · <span className="kbd">N</span> window · <span className="kbd">Esc</span> stop
      </p>
      <PlanSettings />
    </div>
  );
}
