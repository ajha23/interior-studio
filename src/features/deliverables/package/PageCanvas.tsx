import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { sheetSize } from '@/engine/deliverables/drawing';
import { sheetToSvg } from '@/engine/deliverables/svg';
import { dragOverride, snapMove, type ComposedPage, type Handle } from '@/engine/package/compose';
import type { Page } from '@/engine/package/schema';
import type { PackageCommand } from '@/engine/package/commands';
import { cn } from '@/lib/utils';

/** The command a drag of a handle by (dx, dy) paper mm makes, or null for handles that do not move. */
export function moveCommand(page: Page, handle: Handle, dx: number, dy: number): PackageCommand | null {
  if (handle.kind === 'leader') {
    const note = page.notes.find((n) => `${n.id}:tip` === handle.key);
    return note?.leader ? { type: 'update-note', pageId: page.id, noteId: note.id, patch: { leader: { x: note.leader.x + dx, y: note.leader.y + dy } } } : null;
  }
  if (handle.kind === 'note') {
    const note = page.notes.find((n) => n.id === handle.key);
    return note ? { type: 'update-note', pageId: page.id, noteId: note.id, patch: { x: Math.round((note.x + dx) * 10) / 10, y: Math.round((note.y + dy) * 10) / 10 } } : null;
  }
  if (handle.kind === 'dim' || handle.kind === 'tag' || handle.kind === 'text' || handle.kind === 'marker') {
    const prev = page.overrides[handle.key];
    return { type: 'set-override', pageId: page.id, key: handle.key, override: { ...dragOverride(handle, prev, dx, dy), hidden: prev?.hidden } };
  }
  return null;
}

const HANDLE_CLASS: Record<Handle['kind'], string> = {
  note: 'stroke-primary',
  leader: 'stroke-primary',
  dim: 'stroke-sky-500',
  tag: 'stroke-violet-500',
  marker: 'stroke-violet-500',
  text: 'stroke-sky-500',
  card: 'stroke-primary',
  snapshot: 'stroke-primary',
};

/**
 * One page at paper size: the sheet exactly as it exports (from the SVG writer) under an overlay of
 * selection handles. Dragging previews through `onPreview` and commits one command on release.
 */
export function PageCanvas({
  page,
  composed,
  zoom,
  selection,
  onSelect,
  onPreview,
  onCommit,
}: {
  page: Page;
  composed: ComposedPage;
  zoom: number;
  selection: string | null;
  onSelect: (key: string | null) => void;
  onPreview: (cmd: PackageCommand | null) => void;
  onCommit: (cmd: PackageCommand) => void;
}) {
  const { w, h } = sheetSize(composed.sheet);
  const overlay = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number; moved: boolean } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }[]>([]);
  // The handle where the drag started (the preview moves the live handles).
  const startHandle = useRef<Handle | null>(null);
  /** The move for a pointer position: notes snap to other notes and the margins unless Alt is held. */
  const moveFor = (e: { clientX: number; clientY: number; altKey: boolean }) => {
    const p = toPaper(e);
    const h = startHandle.current!;
    const raw = { dx: p.x - drag!.x, dy: p.y - drag!.y };
    if (h.kind !== 'note' || e.altKey) return { ...raw, guides: [] };
    return snapMove(h, raw.dx, raw.dy, composed);
  };
  const toPaper = (e: { clientX: number; clientY: number }) => {
    const r = overlay.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const down = (e: ReactPointerEvent, handle: Handle) => {
    e.stopPropagation();
    onSelect(handle.key);
    if (handle.kind === 'card' || handle.kind === 'snapshot') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startHandle.current = handle;
    setDrag({ key: handle.key, ...toPaper(e), moved: false });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag || !startHandle.current) return;
    const p = toPaper(e);
    if (!drag.moved && Math.hypot(p.x - drag.x, p.y - drag.y) < 0.5) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    const m = moveFor(e);
    setGuides(m.guides);
    onPreview(moveCommand(page, startHandle.current, m.dx, m.dy));
  };
  const up = (e: ReactPointerEvent) => {
    if (!drag) return;
    const handle = startHandle.current;
    const m = handle ? moveFor(e) : null;
    onPreview(null);
    setDrag(null);
    setGuides([]);
    startHandle.current = null;
    if (drag.moved && handle && m) {
      const cmd = moveCommand(page, handle, m.dx, m.dy);
      if (cmd) onCommit(cmd);
    }
  };
  // The SVG comes from our own writer, which escapes every text and attribute.
  const svg = sheetToSvg(composed.sheet).replace(/^<\?xml[^>]*>\n/, '');
  return (
    <div className="relative mx-auto bg-white shadow-md" style={{ width: `${zoom * 100}%`, aspectRatio: `${w} / ${h}` }} data-testid="package-page" data-page-id={page.id} data-status={composed.status}>
      <div className="absolute inset-0 [&>svg]:size-full" data-testid="package-sheet" dangerouslySetInnerHTML={{ __html: svg }} />
      <svg
        ref={overlay}
        className="absolute inset-0 size-full touch-none"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        onPointerDown={() => onSelect(null)}
        onPointerMove={move}
        onPointerUp={up}
        aria-label="Page elements"
      >
        {composed.handles
          .filter((x) => !x.hidden)
          .map((x) => (
            <rect
              key={x.key}
              x={x.box.x - 0.6}
              y={x.box.y - 0.6}
              width={x.box.w + 1.2}
              height={x.box.h + 1.2}
              rx={x.kind === 'leader' ? 1.5 : 0.6}
              className={cn('cursor-pointer fill-transparent', x.kind !== 'card' && x.kind !== 'snapshot' && 'cursor-move', selection === x.key ? `${HANDLE_CLASS[x.kind]} fill-sky-400/10` : 'stroke-transparent hover:stroke-sky-400/70')}
              strokeWidth={0.35}
              strokeDasharray={selection === x.key ? undefined : '1 0.6'}
              onPointerDown={(e) => down(e, x)}
              data-handle={x.key}
              data-kind={x.kind}
              role="button"
              aria-label={`${x.kind} ${x.label}`}
            />
          ))}
        {guides.map((g, i) => (g.x !== undefined ? <line key={i} x1={g.x} x2={g.x} y1={0} y2={h} className="stroke-pink-500" strokeWidth={0.25} data-testid="snap-guide" /> : <line key={i} x1={0} x2={w} y1={g.y} y2={g.y} className="stroke-pink-500" strokeWidth={0.25} data-testid="snap-guide" />))}
      </svg>
    </div>
  );
}
