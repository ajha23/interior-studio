import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { finishById, FLOOR_FINISHES } from '@studio/core';
import { useStudio, type Selection } from './store';
import { isParametric, type FurnitureItem, type Opening, type Project } from '@studio/core';
import { fmtMm, mm, type Um } from '@studio/core';
import { envelope, resolveParametric } from '@studio/core';
import { bbox, footprint, inwardNormal, localToRoom, openingSegment, snapToWalls, wallGaps, type Vec } from '@studio/core';
import { severityById, useValidation } from './hooks';

const k = (v: Um) => v / 1000; // µm → drawing mm

/** Architectural dimension line with tick marks; `fs` is font size in drawing units. */
export function Dim({ a, b, label, fs, color = '#3b413e', side = -1 }: { a: Vec; b: Vec; label: string; fs: number; color?: string; side?: 1 | -1 }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const t = fs * 0.45;
  const tick = (p: Vec) => <line x1={p.x - (ux + uy) * t} y1={p.y - (uy - ux) * t} x2={p.x + (ux + uy) * t} y2={p.y + (uy - ux) * t} stroke={color} strokeWidth={fs * 0.09} />;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang > 90 || ang <= -90) ang += 180;
  const off = fs * 0.45 * side;
  const nx = -uy * off;
  const ny = ux * off;
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={fs * 0.06} />
      {tick(a)}
      {tick(b)}
      <text x={mx + nx} y={my + ny} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline={side < 0 ? 'auto' : 'hanging'} transform={`rotate(${ang} ${mx + nx} ${my + ny})`} fontFamily="IBM Plex Mono, monospace" paintOrder="stroke" stroke="var(--paper)" strokeWidth={fs * 0.25}>
        {label}
      </text>
    </g>
  );
}

function OpeningShape({ project, o, selected, fs }: { project: Project; o: Opening; selected: boolean; fs: number }) {
  const room = project.room;
  const T = k(room.wallThicknessUm);
  const [s0, e0] = openingSegment(room, o);
  const s = { x: k(s0.x), y: k(s0.y) };
  const e = { x: k(e0.x), y: k(e0.y) };
  const n = inwardNormal(o.wall);
  const out = { x: -n.x * T, y: -n.y * T };
  const color = selected ? 'var(--accent)' : '#2b302d';
  const gap = <polygon points={`${s.x},${s.y} ${e.x},${e.y} ${e.x + out.x},${e.y + out.y} ${s.x + out.x},${s.y + out.y}`} fill="var(--plan-floor)" stroke="none" />;
  if (o.kind === 'window') {
    const lines = [0.2, 0.5, 0.8].map((f) => (
      <line key={f} x1={s.x + out.x * f} y1={s.y + out.y * f} x2={e.x + out.x * f} y2={e.y + out.y * f} stroke={color} strokeWidth={f === 0.5 ? fs * 0.12 : fs * 0.07} />
    ));
    return (
      <g data-oid={o.id} style={{ cursor: 'pointer' }}>
        {gap}
        <polygon points={`${s.x},${s.y} ${e.x},${e.y} ${e.x + out.x},${e.y + out.y} ${s.x + out.x},${s.y + out.y}`} fill={selected ? 'rgba(36,71,61,.12)' : 'transparent'} stroke={color} strokeWidth={fs * 0.06} />
        {lines}
      </g>
    );
  }
  const hinge = o.hinge === 'start' ? s : e;
  const free = o.hinge === 'start' ? e : s;
  const w = k(o.widthUm);
  const leafEnd = { x: hinge.x + n.x * w, y: hinge.y + n.y * w };
  const sweep = (() => {
    const v1 = { x: free.x - hinge.x, y: free.y - hinge.y };
    const v2 = { x: leafEnd.x - hinge.x, y: leafEnd.y - hinge.y };
    return v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
  })();
  return (
    <g data-oid={o.id} style={{ cursor: 'pointer' }}>
      {gap}
      <path d={`M${free.x},${free.y} A${w},${w} 0 0 ${sweep} ${leafEnd.x},${leafEnd.y}`} fill={selected ? 'rgba(36,71,61,.08)' : 'none'} stroke={color} strokeWidth={fs * 0.06} strokeDasharray={`${fs * 0.4} ${fs * 0.3}`} />
      <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={fs * 0.16} />
      <polygon points={`${s.x},${s.y} ${e.x},${e.y} ${e.x + out.x},${e.y + out.y} ${s.x + out.x},${s.y + out.y}`} fill="transparent" stroke={selected ? color : 'none'} strokeWidth={fs * 0.08} />
    </g>
  );
}

