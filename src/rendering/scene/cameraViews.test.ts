import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { cameraGoal, fitDistance } from './cameraViews';

const project = createProject({ name: 'cam', room: DEFAULT_ROOM, layout: 'straight' });

describe('camera goals', () => {
  it('fit keeps the whole room inside the view frustum', () => {
    const g = cameraGoal(project, { kind: 'fit' }, 42, 1.6)!;
    const dist = Math.hypot(g.position[0] - g.target[0], g.position[1] - g.target[1], g.position[2] - g.target[2]);
    expect(dist).toBeGreaterThanOrEqual(fitDistance(g.radius, 42, 1.6, 1));
    expect(g.radius).toBeCloseTo(Math.hypot(4.2, 3.2, 2.7) / 2, 6);
  });

  it('focus targets the element centre and looks at its front', () => {
    const sink = project.cabinets.find((c) => c.type === 'sink')!;
    const g = cameraGoal(project, { kind: 'focus', id: sink.id }, 42, 1.6)!;
    expect(g.target[0]).toBeCloseTo((1300 + 400) / 1000, 6);
    expect(g.target[1]).toBeCloseTo((100 + 360) / 1000, 6);
    // Back-wall unit faces +z, so the camera is in front of it (larger z) and above it.
    expect(g.position[2]).toBeGreaterThan(g.target[2]);
    expect(g.position[1]).toBeGreaterThan(g.target[1]);
  });

  it('returns null for an element that no longer exists', () => {
    expect(cameraGoal(project, { kind: 'focus', id: 'gone' }, 42, 1)).toBeNull();
  });

  it('wall elevations look straight at the wall from inside', () => {
    const g = cameraGoal(project, { kind: 'preset', preset: 'left' }, 42, 1.6)!;
    expect(g.position[0]).toBeGreaterThan(0);
    expect(g.position[1]).toBeCloseTo(g.target[1], 6);
  });
});
