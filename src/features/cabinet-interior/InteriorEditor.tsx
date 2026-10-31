import { Eye, EyeOff, Minus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  executeCommand,
  FITTING_HEIGHT,
  fittingName,
  fittingSpan,
  insideOf,
  INTERIOR_PRESETS,
  interiorErrors,
  newFitting,
  PANEL,
  PRESET_LABEL,
  sectionWidths,
  type Fitting,
  type FittingKind,
  type FrontStyle,
  type Interior,
  type KitchenCabinet,
} from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { Button } from '@/components/ui/button';
import { MmField } from '@/components/ui/mm-field';
import { useEditorStore } from '@/state/editorStore';
import { useFormatDims, useFormatLength } from '@/state/units';

const FRONTS: { style: FrontStyle; label: string }[] = [
  { style: 'solid', label: 'Solid doors' },
  { style: 'glass', label: 'Glass doors' },
  { style: 'open', label: 'Open' },
];

const ADDABLE: { kind: FittingKind; glass?: boolean; label: string }[] = [
  { kind: 'shelf', label: 'Shelf' },
  { kind: 'shelf', glass: true, label: 'Glass shelf' },
  { kind: 'drawer', label: 'Drawer' },
  { kind: 'rail', label: 'Rail' },
  { kind: 'plate-rack', label: 'Plate rack' },
  { kind: 'bottle-rack', label: 'Bottles' },
  { kind: 'basket', label: 'Basket' },
];

type Selected = { section: number; fitting: number } | null;

const replaceFitting = (interior: Interior, s: number, f: number, next: Fitting | null): Interior => ({
  sections: interior.sections.map((sec, si) =>
    si !== s ? sec : { ...sec, fittings: next ? sec.fittings.map((x, fi) => (fi === f ? next : x)) : sec.fittings.filter((_, fi) => fi !== f) },
  ),
});

/**
 * Cabinet interior designer: front style, presets, a draggable front elevation of the inside, and
 * exact fields. Every change is one `set_interior` (or preset/front) command, validated by the domain.
 */
export function InteriorEditor({ cabinet }: { cabinet: KitchenCabinet }) {
  const project = useEditorStore((s) => s.project)!;
  const dispatch = useEditorStore((s) => s.dispatch);
  const showInteriors = useEditorStore((s) => s.showInteriors);
  const setShowInteriors = useEditorStore((s) => s.setShowInteriors);
  const [selected, setSelected] = useState<Selected>(null);
  const [shelfCount, setShelfCount] = useState(3);
  const inside = insideOf(cabinet.dimensions);
  const fmt = useFormatLength();
  const fmtDims = useFormatDims();
  const setInterior = (interior: Interior) => dispatch({ type: 'set_interior', cabinetId: cabinet.id, interior });
  const dryRun = (interior: Interior) => executeCommand(project, { type: 'set_interior', cabinetId: cabinet.id, interior }).result;

  if (cabinet.type === 'drawer') {
    return (
      <PanelSection title="Interior">
        <p className="text-xs text-muted-foreground">A drawer unit's drawers are its fronts. For drawers behind doors, use a base or tall unit with the Internal drawers preset.</p>
      </PanelSection>
    );
  }

  const sel = selected && cabinet.interior.sections[selected.section]?.fittings[selected.fitting] ? selected : null;
  const fitting = sel ? cabinet.interior.sections[sel.section]!.fittings[sel.fitting]! : null;

  return (
    <PanelSection
      title="Interior"
      action={
        <Button size="xs" variant={showInteriors ? 'selected' : 'ghost'} onClick={() => setShowInteriors(!showInteriors)} aria-pressed={showInteriors} title="See-through fronts in 3D (I)">
          {showInteriors ? <Eye /> : <EyeOff />} Inside in 3D
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Fronts">
        {FRONTS.map((f) => (
          <Button
            key={f.style}
            size="xs"
            role="radio"
            aria-checked={cabinet.frontStyle === f.style}
            variant={cabinet.frontStyle === f.style ? 'selected' : 'outline'}
            onClick={() => cabinet.frontStyle !== f.style && dispatch({ type: 'set_front_style', cabinetId: cabinet.id, style: f.style })}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Presets</span>
        <div className="flex flex-wrap gap-1">
          <div className="flex items-center rounded-md border">
            <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'apply_interior_preset', cabinetId: cabinet.id, preset: 'shelves', count: shelfCount })}>
              {shelfCount} shelves
            </Button>
            <button type="button" className="px-1 text-muted-foreground hover:text-foreground" aria-label="Fewer shelves" onClick={() => setShelfCount((n) => Math.max(1, n - 1))}>
              <Minus className="size-3" />
            </button>
            <button type="button" className="px-1 text-muted-foreground hover:text-foreground" aria-label="More shelves" onClick={() => setShelfCount((n) => Math.min(12, n + 1))}>
              <Plus className="size-3" />
            </button>
          </div>
          {INTERIOR_PRESETS.filter((p) => p !== 'shelves').map((p) => (
            <Button key={p} size="xs" variant="outline" onClick={() => dispatch({ type: 'apply_interior_preset', cabinetId: cabinet.id, preset: p })}>
              {PRESET_LABEL[p]}
            </Button>
          ))}
        </div>
      </div>

      <InteriorDiagram cabinet={cabinet} selected={sel} onSelect={setSelected} dryRun={dryRun} commit={setInterior} />
      <p className="text-[11px] text-muted-foreground">
        Inside {fmtDims(inside)}. Drag fittings up or down and dividers sideways; click one to edit it exactly.
      </p>

      {fitting && sel && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-2.5" aria-label="Selected fitting">
          <div className="flex items-center justify-between">
            <strong className="text-xs">{fittingName(fitting)}</strong>
            <Button size="xs" variant="ghost" className="text-destructive" onClick={() => setInterior(replaceFitting(cabinet.interior, sel.section, sel.fitting, null))}>
              <Trash2 /> Remove
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MmField label="Height above floor" value={fitting.y} testId="fitting-y" onCommit={(y) => setInterior(replaceFitting(cabinet.interior, sel.section, sel.fitting, { ...fitting, y }))} hint={`Inside floor = 0, top = ${fmt(inside.height)}`} />
            {'height' in fitting && (
              <MmField
                label="Height"
                value={fitting.height}
                onCommit={(height) => setInterior(replaceFitting(cabinet.interior, sel.section, sel.fitting, { ...fitting, height }))}
                hint={`Minimum ${fmt(FITTING_HEIGHT[fitting.kind]?.min ?? 0)}`}
              />
            )}
          </div>
          {fitting.kind === 'shelf' && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={fitting.glass} onChange={(e) => setInterior(replaceFitting(cabinet.interior, sel.section, sel.fitting, { ...fitting, glass: e.target.checked }))} />
              Glass shelf (8 mm)
            </label>
          )}
        </div>
      )}

      <SectionsEditor cabinet={cabinet} onAdd={(s, f) => setSelected({ section: s, fitting: f })} setInterior={setInterior} />
    </PanelSection>
  );
}

