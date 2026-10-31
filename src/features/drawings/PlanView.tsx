import { Maximize2, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import {
  allElements,
  deriveCountertops,
  elementLabel,
  executeCommand,
  placeOnWall,
  specOf,
  wallAxis,
  type DesignCommand,
  type KitchenElement,
  openingPlacement,
  OPENING_SPECS,
  wallLength,
  WALL_LABEL,
  WALLS,
  type Opening,
  type Room,
} from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { localToRoom } from '@/engine/geometry/transform';
import { formatLength } from '@/engine/measurement/units';
import { snapPlacement } from '@/engine/snapping/placement';
import { Button } from '@/components/ui/button';
import { useSelectedChecks } from '@/features/checks/useDesignChecks';
import { useEditorStore } from '@/state/editorStore';

const MARGIN = 700;
const SNAP_PX = 12;
const DRAG_THRESHOLD_PX = 4;

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; origin: ViewBox; moved: boolean }
  | { kind: 'move'; pointerId: number; startX: number; startY: number; el: KitchenElement; grab: { x: number; z: number }; moved: boolean; last: DesignCommand | null; valid: boolean }
  | { kind: 'opening'; pointerId: number; startX: number; startY: number; o: Opening; grab: number; moved: boolean; last: DesignCommand | null; valid: boolean };

/**
 * Dimensioned top-down plan drawn straight from the domain model (back wall at the top).
 * Wheel zooms at the cursor, dragging empty space pans, dragging a unit slides it along its wall
 * with snapping, double-click opens it in 3D.
 */
