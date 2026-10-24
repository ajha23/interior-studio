import type { FurnitureItem, Opening, Plan, Project, RoomInfo, RulePack, Wall } from './types';
import { lightingOf, type Lighting } from './lighting';

/**
 * Every mutation is a typed, serializable command. The same commands drive undo/redo,
 * autosave, the audit trail and — later — AI tool calls and server-side re-validation.
 */
export type Command =
  | { type: 'project.meta'; patch: { name?: string; client?: string } }
  | { type: 'lighting.update'; patch: Partial<Lighting> }
  | { type: 'plan.update'; patch: Partial<Omit<Plan, 'walls' | 'rooms'>> }
  | { type: 'wall.add'; wall: Wall; index?: number }
  | { type: 'wall.update'; id: string; patch: Partial<Omit<Wall, 'id'>> }
  | { type: 'wall.remove'; id: string }
  | { type: 'room.upsert'; info: RoomInfo }
  | { type: 'room.remove'; id: string }
  | { type: 'rulepack.update'; patch: Partial<RulePack> }
  | { type: 'opening.add'; opening: Opening; index?: number }
  | { type: 'opening.update'; id: string; patch: Partial<Opening> }
  | { type: 'opening.remove'; id: string }
  | { type: 'furniture.add'; item: FurnitureItem; index?: number }
  | { type: 'furniture.update'; id: string; patch: Record<string, unknown> }
  | { type: 'furniture.params'; id: string; params: Record<string, unknown> }
  | { type: 'furniture.remove'; id: string }
  | { type: 'batch'; label: string; commands: Command[] };

export class CommandError extends Error {}

function pick<T extends object>(obj: T, keys: string[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of keys) o[k] = (obj as Record<string, unknown>)[k];
  return o;
}