function SectionsEditor({ cabinet, setInterior, onAdd }: { cabinet: KitchenCabinet; setInterior: (i: Interior) => void; onAdd: (section: number, fitting: number) => void }) {
  const report = useEditorStore((s) => s.report);
  const fmt = useFormatLength();
  const inside = insideOf(cabinet.dimensions);
  const widths = sectionWidths(cabinet.interior, inside.width);
  const n = cabinet.interior.sections.length;
  const setSections = (sections: Interior['sections']) => setInterior({ sections });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Sections (vertical dividers)</span>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" className="size-6" aria-label="Remove a section" disabled={n <= 1} onClick={() => setSections(cabinet.interior.sections.slice(0, -1))}>
            <Minus />
          </Button>
          <span className="w-4 text-center text-xs tabular-nums" data-testid="section-count">{n}</span>
          <Button size="icon-sm" variant="outline" className="size-6" aria-label="Add a section" disabled={n >= 6} onClick={() => setSections([...cabinet.interior.sections, { width: null, fittings: [] }])}>
            <Plus />
          </Button>
        </div>
      </div>
      {cabinet.interior.sections.map((section, si) => (
        <div key={si} className="flex flex-col gap-1.5 rounded-md border p-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Section {si + 1}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{'widths' in widths ? `${fmt(Math.round(widths.widths[si]!))} wide` : ''}</span>
            {n > 1 && (
              <label className="ml-auto flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={section.width === null}
                  onChange={(e) => {
                    const fixed = 'widths' in widths ? Math.round(widths.widths[si]!) : 300;
                    setSections(cabinet.interior.sections.map((s, i) => (i === si ? { ...s, width: e.target.checked ? null : fixed } : s)));
                  }}
                />
                Auto width
              </label>
            )}
          </div>
          {section.width !== null && n > 1 && (
            <MmField label="Width" value={section.width} onCommit={(w) => setSections(cabinet.interior.sections.map((s, i) => (i === si ? { ...s, width: w } : s)))} />
          )}
          <div className="flex flex-wrap gap-1" aria-label={`Add to section ${si + 1}`}>
            {ADDABLE.map((a) => (
              <button
                key={a.label}
                type="button"
                className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted"
                aria-label={`Add ${a.label.toLowerCase()} to section ${si + 1}`}
                onClick={() => {
                  const f = newFitting(section, a.kind, inside.height, a.glass);
                  if (!f) {
                    report('error', `No free space in section ${si + 1} for a ${a.label.toLowerCase()}.`);
                    return;
                  }
                  setSections(cabinet.interior.sections.map((s, i) => (i === si ? { ...s, fittings: [...s.fittings, f] } : s)));
                  onAdd(si, section.fittings.length);
                }}
              >
                + {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const M = 40;

type DiagramDrag =
  | { kind: 'fitting'; pointerId: number; section: number; fitting: number; startClientY: number; startY: number; moved: boolean; next: Interior | null; valid: boolean }
  | { kind: 'divider'; pointerId: number; index: number; startClientX: number; startWidth: number; moved: boolean; next: Interior | null; valid: boolean };

/** Front elevation of the inside, in millimetres (inside floor at the bottom). */
function InteriorDiagram({
  cabinet,
  selected,
  onSelect,
  dryRun,
  commit,
}: {
  cabinet: KitchenCabinet;
  selected: Selected;
  onSelect: (s: Selected) => void;
  dryRun: (i: Interior) => { success: boolean; errors: string[] };
  commit: (i: Interior) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<DiagramDrag | null>(null);
  const [live, setLive] = useState<{ interior: Interior; valid: boolean; error: string | null; target: string | null } | null>(null);
  const inside = insideOf(cabinet.dimensions);
  const interior = live?.interior ?? cabinet.interior;
  const W = inside.width;
  const H = inside.height;
  const sized = sectionWidths(interior, W);
  const widths = 'widths' in sized ? sized.widths : interior.sections.map(() => (W - (interior.sections.length - 1) * PANEL) / interior.sections.length);
  const starts = widths.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + widths[i - 1]! + PANEL], []);
  const mmPerPx = () => {
    const m = svg.current?.getScreenCTM();
    return m ? 1 / m.a : 1;
  };
  const sy = (y: number) => H - y;

  const update = (next: Interior, target: string | null) => {
    const r = dryRun(next);
    const errors = r.success ? [] : interiorErrors({ ...cabinet, interior: next });
    setLive({ interior: next, valid: r.success, error: r.success ? null : (errors[0] ?? r.errors[0] ?? null), target });
    return r.success;
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.kind === 'fitting') {
      const dy = (d.startClientY - e.clientY) * mmPerPx();
      if (!d.moved && Math.abs(dy) < 3) return;
      d.moved = true;
      const f = cabinet.interior.sections[d.section]!.fittings[d.fitting]!;
      const y = Math.max(0, Math.round((d.startY + dy) / 5) * 5);
      d.next = replaceFitting(cabinet.interior, d.section, d.fitting, { ...f, y });
      d.valid = update(d.next, `${d.section}-${d.fitting}`);
    } else {
      const dx = (e.clientX - d.startClientX) * mmPerPx();
      if (!d.moved && Math.abs(dx) < 3) return;
      d.moved = true;
      const width = Math.max(100, Math.round((d.startWidth + dx) / 5) * 5);
      const delta = width - d.startWidth;
      d.next = {
        sections: cabinet.interior.sections.map((s, i) => {
          if (i === d.index) return { ...s, width };
          if (i === d.index + 1 && s.width !== null) return { ...s, width: s.width - delta };
          return s;
        }),
      };
      d.valid = update(d.next, null);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    svg.current?.releasePointerCapture(e.pointerId);
    setLive(null);
    if (d.kind === 'fitting' && !d.moved) onSelect({ section: d.section, fitting: d.fitting });
    if (d.moved && d.next && d.valid) commit(d.next);
  };

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svg}
        data-testid="interior-diagram"
        role="img"
        aria-label={`Interior of ${cabinet.type} cabinet, ${W} by ${H} millimetres inside`}
        viewBox={`${-M} ${-M} ${W + 2 * M} ${H + 2 * M}`}
        className="max-h-80 w-full touch-none rounded-md border bg-card select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect x={-PANEL} y={-PANEL} width={W + 2 * PANEL} height={H + 2 * PANEL} fill="#d6d3cd" />
        <rect x={0} y={0} width={W} height={H} fill={cabinet.frontStyle === 'glass' ? '#eef6f8' : '#f6f4f0'} />
        {widths.map((w, si) =>
          si < widths.length - 1 ? (
            <rect
              key={`div${si}`}
              data-testid={`divider-${si}`}
              x={starts[si]! + w}
              y={0}
              width={PANEL}
              height={H}
              fill="#bdb8ae"
              className="cursor-ew-resize"
              onPointerDown={(e) => {
                e.stopPropagation();
                svg.current?.setPointerCapture(e.pointerId);
                drag.current = { kind: 'divider', pointerId: e.pointerId, index: si, startClientX: e.clientX, startWidth: Math.round(w), moved: false, next: null, valid: false };
              }}
            />
          ) : null,
        )}
        {interior.sections.map((section, si) =>
          section.fittings.map((f, fi) => {
            const a = starts[si]!;
            const b = a + widths[si]!;
            const [lo, hi] = fittingSpan(f);
            const isSel = selected?.section === si && selected.fitting === fi;
            const bad = live !== null && !live.valid && live.target === `${si}-${fi}`;
            const stroke = bad ? '#ef4444' : isSel ? 'var(--highlight)' : '#57534e';
            return (
              <g
                key={`${si}-${fi}`}
                data-testid={`fitting-${si}-${fi}`}
                className="cursor-ns-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  svg.current?.setPointerCapture(e.pointerId);
                  drag.current = { kind: 'fitting', pointerId: e.pointerId, section: si, fitting: fi, startClientY: e.clientY, startY: f.y, moved: false, next: null, valid: false };
                }}
              >
                {/* Thin shelves are a few pixels tall: a larger invisible target makes them easy to grab. */}
                <rect x={a} y={sy(hi) - 25} width={b - a} height={sy(lo) - sy(hi) + 50} fill="transparent" />
                <FittingShape f={f} a={a} b={b} top={sy(hi)} bottom={sy(lo)} stroke={stroke} strokeWidth={isSel || bad ? 6 : 3} />
                <text x={a + 6} y={sy(hi) - 6} fontSize={Math.max(22, Math.min(34, (b - a) / 10))} fill={stroke} pointerEvents="none">
                  {f.y}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      {live?.error && <p className="text-[11px] text-destructive" role="status">{live.error}</p>}
    </div>
  );
}

function FittingShape({ f, a, b, top, bottom, stroke, strokeWidth }: { f: Fitting; a: number; b: number; top: number; bottom: number; stroke: string; strokeWidth: number }) {
  const h = bottom - top;
  switch (f.kind) {
    case 'shelf':
      return <rect x={a} y={top} width={b - a} height={Math.max(h, 8)} fill={f.glass ? '#bfe3ee' : '#c8b392'} stroke={stroke} strokeWidth={strokeWidth} />;
    case 'rail':
      return (
        <g>
          <rect x={a} y={top - 12} width={b - a} height={h + 24} fill="transparent" />
          <line x1={a + 10} x2={b - 10} y1={top + h / 2} y2={top + h / 2} stroke={stroke} strokeWidth={strokeWidth + 6} strokeLinecap="round" />
        </g>
      );
    case 'drawer':
      return (
        <g>
          <rect x={a + 6} y={top} width={b - a - 12} height={h - 6} fill="#e9e4da" stroke={stroke} strokeWidth={strokeWidth} />
          <line x1={(a + b) / 2 - 40} x2={(a + b) / 2 + 40} y1={top + 30} y2={top + 30} stroke={stroke} strokeWidth={strokeWidth + 2} />
        </g>
      );
    case 'plate-rack':
      return (
        <g>
          <rect x={a + 4} y={top} width={b - a - 8} height={h} fill="#f3f4f6" stroke={stroke} strokeWidth={strokeWidth} />
          {Array.from({ length: Math.max(0, Math.floor((b - a - 40) / 45)) }, (_, i) => (
            <line key={i} x1={a + 30 + i * 45} x2={a + 30 + i * 45} y1={bottom - 8} y2={bottom - h * 0.75} stroke={stroke} strokeWidth={3} />
          ))}
        </g>
      );
    case 'bottle-rack':
      return (
        <g>
          <rect x={a + 4} y={top} width={b - a - 8} height={h} fill="#efe9df" stroke={stroke} strokeWidth={strokeWidth} />
          {Array.from({ length: Math.max(0, Math.floor((b - a) / 110) - 0) }, (_, i) => (
            <line key={`v${i}`} x1={a + (i + 1) * 110} x2={a + (i + 1) * 110} y1={top} y2={bottom} stroke={stroke} strokeWidth={3} />
          ))}
          {Array.from({ length: Math.max(0, Math.floor(h / 110)) }, (_, i) => (
            <line key={`h${i}`} x1={a + 4} x2={b - 4} y1={bottom - (i + 1) * 110} y2={bottom - (i + 1) * 110} stroke={stroke} strokeWidth={3} />
          ))}
        </g>
      );
    case 'basket':
      return <rect x={a + 10} y={top} width={b - a - 20} height={h} fill="#f1f5f9" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="14 8" />;
  }
}