function FurnitureShape({ project, f, selected, severity, fs }: { project: Project; f: FurnitureItem; selected: boolean; severity?: 'error' | 'warning'; fs: number }) {
  const poly = footprint(f);
  const pts = poly.map((v) => `${k(v.x)},${k(v.y)}`).join(' ');
  const env = envelope(f);
  const P = (lx: Um, ly: Um) => {
    const v = localToRoom(f, lx, ly);
    return { x: k(v.x), y: k(v.y) };
  };
  const ln = (a: Vec, b: Vec, key: string, extra?: Record<string, unknown>) => <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3b413e" strokeWidth={fs * 0.05} {...extra} />;
  const details: ReactNode[] = [];
  let fill = '#e8e2d6';
  if (isParametric(f)) {
    const r = resolveParametric(f, project.rulePack);
    fill = finishById(f.materials.shutter).color;
    const fronts = r.parts.filter((p) => p.role === 'shutter' || p.role === 'drawer-front');
    const frontY = Math.min(...fronts.map((p) => p.box.y), env.depthUm);
    if (fronts.length) details.push(ln(P(0, frontY), P(env.widthUm, frontY), 'front'));
    r.parts.filter((p) => p.role === 'partition').forEach((p) => details.push(ln(P(p.box.x + p.box.w / 2, p.box.y), P(p.box.x + p.box.w / 2, p.box.y + p.box.d), p.key, { strokeDasharray: `${fs * 0.3} ${fs * 0.2}` })));
    r.modules.forEach((m, i) => {
      if (m.label === 'Hanging') details.push(ln(P(m.xUm + mm(40), frontY / 2), P(m.xUm + m.widthUm - mm(40), frontY / 2), `rod${i}`, { strokeWidth: fs * 0.1 }));
    });
  } else {
    fill = f.params.color;
    if (f.kind === 'bed') {
      const { widthUm: W } = env;
      details.push(ln(P(0, mm(60)), P(W, mm(60)), 'hb'));
      [mm(80), W / 2 + mm(40)].forEach((x, i) => {
        const a = P(x, mm(120));
        const b = P(x + W / 2 - mm(120), mm(120));
        const c = P(x + W / 2 - mm(120), mm(500));
        const d = P(x, mm(500));
        details.push(<polygon key={`p${i}`} points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} fill="#fff" stroke="#3b413e" strokeWidth={fs * 0.04} />);
      });
      details.push(ln(P(0, mm(900)), P(W, mm(1300)), 'sheet', { strokeOpacity: 0.4 }));
    }
    if (f.kind === 'sofa') {
      details.push(ln(P(mm(160), mm(200)), P(env.widthUm - mm(160), mm(200)), 'b'));
      details.push(ln(P(mm(160), mm(200)), P(mm(160), env.depthUm), 'al'));
      details.push(ln(P(env.widthUm - mm(160), mm(200)), P(env.widthUm - mm(160), env.depthUm), 'ar'));
    }
  }
  const c = poly.reduce((a, v) => ({ x: a.x + k(v.x) / 4, y: a.y + k(v.y) / 4 }), { x: 0, y: 0 });
  const stroke = severity === 'error' ? 'var(--error)' : selected ? 'var(--accent)' : severity === 'warning' ? 'var(--warn)' : '#2b302d';
  return (
    <g data-fid={f.id} style={{ cursor: 'move' }}>
      <polygon points={pts} fill={fill} fillOpacity={0.55} stroke={stroke} strokeWidth={selected ? fs * 0.2 : fs * 0.1} />
      {details}
      <text x={c.x} y={c.y - fs * 0.15} fontSize={fs * 1.05} textAnchor="middle" fill="#1f2522" fontWeight={600} pointerEvents="none" paintOrder="stroke" stroke="rgba(255,253,248,.85)" strokeWidth={fs * 0.3}>
        {f.name}
      </text>
      <text x={c.x} y={c.y + fs * 1.1} fontSize={fs * 0.9} textAnchor="middle" fill="#4b524e" fontFamily="IBM Plex Mono, monospace" pointerEvents="none" paintOrder="stroke" stroke="rgba(255,253,248,.85)" strokeWidth={fs * 0.3}>
        {fmtMm(env.widthUm)} × {fmtMm(env.depthUm)}
      </text>
    </g>
  );
}

