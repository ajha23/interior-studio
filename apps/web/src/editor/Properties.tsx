import { useState } from 'react';
import { FINISHES, FLOOR_FINISHES, WALL_COLORS } from '@studio/core';
import type { Command } from '@studio/core';
import { uid } from '@studio/core';
import { useStudio } from './store';
import { isParametric, type FurnitureItem, type Opening, type Provenance, type TvModuleType, type WallSide, type WardrobeModuleType } from '@studio/core';
import { fmtMm, mm, type Um } from '@studio/core';
import { envelope, resolveParametric } from '@studio/core';
import { normDeg, wallGaps } from '@studio/core';
import { DegField, IntField, MmField, SelectField, TextField } from './fields';
import { useValidation } from './hooks';

const WALLS: { value: WallSide; label: string }[] = [
  { value: 'N', label: 'North (top)' },
  { value: 'E', label: 'East (right)' },
  { value: 'S', label: 'South (bottom)' },
  { value: 'W', label: 'West (left)' },
];

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

function RoomProps() {
  const room = useStudio((s) => s.project.room);
  const dispatch = useStudio((s) => s.dispatch);
  const set = (patch: Partial<typeof room>, label = 'Edit room') => dispatch({ type: 'room.update', patch }, label);
  return (
    <>
      <div className="section">
        <div className="prop-head">
          <strong>{room.name}</strong>
          <span className={`provenance ${room.source === 'estimate' ? 'estimate' : ''}`}>{room.source === 'site_measured' ? 'Site measured' : room.source === 'drawing' ? 'From drawing' : 'Estimate'}</span>
        </div>
      </div>
      <div className="section">
        <h3>Measurements</h3>
        <TextField label="Room name" value={room.name} onCommit={(name) => set({ name })} />
        <MmField label="Width (W→E)" value={room.widthUm} min={1000} max={20000} onCommit={(v) => set({ widthUm: v }, 'Change room width')} testId="room-width" />
        <MmField label="Depth (N→S)" value={room.depthUm} min={1000} max={20000} onCommit={(v) => set({ depthUm: v }, 'Change room depth')} />
        <MmField label="Ceiling height" value={room.ceilingUm} min={2000} max={6000} onCommit={(v) => set({ ceilingUm: v }, 'Change ceiling')} />
        <MmField label="Wall thickness" value={room.wallThicknessUm} min={75} max={600} onCommit={(v) => set({ wallThicknessUm: v })} />
        <SelectField<Provenance>
          label="Source"
          value={room.source}
          options={[
            { value: 'site_measured', label: 'Site measured' },
            { value: 'drawing', label: 'Supplied drawing' },
            { value: 'estimate', label: 'Estimate' },
          ]}
          onChange={(source) => set({ source }, 'Change measurement source')}
        />
        <div className="field-hint">Inside face to inside face. Area {((room.widthUm / 1e6) * (room.depthUm / 1e6)).toFixed(2)} m².</div>
      </div>
      <div className="section">
        <h3>Floor</h3>
        <div className="finish-grid">
          {FLOOR_FINISHES.map((f) => (
            <button key={f.id} className={`finish ${room.floorFinish === f.id ? 'on' : ''}`} style={{ background: f.color }} title={f.name} onClick={() => set({ floorFinish: f.id }, 'Change floor')} />
          ))}
        </div>
        <div className="finish-name">{FLOOR_FINISHES.find((f) => f.id === room.floorFinish)?.name}</div>
      </div>
      <div className="section">
        <h3>Walls</h3>
        <div className="finish-grid">
          {WALL_COLORS.map((f) => (
            <button key={f.id} className={`finish ${room.wallColor === f.id ? 'on' : ''}`} style={{ background: f.color }} title={f.name} onClick={() => set({ wallColor: f.id }, 'Change wall colour')} />
          ))}
        </div>
        <div className="finish-name">{WALL_COLORS.find((f) => f.id === room.wallColor)?.name}</div>
      </div>
    </>
  );
}

