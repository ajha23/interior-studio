import { useState } from 'react';
import { BASE_CABINET_LIMITS, counterHeightUm, envelope, fmtMm, resolveParametric, TALL_CABINET_LIMITS, WALL_CABINET_LIMITS, type KitchenItem, type ToolCall } from '@studio/core';
import { IntField, MmField, SelectField } from './fields';
import { useStudio } from './store';
import { runSceneTools } from './tools';

/** Run one validated tool against a piece; returns an error message for the field, or null. */
function useTool(id: string) {
  return (call: ToolCall, label: string): string | null => {
    const r = runSceneTools([{ ...call, args: { ...call.args, target: id } }], label);
    return r.ok ? null : r.error;
  };
}

type DimRow = { dim: string; key: string; label: string; hint?: string };

const ROWS: Record<KitchenItem['kind'], DimRow[]> = {
  basecabinet: [
    { dim: 'width', key: 'widthUm', label: 'Width' },
    { dim: 'height', key: 'heightUm', label: 'Height', hint: 'Floor to carcass top, incl. plinth.' },
    { dim: 'depth', key: 'depthUm', label: 'Depth', hint: 'Wall to door face.' },
    { dim: 'plinth', key: 'plinthUm', label: 'Plinth' },
    { dim: 'worktop', key: 'worktopUm', label: 'Worktop', hint: 'Thickness; 0 = none.' },
  ],
  wallcabinet: [
    { dim: 'width', key: 'widthUm', label: 'Width' },
    { dim: 'height', key: 'heightUm', label: 'Height' },
    { dim: 'depth', key: 'depthUm', label: 'Depth' },
    { dim: 'mount_height', key: 'mountHeightUm', label: 'Mount height', hint: 'Underside above the floor.' },
  ],
  tallcabinet: [
    { dim: 'width', key: 'widthUm', label: 'Width' },
    { dim: 'height', key: 'heightUm', label: 'Height', hint: 'Floor to top, incl. plinth.' },
    { dim: 'depth', key: 'depthUm', label: 'Depth' },
    { dim: 'plinth', key: 'plinthUm', label: 'Plinth' },
    { dim: 'split', key: 'splitUm', label: 'Door split', hint: 'Top of the lower doors; 0 = full-height doors.' },
  ],
};

const LIMITS = { basecabinet: BASE_CABINET_LIMITS, wallcabinet: WALL_CABINET_LIMITS, tallcabinet: TALL_CABINET_LIMITS } as const;

/** Dimension fields for kitchen units; every edit goes through the scene tools (same rules as AI). */
export function KitchenDimensions({ f }: { f: KitchenItem }) {
  const tool = useTool(f.id);
  const limits = LIMITS[f.kind] as Record<string, { min: number; max: number }>;
  const env = envelope(f);
  const params = f.params as unknown as Record<string, number>;
  return (
    <div className="section">
      <h3>Dimensions</h3>
      {[...ROWS[f.kind], ...(f.kind === 'basecabinet' && f.params.blindUm ? [{ dim: 'blind', key: 'blindUm', label: 'Blind width', hint: 'Fixed panel that tucks behind the adjoining run.' }] : [])].map((r) => (
        <MmField
          key={r.key}
          label={r.label}
          value={params[r.key]}
          min={limits[r.key].min / 1000}
          max={limits[r.key].max / 1000}
          hint={r.hint}
          testId={r.dim === 'width' ? 'furn-width' : `furn-${r.dim}`}
          onCommit={(v) => tool({ tool: 'set_dimension', args: { dimension: r.dim, valueMm: v / 1000 } }, `Change ${r.label.toLowerCase()}`)}
        />
      ))}
      <div className="field-hint num">
        {f.kind === 'basecabinet' && `Counter height ${fmtMm(counterHeightUm(f.params))} mm · `}
        Envelope {fmtMm(env.widthUm)} × {fmtMm(env.depthUm)} × {fmtMm(env.heightUm - env.zMinUm)} mm{env.zMinUm > 0 ? `, from ${fmtMm(env.zMinUm)} mm` : ''}
      </div>
    </div>
  );
}

