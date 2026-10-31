/**
 * Interior elevation of one wall as a drawing view, from the existing elevation projection
 * (engine/drawings/elevation.ts): units, fronts, handles, plinths, worktops and openings as seen
 * from inside the room, with width chains, the wall length and a height chain. Dimension values are
 * re-measured from the projected geometry and formatted in the chosen unit.
 */
import { WALL_LABEL, type KitchenProject, type WallId } from '@/domain';
import { elevation, type ShapeStyle } from '../drawings/elevation';
import { boundsOf, formatDimension, type Fill, type Prim, type Stroke, type View } from './drawing';
import type { AnnotationOptions } from './plan';

const STYLE: Record<ShapeStyle, { stroke: Stroke | null; fill: Fill }> = {
  wall: { stroke: 'thick', fill: 'floor' },
  carcass: { stroke: 'medium', fill: 'unit' },
  front: { stroke: 'thin', fill: 'front' },
  glass: { stroke: 'thin', fill: 'glass' },
  handle: { stroke: null, fill: 'handle' },
  plinth: { stroke: 'thin', fill: 'plinth' },
  interior: { stroke: 'hidden', fill: 'none' },
  worktop: { stroke: 'thin', fill: 'worktop' },
  appliance: { stroke: 'medium', fill: 'appliance' },
  opening: { stroke: 'medium', fill: 'opening' },
  swing: { stroke: 'hidden', fill: 'none' },
};

export function elevationView(project: KitchenProject, wallId: WallId, options: AnnotationOptions, scale: number): View & { empty: boolean } {
  const e = elevation(project, wallId);
  const fy = (y: number) => e.height - y;
  const prims: Prim[] = [];
  for (const s of e.shapes) {
    if (s.kind === 'rect') {
      const st = STYLE[s.style];
      prims.push({ t: 'rect', x: s.x, y: fy(s.y + s.h), w: s.w, h: s.h, stroke: st.stroke, fill: st.fill });
    } else if (s.kind === 'line') {
      prims.push({ t: 'line', a: { x: s.x1, y: fy(s.y1) }, b: { x: s.x2, y: fy(s.y2) }, stroke: STYLE[s.style].stroke ?? 'thin' });
    } else if (s.kind === 'tag') {
      if (options.tags) prims.push({ t: 'tag', at: { x: s.x, y: fy(s.y) }, text: s.text, r: 2.6 });
    } else {
      // Dimension: measured points on the wall outline, the line where the projection put it.
      if (s.vertical) {
        const value = Math.abs(s.y2 - s.y1);
        const overall = value === e.height;
        if (overall ? !options.overall : !options.units) continue;
        prims.push({ t: 'dim', a: { x: 0, y: fy(Math.min(s.y1, s.y2)) }, b: { x: 0, y: fy(Math.max(s.y1, s.y2)) }, offset: -s.x1, value: Math.round(value), text: formatDimension(value, options.unit), role: overall ? 'overall' : 'height', axis: 'y' });
      } else {
        const value = Math.abs(s.x2 - s.x1);
        const overall = value === e.length && s.y1 < -200;
        if (overall ? !options.overall : !options.units) continue;
        const featureY = s.y1 < 0 ? 0 : e.height;
        // a→b along +x: left of it is up (−y on paper), so a dimension below the floor is negative.
        prims.push({ t: 'dim', a: { x: Math.min(s.x1, s.x2), y: fy(featureY) }, b: { x: Math.max(s.x1, s.x2), y: fy(featureY) }, offset: s.y1 - featureY, value: Math.round(value), text: formatDimension(value, options.unit), role: overall ? 'overall' : 'segment', axis: 'x' });
      }
    }
  }
  prims.push({ t: 'line', a: { x: -300, y: fy(0) }, b: { x: e.length + 300, y: fy(0) }, stroke: 'thick' });
  return {
    id: `elev-${wallId}`,
    title: `${WALL_LABEL[wallId]} elevation`,
    prims,
    bounds: boundsOf(prims, 4, scale),
    notes: [`Seen from inside the room. Wall ${formatDimension(e.length, options.unit)} long, ${formatDimension(e.height, options.unit)} high. Dashed: shelves and interior fittings.`],
    empty: e.empty,
  };
}
