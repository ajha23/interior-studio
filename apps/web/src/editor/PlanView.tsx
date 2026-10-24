import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  area,
  bbox,
  detectRooms,
  endpointsAt,
  envelope,
  finishById,
  fmtMm,
  footprint,
  interiorPoint,
  isParametric,
  localToRoom,
  mm,
  nearestWall,
  newOpening,
  newRoomInfo,
  openingSpan,
  orthoLock,
  rectWalls,
  resolveParametric,
  sideOf,
  snapPoint,
  snapToWalls,
  uid,
  wallBody,
  wallGaps,
  wallGeom,
  wallLength,
  wallPoint,
  type Command,
  type DetectedRoom,
  type FurnitureItem,
  type Opening,
  type Plan,
  type Project,
  type Um,
  type Vec,
  type Wall,
} from '@studio/core';
import { libraryPrims, materialById, catalogById, wallFaceFinish, type LibraryItem } from '@studio/core';
import { useStudio, type Selection, type Tool } from './store';
import { patternUrl, tileMm } from '../materials/patterns';
import { paintCommand } from './paint';
import { severityById, useRooms, useValidation } from './hooks';

const k = (v: Um) => v / 1000; // µm → drawing mm
const K = (v: Vec): Vec => ({ x: k(v.x), y: k(v.y) });
const pts = (p: Vec[]) => p.map((v) => `${k(v.x)},${k(v.y)}`).join(' ');

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

function OpeningShape({ plan, o, selected, fs, ghost = false }: { plan: Plan; o: Opening; selected: boolean; fs: number; ghost?: boolean }) {
  const sp = openingSpan(plan, o);
  if (!sp) return null;
  const t = sp.wall.thicknessUm / 2;
  const P = (along: number, off: number) => K(wallPoint(sp.g, along, off));
  const a0 = o.offsetUm;
  const a1 = o.offsetUm + o.widthUm;
  const cut = [P(a0, t), P(a1, t), P(a1, -t), P(a0, -t)];
  const cutPts = cut.map((v) => `${v.x},${v.y}`).join(' ');
  const color = ghost ? 'var(--accent-2)' : selected ? 'var(--accent)' : '#2b302d';
  const gap = <polygon points={cutPts} fill="var(--plan-floor)" stroke="none" />;
  if (o.kind === 'window') {
    const lines = [-0.6, 0, 0.6].map((f) => {
      const p = P(a0, f * t);
      const q = P(a1, f * t);
      return <line key={f} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={color} strokeWidth={f === 0 ? fs * 0.12 : fs * 0.07} />;
    });
    return (
      <g data-oid={ghost ? undefined : o.id} style={{ cursor: 'pointer' }} opacity={ghost ? 0.7 : 1}>
        {gap}
        <polygon points={cutPts} fill={selected ? 'rgba(36,71,61,.12)' : 'transparent'} stroke={color} strokeWidth={fs * 0.06} />
        {lines}
      </g>
    );
  }
  const face = o.side * t;
  const hingeAlong = o.hinge === 'start' ? a0 : a1;
  const freeAlong = o.hinge === 'start' ? a1 : a0;
  const hinge = P(hingeAlong, face);
  const free = P(freeAlong, face);
  const w = k(o.widthUm);
  const leafEnd = P(hingeAlong, face + o.side * o.widthUm);
  const v1 = { x: free.x - hinge.x, y: free.y - hinge.y };
  const v2 = { x: leafEnd.x - hinge.x, y: leafEnd.y - hinge.y };
  const sweep = v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
  return (
    <g data-oid={ghost ? undefined : o.id} style={{ cursor: 'pointer' }} opacity={ghost ? 0.7 : 1}>
      {gap}
      <path d={`M${free.x},${free.y} A${w},${w} 0 0 ${sweep} ${leafEnd.x},${leafEnd.y}`} fill={selected ? 'rgba(36,71,61,.08)' : 'none'} stroke={color} strokeWidth={fs * 0.06} strokeDasharray={`${fs * 0.4} ${fs * 0.3}`} />
      <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={fs * 0.16} />
      <polygon points={cutPts} fill="transparent" stroke={selected || ghost ? color : 'none'} strokeWidth={fs * 0.08} />
    </g>
  );
}

