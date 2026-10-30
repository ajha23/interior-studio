import { Maximize2, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import {
  allElements,
  deriveCountertops,
  elementLabel,
  executeCommand,
  isCabinet,
  placeOnWall,
  specFor,
  wallAxis,
  type DesignCommand,
  type KitchenElement,
} from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { snapPlacement } from '@/engine/snapping/placement';
import { Button } from '@/components/ui/button';
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
  | { kind: 'move'; pointerId: number; startX: number; startY: number; el: KitchenElement; grab: { x: number; z: number }; moved: boolean; last: DesignCommand | null; valid: boolean };

/**
 * Dimensioned top-down plan drawn straight from the domain model (back wall at the top).
 * Wheel zooms at the cursor, dragging empty space pans, dragging a unit slides it along its wall
 * with snapping, double-click opens it in 3D.
 */
export function PlanView() {
  const project = useEditorStore((s) => s.project)!;
  const selectedId = useEditorStore((s) => s.selectedId);
  const preview = useEditorStore((s) => s.preview);
  const { select, setPreview, dispatch, setView, requestCamera } = useEditorStore.getState();
  const shown = preview?.project ?? project;
  const { width: W, length: L, wallThickness: T } = shown.room;
  const fit: ViewBox = useMemo(() => ({ x: -MARGIN, y: -MARGIN, w: project.room.width + 2 * MARGIN, h: project.room.length + 2 * MARGIN }), [project.room.width, project.room.length]);
  const [view, setViewBox] = useState<ViewBox | null>(null);
  const vb = view ?? fit;
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const slabs = useMemo(() => deriveCountertops(shown), [shown]);
  const isWallHung = (el: KitchenElement) => specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type).mount === 'wall';
  // Floor units first, wall-hung units on top (drawn dashed, as on a kitchen plan).
  const elements = useMemo(
    () => [...allElements(shown)].sort((a, b) => Number(isWallHung(a)) - Number(isWallHung(b))).map((el) => ({ el, box: elementBox(el), wallHung: isWallHung(el) })),
    [shown],
  );
  const selected = elements.find((e) => e.el.id === selectedId);
  const fill = (el: KitchenElement) => (isCabinet(el) ? (shown.materials[el.materialId]?.color ?? '#ddd') : '#c8cbcf');

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
    const el = g.el;
    const p = toPlan(e.clientX, e.clientY);
    const snap = snapPlacement(project, el, p.x + g.grab.x, p.y + g.grab.z, SNAP_PX * mmPerPixel());
    const spec = specFor(isCabinet(el) ? 'cabinet' : 'appliance', el.type);
    const attempt: KitchenElement =
      snap.kind === 'wall'
        ? { ...el, wallId: snap.wallId, ...placeOnWall(project.room, snap.wallId, el.dimensions, snap.offset, spec.mount === 'wall' ? el.position.y : spec.elevation) }
        : { ...el, wallId: undefined, position: { x: snap.x, y: spec.elevation, z: snap.z }, rotationY: snap.rotationY };
    const b = elementBox(attempt);
    const where = snap.kind === 'wall' ? `↔ ${snap.offset} mm` : `${b.minX}, ${b.minZ} mm from the left and back walls`;
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
        <rect x={-T} y={-T} width={W + 2 * T} height={L + T} fill="var(--muted-foreground)" opacity={0.35} />
        <rect x={0} y={0} width={W} height={L} fill={shown.materials[shown.surfaces.floor]?.color ?? '#eee'} opacity={0.35} />
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
                  {el.dimensions.width}
                </text>
              )}
            </g>
          );
        })}

        {ghost && <rect x={ghost.minX} y={ghost.minZ} width={ghost.maxX - ghost.minX} height={ghost.maxZ - ghost.minZ} fill="#ef4444" fillOpacity={0.25} stroke="#ef4444" strokeWidth={10} strokeDasharray="30 20" pointerEvents="none" />}

        <DimensionLine x1={0} y1={-T - 220} x2={W} y2={-T - 220} label={`${W}`} />
        <DimensionLine x1={-T - 220} y1={0} x2={-T - 220} y2={L} label={`${L}`} vertical />
        {selected &&
          (wallAxis(selected.el.wallId ?? 'back') === 'x' ? (
            <DimensionLine x1={selected.box.minX} y1={L + 260} x2={selected.box.maxX} y2={L + 260} label={`${selected.el.dimensions.width}`} highlight />
          ) : (
            <DimensionLine x1={W + 260} y1={selected.box.minZ} x2={W + 260} y2={selected.box.maxZ} label={`${selected.el.dimensions.width}`} vertical highlight />
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
      {preview && (
        <p role="status" className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs shadow ${preview.valid ? 'bg-foreground text-background' : 'bg-destructive text-white'}`} data-testid="plan-readout">
          {preview.readout}
          {!preview.valid && preview.error ? ` — ${preview.error}` : ''}
        </p>
      )}
      <p className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">Scroll: zoom · drag empty space: pan · drag a unit anywhere (snaps onto walls) · R: rotate · double-click: open in 3D</p>
    </div>
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
        {label} mm
      </text>
    </g>
  );
}
