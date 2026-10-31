import { useMemo } from 'react';
import { allElements } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { forward } from '@/rendering/scene/walk';
import { useEditorStore } from '@/state/editorStore';

const SIZE = 180;

/** Plan-sized map of the room while walking: where you stand, which way you look; click to go there. */
export function WalkMinimap() {
  const project = useEditorStore((s) => s.project)!;
  const pose = useEditorStore((s) => s.walkPose);
  const selectedId = useEditorStore((s) => s.selectedId);
  const requestWalk = useEditorStore((s) => s.requestWalk);
  const { width: W, length: L } = project.room;
  const scale = SIZE / Math.max(W, L);
  const boxes = useMemo(() => allElements(project).map((el) => ({ id: el.id, b: elementBox(el) })), [project]);
  const f = pose ? forward(pose.yaw) : null;
  const cone = pose && f ? 700 : 0;

  return (
    <svg
      data-testid="walk-minimap"
      data-pose={pose ? `${Math.round(pose.x)},${Math.round(pose.z)},${pose.yaw.toFixed(3)}` : ''}
      role="img"
      aria-label="Mini-map: click to walk there"
      width={W * scale + 12}
      height={L * scale + 12}
      viewBox={`${-6 / scale} ${-6 / scale} ${W + 12 / scale} ${L + 12 / scale}`}
      className="cursor-crosshair rounded-lg border bg-card/95 shadow-sm"
      onClick={(e) => {
        const m = e.currentTarget.getScreenCTM();
        if (!m) return;
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
        requestWalk({ kind: 'goto', x: p.x, z: p.y });
      }}
    >
      <rect x={0} y={0} width={W} height={L} fill="var(--muted)" stroke="var(--foreground)" strokeWidth={30} />
      {boxes.map(({ id, b }) => (
        <rect key={id} x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill={id === selectedId ? 'var(--highlight)' : '#a8a29e'} opacity={0.8} />
      ))}
      {pose && f && (
        <g pointerEvents="none">
          <path
            d={`M ${pose.x} ${pose.z} L ${pose.x + (f.x * Math.cos(0.6) - f.z * Math.sin(0.6)) * cone} ${pose.z + (f.x * Math.sin(0.6) + f.z * Math.cos(0.6)) * cone} L ${pose.x + (f.x * Math.cos(-0.6) - f.z * Math.sin(-0.6)) * cone} ${pose.z + (f.x * Math.sin(-0.6) + f.z * Math.cos(-0.6)) * cone} Z`}
            fill="var(--highlight)"
            opacity={0.3}
          />
          <circle cx={pose.x} cy={pose.z} r={110} fill="var(--highlight)" stroke="white" strokeWidth={30} />
        </g>
      )}
    </svg>
  );
}