export function PlanDrawing({ project, selection, override, fs, interactive = true }: { project: Project; selection: Selection; override?: FurnitureItem | null; fs: number; interactive?: boolean }) {
  const results = useValidation();
  const sev = useMemo(() => severityById(results), [results]);
  const room = project.room;
  const W = k(room.widthUm);
  const D = k(room.depthUm);
  const T = k(room.wallThicknessUm);
  const floor = FLOOR_FINISHES.find((x) => x.id === room.floorFinish)?.color ?? '#eee';
  const items = project.furniture.map((f) => (override && f.id === override.id ? override : f));
  const sel = selection?.kind === 'furniture' ? items.find((f) => f.id === selection.id) : null;
  const selOpening = selection?.kind === 'opening' ? project.openings.find((o) => o.id === selection.id) : null;
  const dimOff = fs * 3.2;

  const gapDims: ReactNode[] = [];
  if (sel && Math.round(sel.rotDeg) % 90 === 0) {
    const g = wallGaps(sel, room);
    const b = { minX: k(g.box.minX), maxX: k(g.box.maxX), minY: k(g.box.minY), maxY: k(g.box.maxY) };
    const cy = (b.minY + b.maxY) / 2;
    const cx = (b.minX + b.maxX) / 2;
    const col = 'var(--accent)';
    if (g.west > mm(1)) gapDims.push(<Dim key="w" a={{ x: 0, y: cy }} b={{ x: b.minX, y: cy }} label={fmtMm(g.west)} fs={fs} color={col} />);
    if (g.east > mm(1)) gapDims.push(<Dim key="e" a={{ x: b.maxX, y: cy }} b={{ x: W, y: cy }} label={fmtMm(g.east)} fs={fs} color={col} />);
    if (g.north > mm(1)) gapDims.push(<Dim key="n" a={{ x: cx, y: 0 }} b={{ x: cx, y: b.minY }} label={fmtMm(g.north)} fs={fs} color={col} />);
    if (g.south > mm(1)) gapDims.push(<Dim key="s" a={{ x: cx, y: b.maxY }} b={{ x: cx, y: D }} label={fmtMm(g.south)} fs={fs} color={col} />);
  }
  if (selOpening) {
    const [s0] = openingSegment(room, selOpening);
    const start = selOpening.wall === 'N' || selOpening.wall === 'S' ? { x: 0, y: k(s0.y) } : { x: k(s0.x), y: 0 };
    const n = inwardNormal(selOpening.wall);
    const shift = { x: n.x * fs * 1.6, y: n.y * fs * 1.6 };
    const a = { x: start.x + shift.x, y: start.y + shift.y };
    const b = { x: k(s0.x) + shift.x, y: k(s0.y) + shift.y };
    if (selOpening.offsetUm > 0) gapDims.push(<Dim key="o" a={a} b={b} label={fmtMm(selOpening.offsetUm)} fs={fs} color="var(--accent)" side={1} />);
  }

  const gridLines: ReactNode[] = [];
  for (let x = 500; x < W; x += 500) gridLines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={D} />);
  for (let y = 500; y < D; y += 500) gridLines.push(<line key={`gy${y}`} x1={0} y1={y} x2={W} y2={y} />);

  return (
    <g>
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width={fs * 0.9} height={fs * 0.9} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={fs * 0.9} stroke="#5c625e" strokeWidth={fs * 0.12} />
        </pattern>
      </defs>
      <rect x={-T} y={-T} width={W + 2 * T} height={D + 2 * T} fill="url(#hatch)" stroke="var(--plan-wall)" strokeWidth={fs * 0.12} />
      <rect data-room="1" x={0} y={0} width={W} height={D} fill="var(--plan-floor)" stroke="var(--plan-wall)" strokeWidth={fs * 0.12} />
      <rect x={0} y={0} width={W} height={D} fill={floor} fillOpacity={0.18} pointerEvents="none" />
      <g stroke="#cfc8bb" strokeWidth={fs * 0.04} pointerEvents="none">{gridLines}</g>
      {project.openings.map((o) => (
        <OpeningShape key={o.id} project={project} o={o} selected={selOpening?.id === o.id} fs={fs} />
      ))}
      {items.map((f) => (
        <FurnitureShape key={f.id} project={project} f={f} selected={sel?.id === f.id} severity={sev.get(f.id)} fs={fs} />
      ))}
      <Dim a={{ x: 0, y: -T - dimOff }} b={{ x: W, y: -T - dimOff }} label={fmtMm(room.widthUm)} fs={fs * 1.1} />
      <Dim a={{ x: -T - dimOff, y: D }} b={{ x: -T - dimOff, y: 0 }} label={fmtMm(room.depthUm)} fs={fs * 1.1} />
      {gapDims}
      {!interactive && (
        <text x={W + T} y={D + T + dimOff} fontSize={fs} textAnchor="end" fill="#4b524e">
          Ceiling {fmtMm(room.ceilingUm)} · Walls {fmtMm(room.wallThicknessUm)} · all dimensions mm
        </text>
      )}
    </g>
  );
}