export function KitchenConstruction({ f }: { f: KitchenItem }) {
  const project = useStudio((s) => s.project);
  const tool = useTool(f.id);
  const [err, setErr] = useState<string | null>(null);
  const resolved = resolveParametric(f, project.rulePack);
  const setFront = (v: string) => setErr(tool({ tool: 'set_parameter', args: { parameter: 'front', value: v } }, 'Change front'));
  const count = (parameter: string, label: string) => (v: number) => tool({ tool: 'set_parameter', args: { parameter, value: String(v) } }, `Change ${label.toLowerCase()}`);
  const lim = LIMITS[f.kind] as Record<string, { min: number; max: number }>;
  const setCorner = (v: string) => setErr(tool({ tool: 'set_parameter', args: { parameter: 'corner', value: v } }, 'Change corner'));
  const setCutout = (v: string) => setErr(tool({ tool: 'set_parameter', args: { parameter: 'cutout', value: v } }, 'Change worktop cut-out'));
  const showDoors = f.kind === 'tallcabinet' || f.params.front === 'doors';
  return (
    <div className="section">
      <h3>Construction</h3>
      {f.kind === 'basecabinet' && <SelectField label="Front" value={f.params.front} options={[{ value: 'doors', label: 'Doors + shelves' }, { value: 'drawers', label: 'Drawer stack' }]} onChange={setFront} />}
      {f.kind === 'basecabinet' && <SelectField label="Corner" value={f.params.blindUm ? (f.params.blindSide ?? 'left') : 'none'} options={[{ value: 'none', label: 'Ordinary unit' }, { value: 'left', label: 'Blind corner — panel left' }, { value: 'right', label: 'Blind corner — panel right' }]} onChange={setCorner} />}
      {f.kind === 'basecabinet' && <SelectField label="Worktop cut-out" value={f.params.cutout ?? 'none'} options={[{ value: 'none', label: 'None' }, { value: 'sink', label: 'Sink' }, { value: 'hob', label: 'Hob' }]} onChange={setCutout} />}
      {f.kind === 'wallcabinet' && <SelectField label="Front" value={f.params.front} options={[{ value: 'doors', label: 'Doors' }, { value: 'flap', label: 'Lift-up flap' }, { value: 'open', label: 'Open shelves' }]} onChange={setFront} />}
      {err && <div className="field-error" role="alert">{err}</div>}
      {showDoors && <IntField label="Doors" value={f.params.doorCount} min={lim.doorCount.min} max={lim.doorCount.max} onCommit={count('doorCount', 'Doors')} />}
      {f.kind === 'basecabinet' && f.params.front === 'drawers' ? (
        <IntField label="Drawers" value={f.params.drawerCount} min={lim.drawerCount.min} max={lim.drawerCount.max} onCommit={count('drawerCount', 'Drawers')} />
      ) : (
        <IntField label="Shelves" value={f.params.shelfCount} min={lim.shelfCount.min} max={lim.shelfCount.max} onCommit={count('shelfCount', 'Shelves')} />
      )}
      <div className="field-hint num">
        {resolved.parts.length} parts · {resolved.hardware.reduce((n, h) => n + h.qty, 0)} hardware items
      </div>
    </div>
  );
}

function RunButtons({ buttons }: { buttons: { label: string; call: ToolCall; title: string }[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const readOnly = useStudio((s) => s.readOnly);
  if (readOnly) return null;
  return (
    <>
      <div className="btn-row run-btns">
        {buttons.map((b) => (
          <button
            key={b.label}
            className="btn"
            title={b.title}
            onClick={() => {
              const r = runSceneTools([b.call], b.label);
              setMsg(r.ok ? { ok: true, text: r.summaries.join(' ') } : { ok: false, text: r.error });
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      {msg && (
        <div className={msg.ok ? 'field-hint run-msg' : 'field-error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </div>
      )}
    </>
  );
}

/** Kitchen-run shortcuts for a selected unit: continue the run, or hang wall units above. */
export function KitchenRunActions({ f }: { f: KitchenItem }) {
  const type = f.kind === 'basecabinet' ? 'base' : f.kind === 'wallcabinet' ? 'wall' : 'tall';
  const buttons: { label: string; call: ToolCall; title: string }[] = [
    { label: 'Fill rest of wall', call: { tool: 'fill_wall', args: { type, wall: 'behind_selected' } }, title: `Add ${type} units along the free length of the wall behind this unit` },
    { label: 'Add beside', call: { tool: 'add_cabinet', args: { type } }, title: 'Add a matching unit to the right' },
  ];
  if (f.kind === 'basecabinet') buttons.push({ label: 'Wall unit above', call: { tool: 'add_cabinet', args: { type: 'wall' } }, title: 'Hang a wall cabinet of the same width above this unit' });
  return (
    <div className="section">
      <h3>Kitchen run</h3>
      <RunButtons buttons={buttons} />
    </div>
  );
}

/** For a selected wall: lay a run of kitchen units along its free length. */
export function WallRunActions({ wallId }: { wallId: string }) {
  return (
    <div className="section">
      <h3>Kitchen run</h3>
      <RunButtons
        key={wallId}
        buttons={[
          { label: 'Base units', call: { tool: 'fill_wall', args: { type: 'base', wall: 'selected' } }, title: 'Fill this wall with base cabinets, skipping doors and existing pieces' },
          { label: 'Wall units', call: { tool: 'fill_wall', args: { type: 'wall', wall: 'selected' } }, title: 'Fill this wall with wall cabinets, skipping doors, windows and existing pieces' },
          { label: 'Tall units', call: { tool: 'fill_wall', args: { type: 'tall', wall: 'selected' } }, title: 'Fill this wall with tall pantry units' },
        ]}
      />
      <div className="field-hint">Modules are sized from 900/800/600/450/300 mm and widened to close gaps exactly.</div>
    </div>
  );
}
