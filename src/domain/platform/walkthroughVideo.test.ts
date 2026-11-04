import { describe, it, expect } from 'vitest';
import { generateWalkthroughPath, createVideoRenderJob } from './walkthroughVideo';

describe('Walkthrough Video Path & Job Engine (PR-04)', () => {
  const room = { width: 4000, length: 3000, height: 2800 };

  it('generates 5 keyframe waypoints spanning the full 30s duration', () => {
    const waypoints = generateWalkthroughPath(room, 30);
    expect(waypoints.length).toBe(5);
    expect(waypoints[0]?.timeSec).toBe(0);
    expect(waypoints[waypoints.length - 1]?.timeSec).toBe(30);

    // Assert human eye-height maintained at start
    expect(waypoints[0]?.position.y).toBe(1500);
  });

  it('creates an outbox video render job with queued status and waypoints', () => {
    const job = createVideoRenderJob('proj_123', room, { resolution: '1080p', durationSec: 30 });
    expect(job.id).toMatch(/^vjob_/);
    expect(job.status).toBe('queued');
    expect(job.progressPct).toBe(0);
    expect(job.resolution).toBe('1080p');
    expect(job.durationSec).toBe(30);
    expect(job.waypoints.length).toBe(5);
  });
});