interface VB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function PlanView() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const dispatch = useStudio((s) => s.dispatch);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [vb, setVb] = useState<VB | null>(null);
  const [override, setOverride] = useState<FurnitureItem | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ mode: 'move' | 'pan'; id?: string; start: Vec; origin: Vec; moved: boolean; target: 'room' | 'none' | 'item'; screen: Vec } | null>(null);

  const fit = useCallback(() => {
    const T = k(project.room.wallThicknessUm);
    const pad = 900;
    const W = k(project.room.widthUm) + 2 * T + pad * 2;
    const D = k(project.room.depthUm) + 2 * T + pad * 2;
    const aspect = size.w / Math.max(1, size.h);
    let w = W;
    let h = W / aspect;
    if (h < D) {
      h = D;
      w = D * aspect;
    }
    const cx = k(project.room.widthUm) / 2;
    const cy = k(project.room.depthUm) / 2;
    setVb({ x: cx - w / 2, y: cy - h / 2, w, h });
  }, [project.room.widthUm, project.room.depthUm, project.room.wallThicknessUm, size.w, size.h]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fit();
  }, [fit]);

  const view = vb ?? { x: -1000, y: -1000, w: 6000, h: 5000 };
  const pxPerMm = size.w / view.w;
  const fs = 11 / pxPerMm;

  const toWorld = (cx: number, cy: number): Vec => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const m = el.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const t = e.target as Element;
    const fEl = t.closest('[data-fid]');
    const oEl = t.closest('[data-oid]');
    const w = toWorld(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (fEl && e.button === 0) {
      const id = fEl.getAttribute('data-fid')!;
      const f = project.furniture.find((x) => x.id === id)!;
      select({ kind: 'furniture', id });
      drag.current = { mode: 'move', id, start: w, origin: { x: f.xUm, y: f.yUm }, moved: false, target: 'item', screen: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (oEl && e.button === 0) {
      select({ kind: 'opening', id: oEl.getAttribute('data-oid')! });
      drag.current = null;
      return;
    }
    drag.current = { mode: 'pan', start: { x: e.clientX, y: e.clientY }, origin: { x: view.x, y: view.y }, moved: false, target: t.closest('[data-room]') ? 'room' : 'none', screen: { x: e.clientX, y: e.clientY } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.mode === 'pan') {
      setPanning(true);
      const dx = (e.clientX - d.start.x) / pxPerMm;
      const dy = (e.clientY - d.start.y) / pxPerMm;
      setVb({ ...view, x: d.origin.x - dx, y: d.origin.y - dy });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const f = project.furniture.find((x) => x.id === d.id);
    if (!f) return;
    let cand: FurnitureItem = { ...f, xUm: Math.round(d.origin.x + mm(w.x - d.start.x)), yUm: Math.round(d.origin.y + mm(w.y - d.start.y)) };
    if (!e.shiftKey) {
      const snapped = snapToWalls(cand, project.room, mm(Math.max(60, 12 / pxPerMm)), mm(10));
      cand = { ...cand, xUm: snapped.x, yUm: snapped.y };
    }
    setOverride(cand);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (!d) return;
    if (d.mode === 'move' && d.moved && override) {
      const f = project.furniture.find((x) => x.id === d.id);
      if (f && (f.xUm !== override.xUm || f.yUm !== override.yUm)) dispatch({ type: 'furniture.update', id: f.id, patch: { xUm: override.xUm, yUm: override.yUm } }, `Move ${f.name}`);
    }
    if (d.mode === 'pan' && !d.moved) select(d.target === 'room' ? { kind: 'room' } : null);
    setOverride(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    const factor = Math.exp(e.deltaY * 0.0015);
    const nw = Math.min(40000, Math.max(400, view.w * factor));
    const s = nw / view.w;
    setVb({ x: w.x - (w.x - view.x) * s, y: w.y - (w.y - view.y) * s, w: nw, h: view.h * s });
  };

  const selItem = selection?.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id) : null;
  const bb = override ? bbox(footprint(override)) : null;

  return (
    <div className="view" ref={wrap}>
      <div className="view-label">Plan · mm</div>
      <div className="view-tools">
        <button className="btn" onClick={fit} title="Zoom to fit">Fit</button>
      </div>
      <svg
        ref={svg}
        className={`plan-svg ${panning ? 'panning' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <PlanDrawing project={project} selection={selection} override={override} fs={fs} />
      </svg>
      <div className="zoom-ind">
        {override && bb ? `x ${fmtMm(override.xUm)} · y ${fmtMm(override.yUm)} · hold Shift to disable snap` : selItem ? `${selItem.name} · drag to move · arrows nudge 10 mm` : `1 px = ${(1 / pxPerMm).toFixed(1)} mm`}
      </div>
    </div>
  );
}
