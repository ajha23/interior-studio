export interface CameraWaypoint {
  timeSec: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

export interface VideoRenderJob {
  id: string;
  projectId: string;
  title: string;
  durationSec: number;
  resolution: '1080p' | '720p';
  fps: number;
  status: 'queued' | 'rendering' | 'ready' | 'failed';
  progressPct: number;
  waypoints: CameraWaypoint[];
  downloadUrl?: string;
  createdAtIso: string;
  completedAtIso?: string;
}

export interface RoomBoundary {
  width: number;
  length: number;
  height: number;
}

/**
 * Computes a smooth cinematic 30-second camera path visiting the room's key perspectives:
 * 1. Entry door perspective (0s - 7s)
 * 2. Gliding towards counter/appliances (8s - 16s)
 * 3. Pivoting around the room centre (17s - 24s)
 * 4. High-angle wide establishing shot (25s - 30s)
 */
export function generateWalkthroughPath(
  room: RoomBoundary,
  durationSec = 30
): CameraWaypoint[] {
  const eyeHeight = 1500; // 1.5m human eye height in mm
  const midX = room.width / 2;
  const midZ = room.length / 2;

  return [
    {
      timeSec: 0,
      position: { x: midX, y: eyeHeight, z: Math.max(100, room.length - 400) },
      target: { x: midX, y: 900, z: midZ },
      fov: 65,
    },
    {
      timeSec: 8,
      position: { x: midX - room.width * 0.25, y: eyeHeight, z: room.length * 0.7 },
      target: { x: midX, y: 900, z: 200 },
      fov: 60,
    },
    {
      timeSec: 16,
      position: { x: midX, y: eyeHeight, z: 1200 },
      target: { x: midX + 600, y: 900, z: 600 },
      fov: 60,
    },
    {
      timeSec: 24,
      position: { x: midX + room.width * 0.3, y: eyeHeight + 200, z: room.length * 0.6 },
      target: { x: midX, y: 900, z: midZ },
      fov: 65,
    },
    {
      timeSec: durationSec,
      position: { x: midX, y: Math.min(room.height - 200, 2400), z: room.length - 200 },
      target: { x: midX, y: 600, z: midZ },
      fov: 75,
    },
  ];
}

/**
 * Creates an initial video render job payload.
 */
export function createVideoRenderJob(
  projectId: string,
  room: RoomBoundary,
  options?: { durationSec?: number; resolution?: '1080p' | '720p' }
): VideoRenderJob {
  const durationSec = options?.durationSec ?? 30;
  const resolution = options?.resolution ?? '1080p';
  const waypoints = generateWalkthroughPath(room, durationSec);

  return {
    id: `vjob_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    projectId,
    title: `30s 1080p Interior Walkthrough — ${new Date().toLocaleDateString('en-IN')}`,
    durationSec,
    resolution,
    fps: 30,
    status: 'queued',
    progressPct: 0,
    waypoints,
    createdAtIso: new Date().toISOString(),
  };
}

