/**
 * Wall elevations: what you see standing in the room facing a wall. Produces drawing shapes in
 * millimetres — x along the wall from the viewer's left, y up from the floor — for the SVG renderer.
 * Units' local +x is the viewer's right for every wall, so parts map straight across.
 */
import { allElements, deriveCountertops, isCabinet, openingPlacement, specOf, wallLength, type KitchenElement, type KitchenProject, type Position, type WallId } from '@/domain';
import { buildModel } from '../geometry/parts';
import { formatLength, type LengthUnit } from '../measurement/units';
import { unitRefs } from '../production/schedule';

export type ShapeStyle = 'wall' | 'carcass' | 'front' | 'glass' | 'handle' | 'plinth' | 'interior' | 'worktop' | 'appliance' | 'opening' | 'swing';

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; style: ShapeStyle }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; style: ShapeStyle }
  | { kind: 'dim'; x1: number; y1: number; x2: number; y2: number; text: string; vertical: boolean }
  | { kind: 'tag'; x: number; y: number; text: string };

export interface Elevation {
  wallId: WallId;
  length: number;
  height: number;
  shapes: Shape[];
  /** Nothing stands on or is cut into this wall. */
  empty: boolean;
}

/** Position along the wall, from the left as seen from inside the room. */
export function viewerU(project: KitchenProject, wallId: WallId, p: Pick<Position, 'x' | 'z'>): number {
  const { width: W, length: L } = project.room;
  switch (wallId) {
    case 'back':
      return p.x;
    case 'front':
      return W - p.x;
    case 'left':
      return L - p.z;
    case 'right':
      return p.z;
  }
}

const DIM_GAP = 180;

/** Dimension text: plain millimetres (drawing convention) or the project's display unit. */
const dimText = (mm: number, unit: LengthUnit) => (unit === 'mm' ? `${Math.round(mm)}` : formatLength(Math.round(mm), unit));

export function elevation(project: KitchenProject, wallId: WallId): Elevation {
  const length = wallLength(project.room, wallId);
  const height = project.room.height;
  const refs = unitRefs(project);
  const unit = project.preferences.unit;
  const shapes: Shape[] = [{ kind: 'rect', x: 0, y: 0, w: length, h: height, style: 'wall' }];
  const onWall = allElements(project).filter((el) => el.wallId === wallId);
  const openings = project.openings.filter((o) => o.wallId === wallId);

  for (const o of openings) {
    const c = viewerU(project, wallId, openingPlacement(project.room, o).position);
    const x0 = c - o.width / 2;
    shapes.push({ kind: 'rect', x: x0, y: o.sill, w: o.width, h: o.height, style: 'opening' });
    if (o.kind === 'window') shapes.push({ kind: 'rect', x: x0 + 60, y: o.sill + 60, w: o.width - 120, h: o.height - 120, style: 'glass' });
    if (o.kind === 'door' && o.swing !== 'none') {
      // Elevation convention: dashed lines from the free edge's corners to the middle of the hinge side.
      const hinge = o.hinge === 'left' ? x0 : x0 + o.width;
      const free = o.hinge === 'left' ? x0 + o.width : x0;
      shapes.push({ kind: 'line', x1: free, y1: 0, x2: hinge, y2: o.height / 2, style: 'swing' }, { kind: 'line', x1: free, y1: o.height, x2: hinge, y2: o.height / 2, style: 'swing' });
    }
  }

  for (const s of deriveCountertops(project).filter((ct) => ct.wallId === wallId)) {
    const us = [viewerU(project, wallId, { x: s.box.minX, z: s.box.minZ }), viewerU(project, wallId, { x: s.box.maxX, z: s.box.maxZ })];
    shapes.push({ kind: 'rect', x: Math.min(...us), y: s.box.minY, w: Math.abs(us[1]! - us[0]!), h: s.box.maxY - s.box.minY, style: 'worktop' });
  }

  const drawn = (el: KitchenElement) => {
    const c = viewerU(project, wallId, el.position);
    const appliance = !isCabinet(el);
    shapes.push({ kind: 'rect', x: c - el.dimensions.width / 2, y: el.position.y, w: el.dimensions.width, h: el.dimensions.height, style: appliance ? 'appliance' : 'carcass' });
    for (const p of buildModel(el).parts) {
      // Only what faces the room: fronts, handles, plinths and (dashed) the interior.
      const style: ShapeStyle | null =
        p.key === 'plinth' ? 'plinth'
        : p.finish === 'handle' && p.group === 'front' ? 'handle'
        : p.finish === 'glassPane' ? 'glass'
        : p.group === 'front' ? 'front'
        : p.group === 'interior' && !p.mover ? 'interior'
        : appliance && p.body ? 'appliance'
        : null;
      if (!style) continue;
      shapes.push({ kind: 'rect', x: c + p.center.x - p.size.x / 2, y: el.position.y + p.center.y - p.size.y / 2, w: p.size.x, h: p.size.y, style });
    }
    shapes.push({ kind: 'tag', x: c, y: el.position.y + el.dimensions.height / 2, text: refs.get(el.id) ?? '' });
  };
  // Floor units first, wall units over them (as they would overlap visually).
  const isWallHung = (el: KitchenElement) => specOf(el).mount === 'wall';
  onWall.filter((el) => !isWallHung(el)).forEach(drawn);
  onWall.filter(isWallHung).forEach(drawn);

  // Width chains: floor units below the floor line, wall units above the ceiling, then the wall.
  const chain = (els: KitchenElement[], y: number) => {
    const spans = els.map((el) => {
      const c = viewerU(project, wallId, el.position);
      return [c - el.dimensions.width / 2, c + el.dimensions.width / 2] as const;
    }).sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [a, b] of spans) {
      if (a - cursor > 1) shapes.push({ kind: 'dim', x1: cursor, y1: y, x2: a, y2: y, text: dimText(a - cursor, unit), vertical: false });
      shapes.push({ kind: 'dim', x1: a, y1: y, x2: b, y2: y, text: dimText(b - a, unit), vertical: false });
      cursor = Math.max(cursor, b);
    }
    if (spans.length && length - cursor > 1) shapes.push({ kind: 'dim', x1: cursor, y1: y, x2: length, y2: y, text: dimText(length - cursor, unit), vertical: false });
  };
  chain(onWall.filter((el) => !isWallHung(el)), -DIM_GAP);
  chain(onWall.filter(isWallHung), height + DIM_GAP);
  shapes.push({ kind: 'dim', x1: 0, y1: -2 * DIM_GAP - 60, x2: length, y2: -2 * DIM_GAP - 60, text: dimText(length, unit), vertical: false });

  // Height chain on the left: plinth, worktop, wall-unit bottoms and tops, ceiling.
  const levels = new Set<number>([0, height]);
  for (const el of onWall) {
    levels.add(el.position.y);
    levels.add(el.position.y + el.dimensions.height);
  }
  for (const s of shapes) if (s.kind === 'rect' && s.style === 'worktop') levels.add(s.y + s.h);
  const ys = [...levels].filter((v) => v >= 0 && v <= height).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) shapes.push({ kind: 'dim', x1: -DIM_GAP, y1: ys[i - 1]!, x2: -DIM_GAP, y2: ys[i]!, text: dimText(ys[i]! - ys[i - 1]!, unit), vertical: true });
  shapes.push({ kind: 'dim', x1: -2 * DIM_GAP - 60, y1: 0, x2: -2 * DIM_GAP - 60, y2: height, text: dimText(height, unit), vertical: true });

  return { wallId, length, height, shapes, empty: onWall.length === 0 && openings.length === 0 };
}