function FurnitureShape({ project, f, selected, severity, fs }: { project: Project; f: FurnitureItem; selected: boolean; severity?: 'error' | 'warning'; fs: number }) {
  const poly = footprint(f);
  const env = envelope(f);
  const P = (lx: Um, ly: Um) => K(localToRoom(f, lx, ly));
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
  } else if (f.kind === 'library') {
    fill = materialById(f.materials.main).color;
    details.push(...libraryTopView(f, P, fs));
  } else if (f.kind === 'model') {
    fill = '#cfc8bc';
    details.push(ln(P(0, 0), P(env.widthUm, env.depthUm), 'x1', { strokeOpacity: 0.4 }), ln(P(env.widthUm, 0), P(0, env.depthUm), 'x2', { strokeOpacity: 0.4 }));
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
      <polygon points={pts(poly)} fill={fill} fillOpacity={f.kind === 'library' ? 0.12 : 0.55} stroke={stroke} strokeWidth={selected ? fs * 0.2 : fs * 0.1} strokeDasharray={f.kind === 'library' && catalogById(f.ref)?.mount === 'ceiling' ? `${fs * 0.6} ${fs * 0.35}` : undefined} />
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

/** Numbered comment markers; resolved threads fade. */
function CommentPins({ fs }: { fs: number }) {
  const pins = useStudio((s) => s.commentPins);
  const focused = useStudio((s) => s.focusedComment);
  const clientView = useStudio((s) => s.clientView);
  if (clientView || !pins.length) return null;
  const r = fs * 1.1;
  return (
    <g>
      {pins.map((p) => (
        <g key={p.id} data-cid={p.id} style={{ cursor: 'pointer' }} opacity={p.resolved ? 0.4 : 1} transform={`translate(${k(p.x)} ${k(p.y)})`}>
          <path d={`M0 0 L${-r * 0.7} ${-r * 1.2} A${r} ${r} 0 1 1 ${r * 0.7} ${-r * 1.2} Z`} fill={focused === p.id ? 'var(--brass)' : 'var(--accent)'} stroke="#fff" strokeWidth={fs * 0.12} />
          <text x={0} y={-r * 1.9} fontSize={fs * 1.0} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={700} pointerEvents="none">{p.n}</text>
        </g>
      ))}
    </g>
  );
}

/** Top view of a catalogue piece: each part drawn from below to above so higher parts sit on top. */
function libraryTopView(f: LibraryItem, P: (lx: Um, ly: Um) => Vec, fs: number): ReactNode[] {
  const prims = libraryPrims(f)
    .filter((p) => p.w * p.d > mm(30) * mm(30))
    .sort((a, b) => a.z + a.h - (b.z + b.h));
  return prims.map((p) => {
    let ring: Vec[];
    if (p.shape === 'box') ring = [P(p.x, p.y), P(p.x + p.w, p.y), P(p.x + p.w, p.y + p.d), P(p.x, p.y + p.d)];
    else {
      ring = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        ring.push(P(p.x + p.w / 2 + (Math.cos(a) * p.w) / 2, p.y + p.d / 2 + (Math.sin(a) * p.d) / 2));
      }
    }
    return <polygon key={p.key} points={ring.map((v) => `${v.x},${v.y}`).join(' ')} fill={p.material.color} fillOpacity={p.tone === 'glass' ? 0.25 : 0.7} stroke="#3b413e" strokeOpacity={0.55} strokeWidth={fs * 0.04} />;
  });
}

/** SVG <pattern>s for patterned materials, sized to real-world mm. */
export function MaterialPatterns({ ids }: { ids: string[] }) {
  return (
    <defs>
      {ids.map((id) => {
        const m = materialById(id, 'floor');
        if (m.pattern === 'plain') return null;
        const t = tileMm(m);
        return (
          <pattern key={id} id={`mat-${m.id}`} patternUnits="userSpaceOnUse" width={t} height={t}>
            <image href={patternUrl(m.id)} width={t} height={t} preserveAspectRatio="none" />
          </pattern>
        );
      })}
    </defs>
  );
}

/** Plan extent (wall bodies), in µm. */
export function planBounds(plan: Plan) {
  if (!plan.walls.length) return { minX: 0, minY: 0, maxX: mm(4000), maxY: mm(3000) };
  return bbox(plan.walls.flatMap((w) => wallBody(w, plan)));
}

export interface PlanPreview {
  /** Wall being drawn, from → to (µm). */
  wall?: { from: Vec; to: Vec; thickness: Um };
  /** Rectangle being dragged with the room tool (clear floor). */
  rect?: { a: Vec; b: Vec };
  /** Door/window being placed. */
  opening?: Opening;
  /** Snap target marker. */
  snap?: Vec | null;
}

