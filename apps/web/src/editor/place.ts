import { coreOf, envelope, footprint, interiorPoint, isParametric, normDeg, outsideDistance, penetration, sideOf, validateProject, wallGeom, wallPoint, type FurnitureItem } from '@studio/core';
import { useStudio } from './store';
import { useRooms } from './hooks';

/**
 * Returns a function that drops a new piece into the target room (the selected room, else the
 * room of the selected piece, else the largest room) at the first spot that raises no issue:
 * the room centre for loose pieces, then backed against each wall.
 */
export function usePlaceFurniture() {
  const rooms = useRooms();
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);

  const targetRoom = (() => {
    if (selection?.kind === 'room') return rooms.find((r) => r.id === selection.id) ?? rooms[0];
    if (selection?.kind === 'furniture') {
      const f = project.furniture.find((x) => x.id === selection.id);
      if (f) return rooms.find((r) => outsideDistance(footprint(f), r.interior) === 0) ?? rooms[0];
    }
    return rooms[0];
  })();

  const place = (item: FurnitureItem, opts: { againstWall?: boolean } = {}) => {
    if (!targetRoom) {
      dispatch({ type: 'furniture.add', item }, `Add ${item.name}`);
      select({ kind: 'furniture', id: item.id });
      return;
    }
    const plan = project.plan;
    const env = envelope(item);
    const others = project.furniture.map((f) => ({ fp: footprint(f), env: envelope(f) }));
    const free = (c: FurnitureItem) =>
      outsideDistance(footprint(c), targetRoom.interior) <= 1000 &&
      others.every((o) => !(o.env.zMinUm < env.heightUm && env.zMinUm < o.env.heightUm) || penetration(footprint(c), o.fp) === 0) &&
      !validateProject({ ...coreOf(project), furniture: [...project.furniture, c] }, rooms).some((r) => r.itemIds.includes(c.id) && r.severity === 'error');
    const centre = interiorPoint(targetRoom.interior);
    const candidates: FurnitureItem[] = [];
    if (!isParametric(item) && !opts.againstWall) candidates.push({ ...item, xUm: centre.x, yUm: centre.y });
    for (const t of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      for (const wid of targetRoom.wallIds) {
        const w = plan.walls.find((x) => x.id === wid);
        if (!w) continue;
        const g = wallGeom(w);
        const side = sideOf(g, centre);
        const n = { x: g.n.x * side, y: g.n.y * side };
        const along = Math.min(Math.max(g.len * t, env.widthUm / 2), g.len - env.widthUm / 2);
        const c = wallPoint(g, along, side * (w.thicknessUm / 2 + env.depthUm / 2));
        candidates.push({ ...item, xUm: c.x, yUm: c.y, rotDeg: normDeg((Math.atan2(-n.x, n.y) * 180) / Math.PI) });
      }
    }
    if (opts.againstWall) candidates.push({ ...item, xUm: centre.x, yUm: centre.y });
    const placed = candidates.find(free) ?? candidates[0] ?? item;
    dispatch({ type: 'furniture.add', item: { ...placed, xUm: Math.round(placed.xUm), yUm: Math.round(placed.yUm), rotDeg: Math.round(placed.rotDeg * 1000) / 1000 } }, `Add ${item.name}`);
    select({ kind: 'furniture', id: item.id });
  };

  return { place, targetRoom };
}
