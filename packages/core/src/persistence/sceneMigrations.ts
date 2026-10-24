import { DEFAULT_CEILING, rectWalls } from '../domain/factory';
import { SCHEMA_VERSION, type Opening, type Plan, type RoomInfo } from '../domain/types';
import type { MigrationRegistry } from './migrate';

/** Shape of the v1 single-room scene, kept here only so the migration is type-checked. */
interface V1Room {
  name: string;
  widthUm: number;
  depthUm: number;
  ceilingUm: number;
  wallThicknessUm: number;
  source: Plan['source'];
  floorFinish: string;
  wallColor: string;
}
interface V1Opening {
  id: string;
  kind: 'door' | 'window';
  wall: 'N' | 'E' | 'S' | 'W';
  offsetUm: number;
  widthUm: number;
  heightUm: number;
  sillUm: number;
  hinge: 'start' | 'end';
}
interface V1Core {
  room: V1Room;
  openings: V1Opening[];
  furniture: unknown[];
  rulePack: unknown;
}

/**
 * v1 → v2: one rectangular room becomes four walls (inside corner stays at the origin, so furniture
 * coordinates are unchanged) and each N/E/S/W opening is re-addressed to its wall by id and offset.
 */
function coreV1toV2(core: V1Core) {
  const r = core.room;
  const h = r.wallThicknessUm / 2;
  const walls = rectWalls(0, 0, r.widthUm, r.depthUm, r.wallThicknessUm, r.ceilingUm);
  // rectWalls order and direction: N west→east, E north→south, S east→west, W south→north; room on side +1.
  const byside = { N: walls[0], E: walls[1], S: walls[2], W: walls[3] };
  const openings: Opening[] = core.openings.map((o) => {
    const wall = byside[o.wall];
    const reversed = o.wall === 'S' || o.wall === 'W';
    const len = o.wall === 'S' ? r.widthUm : o.wall === 'W' ? r.depthUm : 0;
    const offsetUm = reversed ? len + h - o.offsetUm - o.widthUm : o.offsetUm + h;
    const hinge = reversed ? (o.hinge === 'start' ? 'end' : 'start') : o.hinge;
    return { id: o.id, kind: o.kind, wallId: wall.id, offsetUm, widthUm: o.widthUm, heightUm: o.heightUm, sillUm: o.sillUm, hinge, side: 1 };
  });
  const room: RoomInfo = {
    id: `room-${walls[0].id.slice(5)}`,
    name: r.name,
    seed: { x: Math.round(r.widthUm / 2), y: Math.round(r.depthUm / 2) },
    ceilingUm: r.ceilingUm,
    floorFinish: r.floorFinish,
    wallColor: r.wallColor,
  };
  const plan: Plan = { walls, rooms: [room], source: r.source, defaultWallThicknessUm: r.wallThicknessUm, defaultCeilingUm: r.ceilingUm || DEFAULT_CEILING };
  return { plan, openings, furniture: core.furniture, rulePack: core.rulePack };
}

function projectV1toV2(scene: unknown): unknown {
  const p = scene as V1Core & { revisions?: { snapshot: V1Core }[]; schemaVersion: number } & Record<string, unknown>;
  const { room: _room, ...rest } = p;
  const core = coreV1toV2(p);
  return {
    ...rest,
    ...core,
    schemaVersion: 2,
    // Issued revisions keep their v1 hash (it fingerprints what was issued); snapshots are upgraded for display.
    revisions: (p.revisions ?? []).map((rev) => ({ ...rev, snapshot: coreV1toV2(rev.snapshot) })),
  };
}

/** Scene schema history. Add a step whenever the Project shape changes. */
export const SCENE_MIGRATIONS: MigrationRegistry = {
  current: SCHEMA_VERSION,
  steps: {
    1: projectV1toV2,
    // v3 adds catalogue/model furniture kinds and optional wall face finishes: purely additive.
    2: (scene) => ({ ...(scene as Record<string, unknown>), schemaVersion: 3 }),
  },
};
