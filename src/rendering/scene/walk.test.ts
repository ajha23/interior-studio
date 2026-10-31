import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { blocked, forward, reachable, standInFront, startPose, step } from './walk';

const project = createProject({ name: 'walk', room: DEFAULT_ROOM, layout: 'straight' });
const range = project.appliances.find((a) => a.type === 'range')!;

describe('walking', () => {
  it('starts by the open front, inside the room, looking at the back wall', () => {
    const p = startPose(project, 1600);
    expect(blocked(project, p.x, p.z)).toBe(false);
    expect(forward(p.yaw).z).toBeLessThan(-0.99);
  });

  it('cannot walk through the run of units or the walls, but slides along them', () => {
    const at = { x: 2000, z: 1200 };
    // Walking straight at the back-wall run stops before it…
    const into = step(project, at, 0, -900);
    expect(into).toEqual(at);
    // …while a diagonal step slides along it.
    expect(step(project, at, 300, -900)).toEqual({ x: 2300, z: 1200 });
    expect(blocked(project, 100, 1500)).toBe(true);
  });

  it('stands in front of the range, an arm’s length away, looking down at the cooktop', () => {
    const p = standInFront(project, range, 1600);
    expect(blocked(project, p.x, p.z)).toBe(false);
    expect(p.x).toBeCloseTo(range.position.x, 6);
    expect(p.z).toBeGreaterThan(range.position.z + range.dimensions.depth / 2);
    expect(p.z - range.position.z).toBeLessThan(1000);
    const f = forward(p.yaw);
    expect(f.z).toBeLessThan(-0.99); // facing the back wall, i.e. the range
    expect(p.pitch).toBeLessThan(0); // looking down at the 860 mm cooktop
  });

  it('a floor click next to a cabinet walks to the nearest free spot on the way', () => {
    const from = { x: 2000, z: 2000 };
    const to = reachable(project, from, { x: 2000, z: 300 });
    expect(blocked(project, to.x, to.z)).toBe(false);
    expect(to.z).toBeLessThan(1500);
  });
});