export function PlanDrawing({
  project,
  plan,
  rooms,
  selection,
  override,
  preview,
  fs,
  interactive = true,
}: {
  project: Project;
  plan?: Plan;
  rooms?: DetectedRoom[];
  selection: Selection;
  override?: FurnitureItem | null;
  preview?: PlanPreview;
  fs: number;
  interactive?: boolean;
}) {
  const results = useValidation();
  const sev = useMemo(() => severityById(results), [results]);
  const pl = plan ?? project.plan;
  const rs = useMemo(() => rooms ?? detectRooms(pl), [rooms, pl]);
  const items = project.furniture.map((f) => (override && f.id === override.id ? override : f));
  const sel = selection?.kind === 'furniture' ? items.find((f) => f.id === selection.id) : null;
  const selOpening = selection?.kind === 'opening' ? project.openings.find((o) => o.id === selection.id) : null;
  const selWall = selection?.kind === 'wall' ? pl.walls.find((w) => w.id === selection.id) : null;
  const selRoom = selection?.kind === 'room' ? rs.find((r) => r.id === selection.id) : null;
  const b = planBounds(pl);
  const dimOff = fs * 3.2;
  const accent = 'var(--accent)';

  const extraDims: ReactNode[] = [];
  if (sel && Math.round(sel.rotDeg) % 90 === 0) {
    const g = wallGaps(sel, pl);
    const bx = { minX: k(g.box.minX), maxX: k(g.box.maxX), minY: k(g.box.minY), maxY: k(g.box.maxY) };
    const cy = (bx.minY + bx.maxY) / 2;
    const cx = (bx.minX + bx.maxX) / 2;
    if (g.to.west !== undefined && g.west > mm(1) && g.west < mm(6000)) extraDims.push(<Dim key="w" a={{ x: k(g.to.west), y: cy }} b={{ x: bx.minX, y: cy }} label={fmtMm(g.west)} fs={fs} color={accent} />);
    if (g.to.east !== undefined && g.east > mm(1) && g.east < mm(6000)) extraDims.push(<Dim key="e" a={{ x: bx.maxX, y: cy }} b={{ x: k(g.to.east), y: cy }} label={fmtMm(g.east)} fs={fs} color={accent} />);
    if (g.to.north !== undefined && g.north > mm(1) && g.north < mm(6000)) extraDims.push(<Dim key="n" a={{ x: cx, y: k(g.to.north) }} b={{ x: cx, y: bx.minY }} label={fmtMm(g.north)} fs={fs} color={accent} />);
    if (g.to.south !== undefined && g.south > mm(1) && g.south < mm(6000)) extraDims.push(<Dim key="s" a={{ x: cx, y: bx.maxY }} b={{ x: cx, y: k(g.to.south) }} label={fmtMm(g.south)} fs={fs} color={accent} />);
  }
  if (selWall) {
    const g = wallGeom(selWall);
    const off = selWall.thicknessUm / 2 + mm(fs * 1.8);
    extraDims.push(<Dim key="wl" a={K(wallPoint(g, 0, off))} b={K(wallPoint(g, g.len, off))} label={fmtMm(g.len)} fs={fs} color={accent} />);
  }
  if (selOpening) {
    const sp = openingSpan(pl, selOpening);
    if (sp) {
      const off = -selOpening.side * (sp.wall.thicknessUm / 2 + mm(fs * 1.6));
      if (selOpening.offsetUm > 0) extraDims.push(<Dim key="o" a={K(wallPoint(sp.g, 0, off))} b={K(wallPoint(sp.g, selOpening.offsetUm, off))} label={fmtMm(selOpening.offsetUm)} fs={fs} color={accent} />);
      const rest = sp.g.len - selOpening.offsetUm - selOpening.widthUm;
      if (rest > 0) extraDims.push(<Dim key="o2" a={K(wallPoint(sp.g, selOpening.offsetUm + selOpening.widthUm, off))} b={K(wallPoint(sp.g, sp.g.len, off))} label={fmtMm(rest)} fs={fs} color={accent} />);
    }
  }

  const gridLines: ReactNode[] = [];
  const gx0 = Math.floor(k(b.minX) / 500) * 500;
  const gy0 = Math.floor(k(b.minY) / 500) * 500;
  for (let x = gx0; x <= k(b.maxX); x += 500) gridLines.push(<line key={`gx${x}`} x1={x} y1={k(b.minY)} x2={x} y2={k(b.maxY)} />);
  for (let y = gy0; y <= k(b.maxY); y += 500) gridLines.push(<line key={`gy${y}`} x1={k(b.minX)} y1={y} x2={k(b.maxX)} y2={y} />);

  // Junction handles for the selected wall and walls meeting it.
  const handles: ReactNode[] = [];
  if (selWall && interactive) {
    for (const end of ['a', 'b'] as const) {
      const p = K(selWall[end]);
      handles.push(<circle key={end} data-end={`${selWall.id}:${end}`} cx={p.x} cy={p.y} r={fs * 0.7} fill="#fff" stroke={accent} strokeWidth={fs * 0.15} style={{ cursor: 'grab' }} />);
    }
  }

  return (
    <g>
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width={fs * 0.9} height={fs * 0.9} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={fs * 0.9} stroke="#5c625e" strokeWidth={fs * 0.12} />
        </pattern>
      </defs>
      <MaterialPatterns ids={[...new Set(rs.map((r) => materialById(r.info.floorFinish, 'floor').id))]} />
      {rs.map((r) => {
        const floor = materialById(r.info.floorFinish, 'floor');
        return (
          <g key={r.id}>
            <polygon data-room={r.id} points={pts(r.interior)} fill="var(--plan-floor)" stroke="none" />
            <polygon points={pts(r.interior)} fill={floor.pattern === 'plain' ? floor.color : `url(#mat-${floor.id})`} fillOpacity={selRoom?.id === r.id ? 0.6 : 0.38} stroke={selRoom?.id === r.id ? accent : 'none'} strokeWidth={fs * 0.15} pointerEvents="none" />
          </g>
        );
      })}
      <g stroke="#d8d1c4" strokeWidth={fs * 0.04} pointerEvents="none">{gridLines}</g>
      {pl.walls.map((w) => {
        const sevW = sev.get(w.id);
        const isSel = selWall?.id === w.id;
        return <polygon key={w.id} data-wid={w.id} points={pts(wallBody(w, pl))} fill="url(#hatch)" stroke={isSel ? accent : sevW === 'error' ? 'var(--error)' : 'var(--plan-wall)'} strokeWidth={isSel ? fs * 0.22 : fs * 0.1} style={{ cursor: interactive ? 'pointer' : undefined }} />;
      })}
      {pl.walls.flatMap((w) =>
        ([1, -1] as const).map((side) => {
          const id = wallFaceFinish(w, side);
          if (!id) return null;
          const g = wallGeom(w);
          const t0 = (side * w.thicknessUm) / 2;
          const t1 = side * (w.thicknessUm / 2 - Math.min(mm(40), w.thicknessUm / 3));
          const q = [wallPoint(g, 0, t0), wallPoint(g, g.len, t0), wallPoint(g, g.len, t1), wallPoint(g, 0, t1)];
          return <polygon key={`${w.id}${side}`} points={pts(q)} fill={materialById(id, 'wall').color} stroke="none" pointerEvents="none" />;
        }),
      )}
      {project.openings.map((o) => (
        <OpeningShape key={o.id} plan={pl} o={o} selected={selOpening?.id === o.id} fs={fs} />
      ))}
      {preview?.opening && <OpeningShape plan={pl} o={preview.opening} selected={false} fs={fs} ghost />}
      {rs.map((r) => {
        const c = K(interiorPoint(r.interior));
        return (
          <g key={`l${r.id}`} pointerEvents="none">
            <text x={c.x} y={c.y} fontSize={fs * 1.2} textAnchor="middle" fill="#6a706c" fontWeight={600} paintOrder="stroke" stroke="rgba(255,253,248,.8)" strokeWidth={fs * 0.3}>
              {r.info.name}
            </text>
            <text x={c.x} y={c.y + fs * 1.4} fontSize={fs * 0.95} textAnchor="middle" fill="#7c837f" fontFamily="IBM Plex Mono, monospace" paintOrder="stroke" stroke="rgba(255,253,248,.8)" strokeWidth={fs * 0.3}>
              {(area(r.interior) / 1e12).toFixed(2)} m²
            </text>
          </g>
        );
      })}
      {items.map((f) => (
        <FurnitureShape key={f.id} project={project} f={f} selected={sel?.id === f.id} severity={sev.get(f.id)} fs={fs} />
      ))}
      {pl.walls.length > 0 && (
        <>
          <Dim a={{ x: k(b.minX), y: k(b.minY) - dimOff }} b={{ x: k(b.maxX), y: k(b.minY) - dimOff }} label={fmtMm(b.maxX - b.minX)} fs={fs * 1.1} />
          <Dim a={{ x: k(b.minX) - dimOff, y: k(b.maxY) }} b={{ x: k(b.minX) - dimOff, y: k(b.minY) }} label={fmtMm(b.maxY - b.minY)} fs={fs * 1.1} />
        </>
      )}
      {extraDims}
      {handles}
      <CommentPins fs={fs} />
      {preview?.wall && (
        <g pointerEvents="none">
          <line x1={k(preview.wall.from.x)} y1={k(preview.wall.from.y)} x2={k(preview.wall.to.x)} y2={k(preview.wall.to.y)} stroke={accent} strokeWidth={k(preview.wall.thickness)} strokeOpacity={0.35} strokeLinecap="square" />
          <line x1={k(preview.wall.from.x)} y1={k(preview.wall.from.y)} x2={k(preview.wall.to.x)} y2={k(preview.wall.to.y)} stroke={accent} strokeWidth={fs * 0.1} strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} />
          {Math.hypot(preview.wall.to.x - preview.wall.from.x, preview.wall.to.y - preview.wall.from.y) > mm(50) && (
            <Dim a={K(preview.wall.from)} b={K(preview.wall.to)} label={fmtMm(Math.hypot(preview.wall.to.x - preview.wall.from.x, preview.wall.to.y - preview.wall.from.y))} fs={fs} color={accent} />
          )}
        </g>
      )}
      {preview?.rect && (
        <g pointerEvents="none">
          <rect x={k(Math.min(preview.rect.a.x, preview.rect.b.x))} y={k(Math.min(preview.rect.a.y, preview.rect.b.y))} width={k(Math.abs(preview.rect.b.x - preview.rect.a.x))} height={k(Math.abs(preview.rect.b.y - preview.rect.a.y))} fill="rgba(36,71,61,.08)" stroke={accent} strokeWidth={fs * 0.12} strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} />
          <text x={k((preview.rect.a.x + preview.rect.b.x) / 2)} y={k((preview.rect.a.y + preview.rect.b.y) / 2)} fontSize={fs * 1.1} textAnchor="middle" fill={accent} fontFamily="IBM Plex Mono, monospace" paintOrder="stroke" stroke="var(--paper)" strokeWidth={fs * 0.3}>
            {fmtMm(Math.abs(preview.rect.b.x - preview.rect.a.x))} × {fmtMm(Math.abs(preview.rect.b.y - preview.rect.a.y))}
          </text>
        </g>
      )}
      {preview?.snap && <circle cx={k(preview.snap.x)} cy={k(preview.snap.y)} r={fs * 0.55} fill="none" stroke={accent} strokeWidth={fs * 0.15} pointerEvents="none" />}
      {!interactive && (
        <text x={k(b.maxX)} y={k(b.maxY) + dimOff} fontSize={fs} textAnchor="end" fill="#4b524e">
          Walls {fmtMm(pl.defaultWallThicknessUm)} typ. · all dimensions mm
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

type Drag =
  | { mode: 'pan'; start: Vec; origin: Vec; moved: boolean; screen: Vec; target: Selection }
  | { mode: 'move'; id: string; start: Vec; origin: Vec; moved: boolean; screen: Vec }
  | { mode: 'junction'; ends: { wallId: string; end: 'a' | 'b' }[]; moved: boolean; screen: Vec }
  | { mode: 'wall'; id: string; start: Vec; moved: boolean; screen: Vec }
  | { mode: 'opening'; id: string; moved: boolean; screen: Vec }
  | { mode: 'rect'; a: Vec; moved: boolean; screen: Vec };

const TOOL_HINT: Record<Tool, string> = {
  select: 'Click to select · drag to move · drag a wall end to reshape',
  wall: 'Click to start a wall, click again to place it · Shift frees the angle · Esc or double-click to finish',
  room: 'Drag to draw a room (clear inside size)',
  door: 'Click a wall to place a door · click the other side of the wall to flip the swing',
  window: 'Click a wall to place a window',
  paint: 'Click a floor, a wall face or a piece to apply the material · Alt-click a piece for its accent · Esc to stop',
  comment: 'Click a piece or a spot in the plan to start a comment there · Esc to stop',
};

function movePlanEnds(plan: Plan, ends: { wallId: string; end: 'a' | 'b' }[], to: Vec): Plan {
  return { ...plan, walls: plan.walls.map((w) => ends.reduce((acc, e) => (e.wallId === w.id ? { ...acc, [e.end]: { x: Math.round(to.x), y: Math.round(to.y) } } : acc), w)) };
}

/** Walls whose end touches `w` (corners and T-junctions) — they stretch when `w` moves. */
function attachedEnds(plan: Plan, w: Wall): { wallId: string; end: 'a' | 'b' }[] {
  const g = wallGeom(w);
  const out: { wallId: string; end: 'a' | 'b' }[] = [];
  for (const o of plan.walls) {
    if (o.id === w.id) continue;
    for (const end of ['a', 'b'] as const) {
      const p = o[end];
      const rx = p.x - w.a.x;
      const ry = p.y - w.a.y;
      const along = rx * g.u.x + ry * g.u.y;
      const off = rx * g.n.x + ry * g.n.y;
      if (Math.abs(off) <= mm(1) && along >= -mm(1) && along <= g.len + mm(1)) out.push({ wallId: o.id, end });
    }
  }
  return out;
}

function wallUpdates(before: Plan, after: Plan): Command[] {
  const out: Command[] = [];
  for (const w of after.walls) {
    const old = before.walls.find((x) => x.id === w.id);
    if (!old) continue;
    const patch: Partial<Wall> = {};
    if (old.a.x !== w.a.x || old.a.y !== w.a.y) patch.a = w.a;
    if (old.b.x !== w.b.x || old.b.y !== w.b.y) patch.b = w.b;
    if (Object.keys(patch).length) out.push({ type: 'wall.update', id: w.id, patch });
  }
  return out;
}

export function PlanView() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const dispatch = useStudio((s) => s.dispatch);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const readOnly = useStudio((s) => s.readOnly);
  const rooms = useRooms();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [vb, setVb] = useState<VB | null>(null);
  const [override, setOverride] = useState<FurnitureItem | null>(null);
  const [draftPlan, setDraftPlan] = useState<Plan | null>(null);
  const [draftOpening, setDraftOpening] = useState<Opening | null>(null);
  const [preview, setPreview] = useState<PlanPreview>({});
  const [chain, setChain] = useState<Vec | null>(null); // wall tool: start of the next segment
  const [panning, setPanning] = useState(false);
  const drag = useRef<Drag | null>(null);
  const plan = draftPlan ?? project.plan;
  const draftRooms = useMemo(() => (draftPlan ? detectRooms(draftPlan) : rooms), [draftPlan, rooms]);

  const planRef = useRef(project.plan);
  planRef.current = project.plan;
  const fit = useCallback(() => {
    const b = planBounds(planRef.current);
    const pad = 1200;
    const W = k(b.maxX - b.minX) + pad * 2;
    const D = k(b.maxY - b.minY) + pad * 2;
    const aspect = size.w / Math.max(1, size.h);
    let w = W;
    let h = W / aspect;
    if (h < D) {
      h = D;
      w = D * aspect;
    }
    const cx = k(b.minX + b.maxX) / 2;
    const cy = k(b.minY + b.maxY) / 2;
    setVb({ x: cx - w / 2, y: cy - h / 2, w, h });
    // Auto-fit only when the canvas resizes or a different project loads — not on every edit.
  }, [size.w, size.h, project.id]);

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

  // Leaving a drawing tool clears its in-progress state.
  useEffect(() => {
    setChain(null);
    setPreview({});
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        if (chain) setChain(null);
        else if (tool !== 'select') setTool('select');
        setPreview({});
      }
      const shortcuts: Record<string, Tool> = { w: 'wall', m: 'room', d: 'door', n: 'window', v: 'select', c: 'comment' };
      const t = shortcuts[e.key.toLowerCase()];
      if (t && !e.metaKey && !e.ctrlKey && (!readOnly || t === 'comment' || t === 'select') && !useStudio.getState().clientView) setTool(t);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chain, tool, setTool, readOnly]);

  const view = vb ?? { x: -1000, y: -1000, w: 6000, h: 5000 };
  const pxPerMm = size.w / view.w;
  const fs = 11 / pxPerMm;
  const snapTol = mm(Math.max(80, 14 / pxPerMm));
  const grid = mm(pxPerMm > 0.4 ? 10 : 50);

  const toWorld = (cx: number, cy: number): Vec => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const m = el.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: mm(p.x), y: mm(p.y) }; // µm
  };

  /** Candidate door/window centred on the cursor along the nearest wall. */
  const openingAt = (p: Vec, kind: 'door' | 'window'): Opening | null => {
    const hit = nearestWall(project.plan, p, mm(400));
    if (!hit) return null;
    const proto = newOpening(kind, hit.wall.id, 0, sideOf(hit.geom, p));
    const len = wallLength(hit.wall);
    const width = Math.min(proto.widthUm, Math.max(mm(300), len - mm(100)));
    const offset = Math.round(Math.min(Math.max(hit.along - width / 2, 0), len - width) / mm(10)) * mm(10);
    return { ...proto, widthUm: width, offsetUm: offset };
  };

  const commitWall = (from: Vec, to: Vec) => {
    if (Math.hypot(to.x - from.x, to.y - from.y) < mm(100)) return false;
    const wall: Wall = { id: uid('wall'), a: { x: Math.round(from.x), y: Math.round(from.y) }, b: { x: Math.round(to.x), y: Math.round(to.y) }, thicknessUm: project.plan.defaultWallThicknessUm, heightUm: project.plan.defaultCeilingUm };
    dispatch({ type: 'wall.add', wall }, 'Draw wall');
    return true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const t = e.target as Element;
    const w = toWorld(e.clientX, e.clientY);
    const screen = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (e.button === 1) {
      drag.current = { mode: 'pan', start: screen, origin: { x: view.x, y: view.y }, moved: false, screen, target: null };
      return;
    }
    if (!readOnly && tool === 'wall') {
      const s = snapPoint(project.plan, w, snapTol, grid);
      if (!chain) {
        setChain(s.p);
        return;
      }
      const end = e.shiftKey || s.snapped ? s.p : orthoLock(chain, s.p);
      // Landing on an existing wall end closes the run; otherwise keep drawing from here.
      const closes = s.snapped && endpointsAt(project.plan, s.p).length > 0;
      if (commitWall(chain, end)) {
        if (closes) {
          setChain(null);
          setPreview({});
        } else setChain(end);
      }
      return;
    }
    if (!readOnly && tool === 'room') {
      const s = snapPoint(project.plan, w, snapTol, grid);
      drag.current = { mode: 'rect', a: s.p, moved: false, screen };
      return;
    }
    if (!readOnly && (tool === 'door' || tool === 'window')) {
      const o = openingAt(w, tool);
      if (o) {
        dispatch({ type: 'opening.add', opening: o }, `Add ${tool}`);
        select({ kind: 'opening', id: o.id });
        setTool('select');
      }
      return;
    }

    if (tool === 'comment') {
      const fEl = t.closest('[data-fid]');
      useStudio.getState().startComment(fEl ? { kind: 'item', itemId: fEl.getAttribute('data-fid')! } : { kind: 'point', x: Math.round(w.x), y: Math.round(w.y) });
      return;
    }
    if (!readOnly && tool === 'paint') {
      const fEl = t.closest('[data-fid]');
      const wEl = t.closest('[data-wid]');
      const rEl = t.closest('[data-room]');
      const st = useStudio.getState();
      const target = fEl
        ? ({ kind: 'furniture', id: fEl.getAttribute('data-fid')!, part: e.altKey ? 'accent' : 'main' } as const)
        : wEl
          ? (() => {
              const wall = project.plan.walls.find((x) => x.id === wEl.getAttribute('data-wid'))!;
              return { kind: 'wall', wallId: wall.id, side: sideOf(wallGeom(wall), w) } as const;
            })()
          : rEl
            ? ({ kind: 'floor', roomId: rEl.getAttribute('data-room')! } as const)
            : null;
      const res = target && paintCommand(project, rooms, target, st.paint);
      if (res) dispatch(res.cmd, res.label);
      return;
    }

    // Comment pins open their thread.
    const cEl = t.closest('[data-cid]');
    if (cEl) {
      const st = useStudio.getState();
      st.focusComment(cEl.getAttribute('data-cid'));
      st.requestPanel('comments');
      return;
    }

    // Select tool
    const endEl = t.closest('[data-end]');
    const fEl = t.closest('[data-fid]');
    const oEl = t.closest('[data-oid]');
    const wEl = t.closest('[data-wid]');
    const rEl = t.closest('[data-room]');
    if (endEl && !readOnly) {
      const [wallId, end] = endEl.getAttribute('data-end')!.split(':') as [string, 'a' | 'b'];
      const wall = project.plan.walls.find((x) => x.id === wallId)!;
      drag.current = { mode: 'junction', ends: endpointsAt(project.plan, wall[end]), moved: false, screen };
      return;
    }
    if (fEl) {
      const id = fEl.getAttribute('data-fid')!;
      const f = project.furniture.find((x) => x.id === id)!;
      select({ kind: 'furniture', id });
      drag.current = readOnly ? null : { mode: 'move', id, start: w, origin: { x: f.xUm, y: f.yUm }, moved: false, screen };
      return;
    }
    if (oEl) {
      const id = oEl.getAttribute('data-oid')!;
      select({ kind: 'opening', id });
      drag.current = readOnly ? null : { mode: 'opening', id, moved: false, screen };
      return;
    }
    if (wEl) {
      const id = wEl.getAttribute('data-wid')!;
      select({ kind: 'wall', id });
      drag.current = readOnly ? null : { mode: 'wall', id, start: w, moved: false, screen };
      return;
    }
    drag.current = { mode: 'pan', start: screen, origin: { x: view.x, y: view.y }, moved: false, screen, target: rEl ? { kind: 'room', id: rEl.getAttribute('data-room')! } : null };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    // Hover previews for drawing tools.
    if (!drag.current && !readOnly) {
      if (tool === 'wall') {
        const s = snapPoint(project.plan, w, snapTol, grid);
        const to = chain && !e.shiftKey && !s.snapped ? orthoLock(chain, s.p) : s.p;
        setPreview({ wall: chain ? { from: chain, to, thickness: project.plan.defaultWallThicknessUm } : undefined, snap: s.snapped ? s.p : null });
      } else if (tool === 'door' || tool === 'window') {
        setPreview({ opening: openingAt(w, tool) ?? undefined });
      } else if (tool === 'room') {
        const s = snapPoint(project.plan, w, snapTol, grid);
        setPreview({ snap: s.snapped ? s.p : null });
      }
    }
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) > 3) d.moved = true;
    if (!d.moved) return;
    switch (d.mode) {
      case 'pan': {
        setPanning(true);
        const dx = (e.clientX - d.start.x) / pxPerMm;
        const dy = (e.clientY - d.start.y) / pxPerMm;
        setVb({ ...view, x: d.origin.x - dx, y: d.origin.y - dy });
        return;
      }
      case 'move': {
        const f = project.furniture.find((x) => x.id === d.id);
        if (!f) return;
        let cand: FurnitureItem = { ...f, xUm: Math.round(d.origin.x + w.x - d.start.x), yUm: Math.round(d.origin.y + w.y - d.start.y) };
        if (!e.shiftKey) {
          const snapped = snapToWalls(cand, project.plan, mm(Math.max(60, 12 / pxPerMm)), mm(10));
          cand = { ...cand, xUm: snapped.x, yUm: snapped.y };
        }
        setOverride(cand);
        return;
      }
      case 'junction': {
        const exclude = new Set(d.ends.map((x) => x.wallId));
        const s = snapPoint(project.plan, w, snapTol, grid, exclude);
        setDraftPlan(movePlanEnds(project.plan, d.ends, s.p));
        setPreview({ snap: s.snapped ? s.p : null });
        return;
      }
      case 'wall': {
        const wall = project.plan.walls.find((x) => x.id === d.id);
        if (!wall) return;
        const g = wallGeom(wall);
        const raw = (w.x - d.start.x) * g.n.x + (w.y - d.start.y) * g.n.y;
        const off = e.shiftKey ? raw : Math.round(raw / grid) * grid;
        const shift = (p: Vec) => ({ x: Math.round(p.x + g.n.x * off), y: Math.round(p.y + g.n.y * off) });
        let next: Plan = { ...project.plan, walls: project.plan.walls.map((x) => (x.id === wall.id ? { ...x, a: shift(x.a), b: shift(x.b) } : x)) };
        for (const att of attachedEnds(project.plan, wall)) {
          const o = project.plan.walls.find((x) => x.id === att.wallId)!;
          next = movePlanEnds(next, [att], shift(o[att.end]));
        }
        setDraftPlan(next);
        return;
      }
      case 'opening': {
        const o = project.openings.find((x) => x.id === d.id);
        const wall = o && project.plan.walls.find((x) => x.id === o.wallId);
        if (!o || !wall) return;
        const g = wallGeom(wall);
        const along = (w.x - wall.a.x) * g.u.x + (w.y - wall.a.y) * g.u.y;
        const offset = Math.round(Math.min(Math.max(along - o.widthUm / 2, 0), g.len - o.widthUm) / mm(10)) * mm(10);
        setDraftOpening({ ...o, offsetUm: offset });
        return;
      }
      case 'rect': {
        const s = snapPoint(project.plan, w, snapTol, grid);
        setPreview({ rect: { a: d.a, b: s.p }, snap: s.snapped ? s.p : null });
        return;
      }
    }
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
    if ((d.mode === 'junction' || d.mode === 'wall') && d.moved && draftPlan) {
      const cmds = wallUpdates(project.plan, draftPlan);
      if (cmds.length) dispatch({ type: 'batch', label: d.mode === 'junction' ? 'Move wall corner' : 'Move wall', commands: cmds });
    }
    if (d.mode === 'opening' && d.moved && draftOpening) {
      const o = project.openings.find((x) => x.id === d.id);
      if (o && o.offsetUm !== draftOpening.offsetUm) dispatch({ type: 'opening.update', id: o.id, patch: { offsetUm: draftOpening.offsetUm } }, `Move ${o.kind}`);
    }
    if (d.mode === 'rect') {
      const r = preview.rect;
      if (r && Math.abs(r.b.x - r.a.x) >= mm(600) && Math.abs(r.b.y - r.a.y) >= mm(600)) {
        const x0 = Math.min(r.a.x, r.b.x);
        const y0 = Math.min(r.a.y, r.b.y);
        const wDim = Math.abs(r.b.x - r.a.x);
        const dDim = Math.abs(r.b.y - r.a.y);
        const walls = rectWalls(x0, y0, wDim, dDim, project.plan.defaultWallThicknessUm, project.plan.defaultCeilingUm);
        const names = new Set(rooms.map((r) => r.info.name));
        let n = rooms.length + 1;
        while (names.has(`Room ${n}`)) n++;
        const info = newRoomInfo(`Room ${n}`, { x: x0 + wDim / 2, y: y0 + dDim / 2 }, project.plan.defaultCeilingUm);
        dispatch({ type: 'batch', label: 'Draw room', commands: [...walls.map((wall): Command => ({ type: 'wall.add', wall })), { type: 'room.upsert', info }] });
        select({ kind: 'room', id: info.id });
        setTool('select');
      }
      setPreview({});
    }
    if (d.mode === 'pan' && !d.moved) select(d.target);
    setOverride(null);
    setDraftPlan(null);
    setDraftOpening(null);
    if (d.mode === 'junction') setPreview({});
  };

  const onDoubleClick = () => {
    if (tool === 'wall') {
      setChain(null);
      setPreview({});
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    const wx = k(w.x);
    const wy = k(w.y);
    const factor = Math.exp(e.deltaY * 0.0015);
    const nw = Math.min(80000, Math.max(400, view.w * factor));
    const s = nw / view.w;
    setVb({ x: wx - (wx - view.x) * s, y: wy - (wy - view.y) * s, w: nw, h: view.h * s });
  };

  const selItem = selection?.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id) : null;
  const drawProject = draftOpening ? { ...project, openings: project.openings.map((o) => (o.id === draftOpening.id ? draftOpening : o)) } : project;
  const tools: { t: Tool; label: string; key: string }[] = [
    { t: 'select', label: 'Select', key: 'V' },
    { t: 'wall', label: 'Wall', key: 'W' },
    { t: 'room', label: 'Room', key: 'M' },
    { t: 'door', label: 'Door', key: 'D' },
    { t: 'window', label: 'Window', key: 'N' },
    { t: 'comment', label: 'Comment', key: 'C' },
  ];

  return (
    <div className="view" ref={wrap}>
      <div className="view-label">Plan · mm</div>
      {!readOnly && (
        <div className="plan-tools" role="toolbar" aria-label="Plan tools">
          {tools.map((x) => (
            <button key={x.t} className={`btn ${tool === x.t ? 'on' : ''}`} onClick={() => setTool(x.t)} title={`${x.label} (${x.key})`} aria-pressed={tool === x.t}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      <div className="view-tools">
        <button className="btn" onClick={fit} title="Zoom to fit">Fit</button>
      </div>
      <svg
        ref={svg}
        className={`plan-svg ${panning ? 'panning' : ''} tool-${tool}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => !drag.current && setPreview((p) => ({ ...p, opening: undefined, snap: null }))}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      >
        <PlanDrawing project={drawProject} plan={plan} rooms={draftRooms} selection={selection} override={override} preview={preview} fs={fs} />
      </svg>
      <div className="zoom-ind">
        {override ? `x ${fmtMm(override.xUm)} · y ${fmtMm(override.yUm)} · hold Shift to disable snap` : tool !== 'select' ? TOOL_HINT[tool] : selItem ? `${selItem.name} · drag to move · arrows nudge 10 mm` : selection?.kind === 'wall' ? 'Drag the wall to move it · drag an end to reshape · Del deletes' : `${TOOL_HINT.select} · 1 px = ${(1 / pxPerMm).toFixed(1)} mm`}
      </div>
    </div>
  );
}
