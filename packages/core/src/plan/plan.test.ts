import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyCommand, CommandError } from '../domain/commands';
import { DEFAULT_RULE_PACK } from '../domain/catalog';
import { emptyPlan, newDecor, newRoomInfo, newWardrobe, rectWalls, sampleProject, uid } from '../domain/factory';
import type { Plan, Project, Wall } from '../domain/types';
import { mm } from '../domain/units';
import { bbox } from '../geometry/furniture';
import { migrateScene } from '../persistence/migrate';
import { SCENE_MIGRATIONS } from '../persistence/sceneMigrations';
import { validateProject } from '../validation';
import { doorSwingZone, openingSpan, wallPieces } from './openings';
import { area, pointInPolygon } from './polygon';
import { detectRooms } from './rooms';
import { snapToWalls, wallGaps } from './snap';
import { wallBody } from './walls';

const T = mm(200);
const H = mm(2800);
const wall = (ax: number, ay: number, bx: number, by: number, t = T): Wall => ({ id: uid('w'), a: { x: mm(ax), y: mm(ay) }, b: { x: mm(bx), y: mm(by) }, thicknessUm: t, heightUm: H });
const plan = (walls: Wall[], extra: Partial<Plan> = {}): Plan => ({ ...emptyPlan(), walls, ...extra });
const m2 = (um2: number) => Math.round(um2 / 1e10) / 100;

describe('room detection', () => {
  it('a rectangle of walls gives one room whose clear floor is exactly inside the faces', () => {
    const rooms = detectRooms(plan(rectWalls(0, 0, mm(4000), mm(3000), T)));
    expect(rooms).toHaveLength(1);
    const b = bbox(rooms[0].interior);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([0, 0, mm(4000), mm(3000)]);
    expect(m2(rooms[0].areaUm2)).toBe(12);
  });

  it('a partition from wall to wall splits it into two rooms (T-junctions)', () => {
    // Centrelines 0..5000 × 0..4000; partition at x = 2000.
    const walls = [wall(0, 0, 5000, 0), wall(5000, 0, 5000, 4000), wall(5000, 4000, 0, 4000), wall(0, 4000, 0, 0), wall(2000, 0, 2000, 4000, mm(100))];
    const rooms = detectRooms(plan(walls));
    expect(rooms).toHaveLength(2);
    // Clear widths: (2000 − 100 − 50) and (3000 − 100 − 50); depth 4000 − 200.
    const areas = rooms.map((r) => m2(r.areaUm2)).sort((a, b) => a - b);
    expect(areas).toEqual([m2(1850e3 * 3800e3), m2(2850e3 * 3800e3)].sort((a, b) => a - b));
  });

  it('an L-shaped room is one concave room with the right area', () => {
    const walls = [wall(0, 0, 4000, 0), wall(4000, 0, 4000, 2000), wall(4000, 2000, 2000, 2000), wall(2000, 2000, 2000, 4000), wall(2000, 4000, 0, 4000), wall(0, 4000, 0, 0)];
    const rooms = detectRooms(plan(walls));
    expect(rooms).toHaveLength(1);
    // Clear L: top band 3800 × 1800 (y 100…1900) plus lower leg 1800 × 2000 (y 1900…3900).
    expect(m2(rooms[0].areaUm2)).toBe(m2(3800e3 * 1800e3 + 1800e3 * 2000e3));
    expect(rooms[0].interior).toHaveLength(6);
  });

  it('crossing partitions make four rooms; dead-end walls are ignored', () => {
    const walls = [...rectWalls(0, 0, mm(6000), mm(6000), T), wall(3000, -100, 3000, 6100, mm(100)), wall(-100, 3000, 6100, 3000, mm(100)), wall(1000, 1000, 1000, 2000, mm(100))];
    const rooms = detectRooms(plan(walls));
    expect(rooms).toHaveLength(4);
  });

  it('an open run of walls encloses nothing and validation says so', () => {
    const walls = [wall(0, 0, 4000, 0), wall(4000, 0, 4000, 3000), wall(4000, 3000, 0, 3000)];
    const p = plan(walls);
    expect(detectRooms(p)).toHaveLength(0);
    const res = validateProject({ plan: p, openings: [], furniture: [], rulePack: DEFAULT_RULE_PACK });
    expect(res.map((r) => r.code)).toContain('NO_ROOM');
  });

  it('stored room names follow their seed point; unmatched rooms get stable defaults', () => {
    const walls = [wall(0, 0, 5000, 0), wall(5000, 0, 5000, 4000), wall(5000, 4000, 0, 4000), wall(0, 4000, 0, 0), wall(2000, 0, 2000, 4000, mm(100))];
    const kitchen = newRoomInfo('Kitchen', { x: mm(3500), y: mm(2000) });
    const rooms = detectRooms(plan(walls, { rooms: [kitchen] }));
    const named = rooms.find((r) => r.info.name === 'Kitchen')!;
    expect(named.id).toBe(kitchen.id);
    expect(pointInPolygon(kitchen.seed, named.interior)).toBe(true);
    const auto = rooms.find((r) => r.auto)!;
    expect(auto.info.name).toBe('Room 1');
    expect(detectRooms(plan(walls, { rooms: [kitchen] })).find((r) => r.auto)!.id).toBe(auto.id);
  });

  it('room count never depends on wall order', () => {
    const walls = [...rectWalls(0, 0, mm(6000), mm(4000), T), wall(3000, -100, 3000, 4100, mm(100))];
    fc.assert(
      fc.property(fc.shuffledSubarray(walls, { minLength: walls.length, maxLength: walls.length }), (shuffled) => detectRooms(plan(shuffled)).length === 2),
      { numRuns: 50 },
    );
  });
});