/** Apply a command; returns the next project and the command that exactly reverses it. */
export function applyCommand(p: Project, cmd: Command): [Project, Command] {
  switch (cmd.type) {
    case 'project.meta': {
      const inv = { type: 'project.meta', patch: pick(p, Object.keys(cmd.patch)) } as Command;
      return [{ ...p, ...cmd.patch }, inv];
    }
    case 'lighting.update': {
      const cur = lightingOf(p);
      const inv: Command = { type: 'lighting.update', patch: pick(cur, Object.keys(cmd.patch)) as Partial<Lighting> };
      return [{ ...p, lighting: { ...cur, ...cmd.patch } }, inv];
    }
    case 'plan.update': {
      const inv: Command = { type: 'plan.update', patch: pick(p.plan, Object.keys(cmd.patch)) as Partial<Plan> };
      return [{ ...p, plan: { ...p.plan, ...cmd.patch } }, inv];
    }
    case 'wall.add': {
      if (p.plan.walls.some((w) => w.id === cmd.wall.id)) throw new CommandError(`Wall ${cmd.wall.id} already exists`);
      const walls = [...p.plan.walls];
      walls.splice(cmd.index ?? walls.length, 0, cmd.wall);
      return [{ ...p, plan: { ...p.plan, walls } }, { type: 'wall.remove', id: cmd.wall.id }];
    }
    case 'wall.update': {
      const cur = p.plan.walls.find((w) => w.id === cmd.id);
      if (!cur) throw new CommandError(`Wall ${cmd.id} not found`);
      const inv: Command = { type: 'wall.update', id: cmd.id, patch: pick(cur, Object.keys(cmd.patch)) as Partial<Wall> };
      return [{ ...p, plan: { ...p.plan, walls: p.plan.walls.map((w) => (w.id === cmd.id ? { ...w, ...cmd.patch } : w)) } }, inv];
    }
    case 'wall.remove': {
      const index = p.plan.walls.findIndex((w) => w.id === cmd.id);
      if (index < 0) throw new CommandError(`Wall ${cmd.id} not found`);
      if (p.openings.some((o) => o.wallId === cmd.id)) throw new CommandError('Remove the doors and windows on this wall first.');
      return [{ ...p, plan: { ...p.plan, walls: p.plan.walls.filter((_, i) => i !== index) } }, { type: 'wall.add', wall: p.plan.walls[index], index }];
    }
    case 'room.upsert': {
      const index = p.plan.rooms.findIndex((r) => r.id === cmd.info.id);
      const rooms = index < 0 ? [...p.plan.rooms, cmd.info] : p.plan.rooms.map((r, i) => (i === index ? cmd.info : r));
      const inv: Command = index < 0 ? { type: 'room.remove', id: cmd.info.id } : { type: 'room.upsert', info: p.plan.rooms[index] };
      return [{ ...p, plan: { ...p.plan, rooms } }, inv];
    }
    case 'room.remove': {
      const cur = p.plan.rooms.find((r) => r.id === cmd.id);
      if (!cur) throw new CommandError(`Room ${cmd.id} not found`);
      return [{ ...p, plan: { ...p.plan, rooms: p.plan.rooms.filter((r) => r.id !== cmd.id) } }, { type: 'room.upsert', info: cur }];
    }
    case 'rulepack.update': {
      const keys = [...Object.keys(cmd.patch), 'version'];
      const inv: Command = { type: 'rulepack.update', patch: pick(p.rulePack, keys) as Partial<RulePack> };
      const version = cmd.patch.version ?? p.rulePack.version + 1;
      return [{ ...p, rulePack: { ...p.rulePack, ...cmd.patch, version } }, inv];
    }
    case 'opening.add': {
      if (!p.plan.walls.some((w) => w.id === cmd.opening.wallId)) throw new CommandError('An opening must sit on a wall.');
      const openings = [...p.openings];
      openings.splice(cmd.index ?? openings.length, 0, cmd.opening);
      return [{ ...p, openings }, { type: 'opening.remove', id: cmd.opening.id }];
    }
    case 'opening.update': {
      const cur = p.openings.find((o) => o.id === cmd.id);
      if (!cur) throw new CommandError(`Opening ${cmd.id} not found`);
      const inv: Command = { type: 'opening.update', id: cmd.id, patch: pick(cur, Object.keys(cmd.patch)) as Partial<Opening> };
      return [{ ...p, openings: p.openings.map((o) => (o.id === cmd.id ? { ...o, ...cmd.patch } : o)) }, inv];
    }
    case 'opening.remove': {
      const index = p.openings.findIndex((o) => o.id === cmd.id);
      if (index < 0) throw new CommandError(`Opening ${cmd.id} not found`);
      return [{ ...p, openings: p.openings.filter((_, i) => i !== index) }, { type: 'opening.add', opening: p.openings[index], index }];
    }
    case 'furniture.add': {
      const furniture = [...p.furniture];
      furniture.splice(cmd.index ?? furniture.length, 0, cmd.item);
      return [{ ...p, furniture }, { type: 'furniture.remove', id: cmd.item.id }];
    }
    case 'furniture.update': {
      const cur = p.furniture.find((f) => f.id === cmd.id);
      if (!cur) throw new CommandError(`Furniture ${cmd.id} not found`);
      const inv: Command = { type: 'furniture.update', id: cmd.id, patch: pick(cur, Object.keys(cmd.patch)) };
      return [{ ...p, furniture: p.furniture.map((f) => (f.id === cmd.id ? ({ ...f, ...cmd.patch } as FurnitureItem) : f)) }, inv];
    }
    case 'furniture.params': {
      const cur = p.furniture.find((f) => f.id === cmd.id);
      if (!cur) throw new CommandError(`Furniture ${cmd.id} not found`);
      const inv: Command = { type: 'furniture.params', id: cmd.id, params: pick(cur.params, Object.keys(cmd.params)) };
      return [{ ...p, furniture: p.furniture.map((f) => (f.id === cmd.id ? ({ ...f, params: { ...f.params, ...cmd.params } } as FurnitureItem) : f)) }, inv];
    }
    case 'furniture.remove': {
      const index = p.furniture.findIndex((f) => f.id === cmd.id);
      if (index < 0) throw new CommandError(`Furniture ${cmd.id} not found`);
      return [{ ...p, furniture: p.furniture.filter((_, i) => i !== index) }, { type: 'furniture.add', item: p.furniture[index], index }];
    }
    case 'batch': {
      let cur = p;
      const inverses: Command[] = [];
      for (const c of cmd.commands) {
        const [next, inv] = applyCommand(cur, c);
        cur = next;
        inverses.unshift(inv);
      }
      return [cur, { type: 'batch', label: cmd.label, commands: inverses }];
    }
  }
}

export function describe(cmd: Command): string {
  switch (cmd.type) {
    case 'project.meta': return 'Rename project';
    case 'lighting.update': return 'Change lighting';
    case 'plan.update': return 'Edit plan settings';
    case 'wall.add': return 'Add wall';
    case 'wall.update': return 'Edit wall';
    case 'wall.remove': return 'Delete wall';
    case 'room.upsert': return 'Edit room';
    case 'room.remove': return 'Reset room';
    case 'rulepack.update': return 'Edit construction rules';
    case 'opening.add': return `Add ${cmd.opening.kind}`;
    case 'opening.update': return 'Edit opening';
    case 'opening.remove': return 'Remove opening';
    case 'furniture.add': return `Add ${cmd.item.name}`;
    case 'furniture.update': return 'Move / edit furniture';
    case 'furniture.params': return 'Change dimensions';
    case 'furniture.remove': return 'Delete furniture';
    case 'batch': return cmd.label;
  }
}