function OpeningProps({ o }: { o: Opening }) {
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const set = (patch: Partial<Opening>) => dispatch({ type: 'opening.update', id: o.id, patch });
  return (
    <>
      <div className="section">
        <div className="prop-head">
          <strong>{o.kind === 'door' ? 'Door' : 'Window'}</strong>
          <span className="kind">on {WALLS.find((w) => w.value === o.wall)?.label} wall</span>
        </div>
      </div>
      <div className="section">
        <h3>Placement</h3>
        <SelectField<WallSide> label="Wall" value={o.wall} options={WALLS} onChange={(wall) => set({ wall })} />
        <MmField label="Offset from wall start" value={o.offsetUm} min={0} max={20000} onCommit={(v) => set({ offsetUm: v })} hint="N/S walls from the west end; E/W walls from the north end." />
        <MmField label="Width" value={o.widthUm} min={300} max={6000} onCommit={(v) => set({ widthUm: v })} />
        <MmField label="Height" value={o.heightUm} min={300} max={6000} onCommit={(v) => set({ heightUm: v })} />
        {o.kind === 'window' && <MmField label="Sill height" value={o.sillUm} min={0} max={3000} onCommit={(v) => set({ sillUm: v })} />}
        {o.kind === 'door' && (
          <SelectField<'start' | 'end'>
            label="Hinge side"
            value={o.hinge}
            options={[
              { value: 'start', label: 'Start jamb' },
              { value: 'end', label: 'End jamb' },
            ]}
            onChange={(hinge) => set({ hinge })}
          />
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

/** Commands that place a piece flush against a wall with its back to the wall. */
function againstWall(f: FurnitureItem, wall: WallSide, roomW: Um, roomD: Um): Command {
  const env = envelope(f);
  const rot = { N: 0, E: 90, S: 180, W: 270 }[wall];
  const half = env.depthUm / 2;
  const halfW = env.widthUm / 2;
  const clampX = (x: number) => Math.min(Math.max(x, halfW), roomW - halfW);
  const clampY = (y: number) => Math.min(Math.max(y, halfW), roomD - halfW);
  const pos = wall === 'N' ? { xUm: clampX(f.xUm), yUm: half } : wall === 'S' ? { xUm: clampX(f.xUm), yUm: roomD - half } : wall === 'W' ? { xUm: half, yUm: clampY(f.yUm) } : { xUm: roomW - half, yUm: clampY(f.yUm) };
  return { type: 'furniture.update', id: f.id, patch: { ...pos, rotDeg: rot } };
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
      const g = wallGaps(f, project.room);
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
          <span className="kind">{isParametric(f) ? `Parametric · template v${f.templateVersion}` : 'Catalogue · visual only'}</span>
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
        <div className="field-hint" style={{ marginTop: 8 }}>Back against wall:</div>
        <div className="btn-row" style={{ marginTop: 4 }}>
          {(['N', 'E', 'S', 'W'] as WallSide[]).map((w) => (
            <button key={w} className="btn" onClick={() => dispatch(againstWall(f, w, project.room.widthUm, project.room.depthUm), `Place on ${w} wall`)}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Dimensions</h3>
        <MmField label="Width" value={f.params.widthUm} min={200} max={6000} onCommit={(v) => setParams({ widthUm: v })} testId="furn-width" />
        {f.kind === 'tvunit' ? (
          <>
            <MmField label="Console height" value={f.params.heightUm} min={150} max={1200} onCommit={(v) => setParams({ heightUm: v })} />
            <MmField label="Depth" value={f.params.depthUm} min={250} max={700} onCommit={(v) => setParams({ depthUm: v })} />
            <MmField label="Mount height" value={f.params.mountHeightUm} min={0} max={1500} onCommit={(v) => setParams({ mountHeightUm: v })} />
            <MmField label="Wall panel height" value={f.params.wallPanelHeightUm} min={0} max={2440} onCommit={(v) => setParams({ wallPanelHeightUm: v })} hint="0 = no panel." />
          </>
        ) : (
          <>
            <MmField label="Height" value={f.params.heightUm} min={100} max={4000} onCommit={(v) => setParams({ heightUm: v })} />
            <MmField label={f.kind === 'wardrobe' ? 'Depth (incl. shutters)' : 'Depth'} value={f.params.depthUm} min={200} max={4000} onCommit={(v) => setParams({ depthUm: v })} />
          </>
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
      {!isParametric(f) && (
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
  if (selection?.kind === 'room') return <RoomProps />;
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
      <p>Click a piece in the plan or 3D view, or click the floor to edit the room.</p>
      <p>
        <span className="kbd">⌘/Ctrl Z</span> undo · <span className="kbd">⇧⌘Z</span> redo
        <br />
        <span className="kbd">←↑→↓</span> nudge 10 mm (<span className="kbd">⇧</span> 100 mm)
        <br />
        <span className="kbd">R</span> rotate 90° · <span className="kbd">Del</span> delete
      </p>
    </div>
  );
}
