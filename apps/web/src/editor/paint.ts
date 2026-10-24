import { FINISHES, materialById, uid, type Command, type DetectedRoom, type Project, type WallSideSign } from '@studio/core';

export type PaintTarget =
  | { kind: 'floor'; roomId: string }
  | { kind: 'wall'; wallId: string; side: WallSideSign }
  | { kind: 'room-walls'; roomId: string }
  | { kind: 'furniture'; id: string; part: 'main' | 'accent' };

/** Command that applies a material to one target, or null when it doesn't apply. */
export function paintCommand(project: Project, rooms: DetectedRoom[], target: PaintTarget, materialId: string): { cmd: Command; label: string } | null {
  const m = materialById(materialId);
  if (target.kind === 'floor' || target.kind === 'room-walls') {
    const room = rooms.find((r) => r.id === target.roomId);
    if (!room) return null;
    const patch = target.kind === 'floor' ? { floorFinish: m.id } : { wallColor: m.id };
    return { cmd: { type: 'room.upsert', info: { ...room.info, ...patch, id: room.auto ? uid('room') : room.info.id } }, label: target.kind === 'floor' ? `Floor: ${m.name}` : `Walls: ${m.name}` };
  }
  if (target.kind === 'wall') {
    const w = project.plan.walls.find((x) => x.id === target.wallId);
    if (!w) return null;
    const finishes = { ...w.finishes, [target.side === 1 ? 'pos' : 'neg']: m.id };
    return { cmd: { type: 'wall.update', id: w.id, patch: { finishes } }, label: `Wall face: ${m.name}` };
  }
  const f = project.furniture.find((x) => x.id === target.id);
  if (!f) return null;
  if (f.kind === 'library') return { cmd: { type: 'furniture.update', id: f.id, patch: { materials: { ...f.materials, [target.part]: m.id } } }, label: `${f.name}: ${m.name}` };
  if (f.kind === 'wardrobe' || f.kind === 'tvunit') {
    // Parametric pieces only take board finishes from the manufacturable list.
    if (!FINISHES.some((x) => x.id === m.id)) return null;
    return { cmd: { type: 'furniture.update', id: f.id, patch: { materials: { ...f.materials, [target.part === 'main' ? 'shutter' : 'carcass']: m.id } } }, label: `${f.name}: ${m.name}` };
  }
  if (f.kind === 'model') return null;
  return { cmd: { type: 'furniture.params', id: f.id, params: { color: m.color } }, label: `${f.name}: ${m.name}` };
}
