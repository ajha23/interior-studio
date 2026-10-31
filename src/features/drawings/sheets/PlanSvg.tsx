import { forwardRef } from 'react';
import { allElements, deriveCountertops, isCabinet, openingPlacement, specOf, WALLS, type KitchenProject } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { localToRoom } from '@/engine/geometry/transform';
import { wallPieces } from '@/engine/geometry/walls';
import { formatLength } from '@/engine/measurement/units';
import { unitRefs } from '@/engine/production/schedule';
import { Dimension, Tag } from './DimensionSvg';

/** Plan cut at 1.2 m (so windows show as gaps), for the drawing set. Explicit colours for print. */
export const PlanSvg = forwardRef<SVGSVGElement, { project: KitchenProject }>(function PlanSvg({ project }, ref) {
  const { width: W, length: L, wallThickness: T } = project.room;
  const refs = unitRefs(project);
  const cut = 1200;
  const pad = 700;
  const pieces = WALLS.flatMap((w) => wallPieces(project.room, w, project.openings)).filter((b) => b.minY <= cut && b.maxY >= cut);
  const wallHung = (id: string) => {
    const el = allElements(project).find((e) => e.id === id)!;
    return specOf(el).mount === 'wall';
  };
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${L + 2 * pad}`} className="size-full" role="img" aria-label="Plan" data-testid="plan-sheet">
      <rect x={0} y={0} width={W} height={L} fill="#fff" />
      {deriveCountertops(project).map((s) => (
        <rect key={s.id} x={s.box.minX} y={s.box.minZ} width={s.box.maxX - s.box.minX} height={s.box.maxZ - s.box.minZ} fill="#efe7da" stroke="#555" strokeWidth={3} />
      ))}
      {[...allElements(project)].sort((a, b) => Number(wallHung(a.id)) - Number(wallHung(b.id))).map((el) => {
        const b = elementBox(el);
        const hung = wallHung(el.id);
        return (
          <g key={el.id}>
            <rect x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill={hung ? 'none' : isCabinet(el) ? '#fff' : '#eef0f2'} stroke="#222" strokeWidth={hung ? 3 : 5} strokeDasharray={hung ? '35 20' : undefined} />
            {!hung && <Tag x={(b.minX + b.maxX) / 2} y={(b.minZ + b.maxZ) / 2} text={refs.get(el.id) ?? ''} r={70} />}
          </g>
        );
      })}
      {pieces.map((b, i) => <rect key={i} x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="#333" />)}
      {project.openings.map((o) => {
        const frame = openingPlacement(project.room, o);
        const at = (x: number, z: number) => localToRoom(frame, { x, y: 0, z });
        if (o.kind === 'window') {
          const a = at(-o.width / 2, -T / 2);
          const b = at(o.width / 2, -T / 2);
          return <line key={o.id} x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke="#2a6f86" strokeWidth={14} />;
        }
        if (o.kind !== 'door' || o.swing === 'none') return null;
        const hx = o.hinge === 'left' ? -o.width / 2 : o.width / 2;
        const reach = o.swing === 'out' ? -T - o.width : o.width;
        const hinge = at(hx, o.swing === 'out' ? -T : 0);
        const end = at(hx, reach);
        const free = at(-hx, o.swing === 'out' ? -T : 0);
        const cross = (end.x - hinge.x) * (free.z - hinge.z) - (end.z - hinge.z) * (free.x - hinge.x);
        return (
          <g key={o.id} fill="none" stroke="#222">
            <line x1={hinge.x} y1={hinge.z} x2={end.x} y2={end.z} strokeWidth={8} />
            <path d={`M ${end.x} ${end.z} A ${o.width} ${o.width} 0 0 ${cross > 0 ? 1 : 0} ${free.x} ${free.z}`} strokeWidth={3} strokeDasharray="30 20" />
          </g>
        );
      })}
      <Dimension x1={0} y1={-T - 250} x2={W} y2={-T - 250} text={formatLength(W, project.preferences.unit)} vertical={false} size={90} />
      <Dimension x1={-T - 250} y1={0} x2={-T - 250} y2={L} text={formatLength(L, project.preferences.unit)} vertical size={90} />
    </svg>
  );
});