export function PlanView() {
  const project = useEditorStore((s) => s.project)!;
  const selectedId = useEditorStore((s) => s.selectedId);
  const preview = useEditorStore((s) => s.preview);
  const showGrid = useEditorStore((s) => s.showGrid);
  const { select, setPreview, dispatch, setView, requestCamera } = useEditorStore.getState();
  const shown = preview?.project ?? project;
  const fmt = (mm: number) => formatLength(mm, project.preferences.unit);
  const { width: W, length: L, wallThickness: T } = shown.room;
  const fit: ViewBox = useMemo(() => ({ x: -MARGIN, y: -MARGIN, w: project.room.width + 2 * MARGIN, h: project.room.length + 2 * MARGIN }), [project.room.width, project.room.length]);
  const [view, setViewBox] = useState<ViewBox | null>(null);
  const vb = view ?? fit;
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const slabs = useMemo(() => deriveCountertops(shown), [shown]);
  const isWallHung = (el: KitchenElement) => specOf(el).mount === 'wall';
  // Floor units first, wall-hung units on top (drawn dashed, as on a kitchen plan).
  const elements = useMemo(
    () => [...allElements(shown)].sort((a, b) => Number(isWallHung(a)) - Number(isWallHung(b))).map((el) => ({ el, box: elementBox(el), wallHung: isWallHung(el) })),
    [shown],
  );
  const selected = elements.find((e) => e.el.id === selectedId);
  const fill = (el: KitchenElement) => ('materialId' in el ? (shown.materials[el.materialId]?.color ?? '#ddd') : '#c8cbcf');

  /** Client pixels → plan millimetres. */
  const toPlan = (clientX: number, clientY: number) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const mmPerPixel = () => {
    const m = svg.current?.getScreenCTM();
    return m ? 1 / m.a : 1;
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const p = toPlan(clientX, clientY);
    const w = Math.min(40000, Math.max(400, vb.w * factor));
    const k = w / vb.w;
    setViewBox({ x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w, h: vb.h * k });
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>) => zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015));

  const startPan = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (gesture.current) return;
    svg.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: vb, moved: false };
  };

  const startMove = (el: KitchenElement) => (e: ReactPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(el.id);
    svg.current?.setPointerCapture(e.pointerId);
    const p = toPlan(e.clientX, e.clientY);
    gesture.current = { kind: 'move', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, el, grab: { x: el.position.x - p.x, z: el.position.z - p.y }, moved: false, last: null, valid: false };
  };

  const startOpening = (o: Opening) => (e: ReactPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(o.id);
    svg.current?.setPointerCapture(e.pointerId);
    const p = toPlan(e.clientX, e.clientY);
    const along = wallAxis(o.wallId) === 'x' ? p.x : p.y;
    gesture.current = { kind: 'opening', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, o, grab: along - o.offset, moved: false, last: null, valid: false };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD_PX) return;
    g.moved = true;
    if (g.kind === 'pan') {
      const k = mmPerPixel();
      setViewBox({ ...g.origin, x: g.origin.x - (e.clientX - g.startX) * k, y: g.origin.y - (e.clientY - g.startY) * k });
      return;
    }
    if (g.kind === 'opening') {
      // Slide along the wall: snap to the wall ends and neighbouring openings, else the 10 mm grid.
      const o = g.o;
      const p = toPlan(e.clientX, e.clientY);
      const raw = (wallAxis(o.wallId) === 'x' ? p.x : p.y) - g.grab;
      const len = wallLength(project.room, o.wallId);
      const tol = SNAP_PX * mmPerPixel();
      const candidates = [0, len - o.width, ...project.openings.filter((x) => x.id !== o.id && x.wallId === o.wallId).flatMap((x) => [x.offset - o.width, x.offset + x.width])];
      const near = candidates.filter((c) => Math.abs(c - raw) <= tol).sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw))[0];
      const offset = Math.max(0, Math.min(len - o.width, near ?? Math.round(raw / 10) * 10));
      const command: DesignCommand = { type: 'update_opening', id: o.id, offset };
      const dry = executeCommand(project, command);
      g.last = command;
      g.valid = dry.result.success;
      setPreview({ kind: 'move', id: o.id, readout: `↔ ${fmt(offset)} along the ${o.wallId} wall`, valid: dry.result.success, error: dry.result.errors[0] ?? null, project: dry.result.success ? dry.project : null, attempt: null });
      return;
    }
    const el = g.el;
    const p = toPlan(e.clientX, e.clientY);
    const snap = snapPlacement(project, el, p.x + g.grab.x, p.y + g.grab.z, SNAP_PX * mmPerPixel());
    const spec = specOf(el);
    const attempt: KitchenElement =
      snap.kind === 'wall'
        ? { ...el, wallId: snap.wallId, ...placeOnWall(project.room, snap.wallId, el.dimensions, snap.offset, spec.mount === 'wall' ? el.position.y : spec.elevation) }
        : { ...el, wallId: undefined, position: { x: snap.x, y: spec.elevation, z: snap.z }, rotationY: snap.rotationY };
    const b = elementBox(attempt);
    const where = snap.kind === 'wall' ? `↔ ${fmt(snap.offset)}` : `${fmt(b.minX)}, ${fmt(b.minZ)} from the left and back walls`;
    const dry = executeCommand(project, snap.command);
    g.last = snap.command;
    g.valid = dry.result.success;
    setPreview({ kind: 'move', id: el.id, readout: `${where}${snap.snappedTo ? ` · ${snap.snappedTo}` : ''}`, valid: dry.result.success, error: dry.result.errors[0] ?? null, project: dry.result.success ? dry.project : null, attempt });
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    svg.current?.releasePointerCapture(e.pointerId);
    if (g.kind === 'pan') {
      if (!g.moved) select(null);
      return;
    }
    if (g.moved) {
      setPreview(null);
      if (g.last && g.valid) dispatch(g.last);
    }
  };

  const ghost = preview && !preview.valid && preview.attempt ? elementBox(preview.attempt) : null;
  const checkZones = useSelectedChecks().flatMap((c) => (c.severity === 'warning' && c.zone ? [c.zone] : []));
  const zoomCentre = (factor: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };

  return (
    <div className="relative size-full">
      <svg
        ref={svg}
        role="img"
        aria-label={`Plan of ${shown.name}, ${W} by ${L} millimetres`}
        data-testid="plan-view"
        className="size-full touch-none select-none"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={startPan}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="plan-grid-minor" width={100} height={100} patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--foreground)" strokeOpacity={0.08} strokeWidth={2} />
          </pattern>
          <pattern id="plan-grid-major" width={1000} height={1000} patternUnits="userSpaceOnUse">
            <rect width={1000} height={1000} fill="url(#plan-grid-minor)" />
            <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="var(--foreground)" strokeOpacity={0.2} strokeWidth={4} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={W} height={L} fill={shown.materials[shown.surfaces.floor]?.color ?? '#eee'} opacity={0.35} />
        {showGrid && <rect data-testid="plan-grid" x={0} y={0} width={W} height={L} fill="url(#plan-grid-major)" pointerEvents="none" />}
        {WALLS.map((w) => {
          const band = w === 'back' ? { x: -T, y: -T, width: W + 2 * T, height: T } : w === 'front' ? { x: -T, y: L, width: W + 2 * T, height: T } : w === 'left' ? { x: -T, y: 0, width: T, height: L } : { x: W, y: 0, width: T, height: L };
          const isSel = selectedId === `wall-${w}`;
          return (
            <rect
              key={w}
              {...band}
              data-testid={`plan-wall-${w}`}
              role="button"
              aria-label={WALL_LABEL[w]}
              fill={isSel ? 'var(--highlight)' : 'var(--muted-foreground)'}
              opacity={isSel ? 0.75 : 0.35}
              className="cursor-pointer"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                select(`wall-${w}`);
              }}
            />
          );
        })}
        <rect x={0} y={0} width={W} height={L} fill="none" stroke="var(--foreground)" strokeWidth={6} />
        <line x1={0} y1={L} x2={W} y2={L} stroke="var(--background)" strokeWidth={10} strokeDasharray="60 40" />

        {slabs.map((s) => (
          <rect key={s.id} x={s.box.minX} y={s.box.minZ} width={s.box.maxX - s.box.minX} height={s.box.maxZ - s.box.minZ} fill={shown.materials[shown.surfaces.countertop]?.color ?? '#eee'} stroke="var(--muted-foreground)" strokeWidth={4} />
        ))}

        {elements.map(({ el, box, wallHung }) => {
          const w = box.maxX - box.minX;
          const h = box.maxZ - box.minZ;
          const isSel = el.id === selectedId;
          return (
            <g
              key={el.id}
              data-testid={`plan-element-${el.id}`}
              role="button"
              aria-label={elementLabel(el)}
              className={isSel ? 'cursor-move' : 'cursor-pointer'}
              onPointerDown={startMove(el)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                select(el.id);
                setView('3d');
                requestCamera({ kind: 'focus', id: el.id });
              }}
            >
              <rect
                x={box.minX}
                y={box.minZ}
                width={w}
                height={h}
                fill={wallHung ? 'transparent' : fill(el)}
                fillOpacity={wallHung ? 0 : 0.85}
                stroke={isSel ? 'var(--highlight)' : 'var(--foreground)'}
                strokeWidth={isSel ? 18 : 5}
                strokeDasharray={wallHung ? '40 25' : undefined}
                pointerEvents={wallHung ? 'stroke' : 'all'}
              />
              {!wallHung && (
                <text x={box.minX + w / 2} y={box.minZ + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(90, Math.max(50, Math.min(w, h) / 6))} fill="var(--foreground)" pointerEvents="none">
                  {formatLength(el.dimensions.width, shown.preferences.unit, shown.preferences.unit !== 'ft-in')}
                </text>
              )}
            </g>
          );
        })}

        {shown.openings.map((o) => (
          <OpeningMark key={o.id} o={o} room={shown.room} selected={o.id === selectedId} onPointerDown={startOpening(o)} />
        ))}

        {checkZones.map((z, i) => (
          <rect key={`zone${i}`} data-testid="check-zone" x={z.minX} y={z.minZ} width={z.maxX - z.minX} height={z.maxZ - z.minZ} fill="#f59e0b" fillOpacity={0.18} stroke="#d97706" strokeWidth={8} strokeDasharray="40 25" pointerEvents="none" />
        ))}

        {ghost && <rect x={ghost.minX} y={ghost.minZ} width={ghost.maxX - ghost.minX} height={ghost.maxZ - ghost.minZ} fill="#ef4444" fillOpacity={0.25} stroke="#ef4444" strokeWidth={10} strokeDasharray="30 20" pointerEvents="none" />}

        {/* Wall names, outside each wall. */}
        <g fontSize={90} fill="var(--muted-foreground)" pointerEvents="none" textAnchor="middle">
          <text x={W / 2} y={-T - 60}>{WALL_LABEL.back}</text>
          <text x={W / 2} y={L + T + 130}>{WALL_LABEL.front}</text>
          <text x={-T - 60} y={L / 2} transform={`rotate(-90 ${-T - 60} ${L / 2})`}>{WALL_LABEL.left}</text>
          <text x={W + T + 60} y={L / 2} transform={`rotate(90 ${W + T + 60} ${L / 2})`}>{WALL_LABEL.right}</text>
        </g>
        <DimensionLine x1={0} y1={-T - 220} x2={W} y2={-T - 220} label={fmt(W)} />
        <DimensionLine x1={-T - 220} y1={0} x2={-T - 220} y2={L} label={fmt(L)} vertical />
        {selected &&
          (wallAxis(selected.el.wallId ?? 'back') === 'x' ? (
            <DimensionLine x1={selected.box.minX} y1={L + T + 320} x2={selected.box.maxX} y2={L + T + 320} label={fmt(selected.el.dimensions.width)} highlight />
          ) : (
            <DimensionLine x1={W + T + 320} y1={selected.box.minZ} x2={W + T + 320} y2={selected.box.maxZ} label={fmt(selected.el.dimensions.width)} vertical highlight />
          ))}
      </svg>

      <div className="absolute top-3 left-3 flex items-center gap-0.5 rounded-lg border bg-card/95 p-1 shadow-sm" role="toolbar" aria-label="Plan navigation">
        <Button size="xs" variant="ghost" onClick={() => setViewBox(null)} title="Zoom extents" aria-label="Fit plan">
          <Maximize2 /> Fit
        </Button>
        <Button size="xs" variant="ghost" onClick={() => zoomCentre(0.8)} aria-label="Zoom in">
          <Plus />
        </Button>
        <Button size="xs" variant="ghost" onClick={() => zoomCentre(1.25)} aria-label="Zoom out">
          <Minus />
        </Button>
      </div>
      {preview && preview.kind !== 'candidate' && (
        <p role="status" className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs shadow ${preview.valid ? 'bg-foreground text-background' : 'bg-destructive text-white'}`} data-testid="plan-readout">
          {preview.readout}
          {!preview.valid && preview.error ? ` — ${preview.error}` : ''}
        </p>
      )}
      <p className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">Scroll: zoom · drag empty space: pan · drag a unit anywhere (snaps onto walls) · R: rotate · double-click: open in 3D</p>
    </div>
  );
}

/**
 * A wall opening on the plan: the wall cut back, then a door leaf drawn open with its swing arc,
 * a window's glazing lines, or just the jambs of a plain opening.
 */
function OpeningMark({ o, room, selected, onPointerDown }: { o: Opening; room: Room; selected: boolean; onPointerDown: (e: ReactPointerEvent<SVGGElement>) => void }) {
  const T = room.wallThickness;
  const frame = openingPlacement(room, o);
  const at = (x: number, z: number) => localToRoom(frame, { x, y: 0, z });
  const w = o.width;
  const corners = [at(-w / 2, 0), at(w / 2, 0), at(w / 2, -T), at(-w / 2, -T)];
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const gap = { x: Math.min(...xs), y: Math.min(...zs), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...zs) - Math.min(...zs) };
  const color = selected ? 'var(--highlight)' : 'var(--foreground)';
  const stroke = selected ? 14 : 6;
  let detail = null;
  if (o.kind === 'window') {
    const a = at(-w / 2, -T / 3);
    const b = at(w / 2, -T / 3);
    const c = at(-w / 2, (-2 * T) / 3);
    const d = at(w / 2, (-2 * T) / 3);
    detail = (
      <>
        <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke={color} strokeWidth={stroke} />
        <line x1={c.x} y1={c.z} x2={d.x} y2={d.z} stroke={color} strokeWidth={stroke} />
      </>
    );
  } else if (o.kind === 'door') {
    const hingeX = o.hinge === 'left' ? -w / 2 : w / 2;
    const freeX = -hingeX;
    const reach = o.swing === 'out' ? -T - w : w;
    const hinge = at(hingeX, o.swing === 'out' ? -T : 0);
    const leafEnd = at(hingeX, reach);
    const free = at(freeX, o.swing === 'out' ? -T : 0);
    const cross = (leafEnd.x - hinge.x) * (free.z - hinge.z) - (leafEnd.z - hinge.z) * (free.x - hinge.x);
    detail = (
      <>
        {/* The swept wedge is a click target too: users click inside the swing to pick the door. */}
        <path d={`M ${hinge.x} ${hinge.z} L ${leafEnd.x} ${leafEnd.z} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${free.x} ${free.z} Z`} fill={selected ? 'var(--highlight)' : 'transparent'} fillOpacity={0.08} />
        <line x1={hinge.x} y1={hinge.z} x2={leafEnd.x} y2={leafEnd.z} stroke={color} strokeWidth={stroke * 1.5} />
        {o.swing !== 'none' && <path d={`M ${leafEnd.x} ${leafEnd.z} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${free.x} ${free.z}`} fill="none" stroke={color} strokeWidth={stroke / 1.5} strokeDasharray="30 20" />}
      </>
    );
  }
  return (
    <g data-testid={`plan-opening-${o.id}`} role="button" aria-label={OPENING_SPECS[o.kind].label + ' on the ' + o.wallId + ' wall'} className={selected ? 'cursor-move' : 'cursor-pointer'} onPointerDown={onPointerDown}>
      <rect {...gap} fill="var(--viewport)" stroke={color} strokeWidth={stroke / 2} />
      {/* A wider invisible target: openings are only a wall thickness deep on the plan. */}
      <rect x={gap.x - 60} y={gap.y - 60} width={gap.width + 120} height={gap.height + 120} fill="transparent" />
      {detail}
    </g>
  );
}

function DimensionLine({ x1, y1, x2, y2, label, vertical, highlight }: { x1: number; y1: number; x2: number; y2: number; label: string; vertical?: boolean; highlight?: boolean }) {
  const color = highlight ? 'var(--highlight)' : 'var(--foreground)';
  const tick = 60;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g stroke={color} strokeWidth={5} pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} />
        </>
      )}
      <text x={vertical ? mx - 50 : mx} y={vertical ? my : my - 50} textAnchor="middle" fontSize={100} fill={color} stroke="none" transform={vertical ? `rotate(-90 ${mx - 50} ${my})` : undefined}>
        {label}
      </text>
    </g>
  );
}