describe('walls and openings', () => {
  it('wall bodies close corners and openings cut the wall into pieces', () => {
    const p = sampleProject();
    const north = p.plan.walls[0];
    const body = wallBody(north, p.plan);
    expect(Math.round(area(body))).toBe(Math.round((mm(3600) + 2 * mm(230)) * mm(230)));
    const south = p.plan.walls[2];
    const pieces = wallPieces(p.plan, south, p.openings);
    expect(pieces.length).toBeGreaterThanOrEqual(3); // left, right and the lintel over the door
  });

  it('door swing zone lies inside the room on the swing side', () => {
    const p = sampleProject();
    const door = p.openings.find((o) => o.kind === 'door')!;
    const zone = doorSwingZone(p.plan, door)!;
    const [room] = detectRooms(p.plan);
    for (const v of zone) expect(pointInPolygon(v, room.interior, 2)).toBe(true);
  });

  it('a wall carrying an opening cannot be deleted on its own', () => {
    const p = sampleProject();
    const door = p.openings.find((o) => o.kind === 'door')!;
    expect(() => applyCommand(p, { type: 'wall.remove', id: door.wallId })).toThrow(CommandError);
  });

  it('wall gaps and snapping work against wall faces', () => {
    const p = sampleProject();
    const w = { ...newWardrobe(mm(1500), mm(330)), rotDeg: 0 };
    const g = wallGaps(w, p.plan);
    expect(g.north).toBe(mm(30));
    const snapped = snapToWalls(w, p.plan, mm(60), mm(10));
    expect(snapped.y).toBe(mm(300));
  });

  it('furniture through a partition is flagged even when its centre is in a room', () => {
    const walls = [wall(0, 0, 5000, 0), wall(5000, 0, 5000, 4000), wall(5000, 4000, 0, 4000), wall(0, 4000, 0, 0), wall(2000, 0, 2000, 4000, mm(100))];
    const box = newDecor('box', mm(1800), mm(2000));
    const res = validateProject({ plan: plan(walls), openings: [], furniture: [box], rulePack: DEFAULT_RULE_PACK });
    expect(res.some((r) => r.code === 'OUT_OF_ROOM' || r.code === 'CROSSES_WALL')).toBe(true);
  });
});

describe('scene migration v1 → v2', () => {
  // A v1 scene exactly as Phase 0 saved it.
  const v1 = {
    schemaVersion: 1,
    id: 'prj-1',
    name: 'Old',
    client: 'C',
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    room: { name: 'Master bedroom', widthUm: mm(3600), depthUm: mm(3200), ceilingUm: mm(2800), wallThicknessUm: mm(230), source: 'site_measured', floorFinish: 'oak-floor', wallColor: 'warm-white' },
    openings: [
      { id: 'd1', kind: 'door', wall: 'S', offsetUm: mm(150), widthUm: mm(900), heightUm: mm(2100), sillUm: 0, hinge: 'start' },
      { id: 'w1', kind: 'window', wall: 'W', offsetUm: mm(1200), widthUm: mm(1200), heightUm: mm(1350), sillUm: mm(900), hinge: 'start' },
      { id: 'w2', kind: 'window', wall: 'N', offsetUm: mm(500), widthUm: mm(1000), heightUm: mm(1200), sillUm: mm(900), hinge: 'start' },
      { id: 'w3', kind: 'window', wall: 'E', offsetUm: mm(700), widthUm: mm(800), heightUm: mm(1200), sillUm: mm(900), hinge: 'start' },
    ],
    furniture: [{ ...newWardrobe(mm(1200), mm(300)) }],
    rulePack: DEFAULT_RULE_PACK,
    revisions: [],
  };

  it('keeps the room, every opening position and the furniture exactly', () => {
    const p = migrateScene<Project>(v1, 1, SCENE_MIGRATIONS);
    expect(p.schemaVersion).toBe(2);
    expect((p as unknown as { room?: unknown }).room).toBeUndefined();
    const [room] = detectRooms(p.plan);
    expect(room.info.name).toBe('Master bedroom');
    expect(bbox(room.interior)).toEqual({ minX: 0, minY: 0, maxX: mm(3600), maxY: mm(3200) });
    // World position of each opening's jambs on the inside face matches v1's N/E/S/W addressing.
    const span = (id: string) => {
      const sp = openingSpan(p.plan, p.openings.find((o) => o.id === id)!)!;
      const xs = [sp.s.x, sp.e.x].sort((a, b) => a - b);
      const ys = [sp.s.y, sp.e.y].sort((a, b) => a - b);
      return { xs, ys };
    };
    const h = mm(115);
    expect(span('d1')).toEqual({ xs: [mm(150), mm(1050)], ys: [mm(3200) + h, mm(3200) + h] });
    expect(span('w1')).toEqual({ xs: [-h, -h], ys: [mm(1200), mm(2400)] });
    expect(span('w2')).toEqual({ xs: [mm(500), mm(1500)], ys: [-h, -h] });
    expect(span('w3')).toEqual({ xs: [mm(3600) + h, mm(3600) + h], ys: [mm(700), mm(1500)] });
    // v1 'start' hinge on the S wall was the west jamb, which is the far end of the reversed wall.
    expect(p.openings.find((o) => o.id === 'd1')!.hinge).toBe('end');
    expect(p.furniture).toEqual(v1.furniture);
  });

  it('a migrated scene validates without new errors', () => {
    const p = migrateScene<Project>(v1, 1, SCENE_MIGRATIONS);
    const errors = validateProject(p).filter((r) => r.severity === 'error');
    expect(errors).toEqual([]);
  });
});
