import { GizmoHelper, GizmoViewcube, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrthographicCamera as OrthoCam, Vector3 } from 'three';
import type { KitchenProject } from '@/domain';
import type { CameraRequest, Projection } from '@/state/editorStore';
import { cameraGoal } from './cameraViews';
import { WalkControls } from './WalkControls';

const FOV = 42;
const DURATION = 0.45;

interface Controls {
  target: Vector3;
  enabled: boolean;
  update: () => void;
  addEventListener: (type: 'start', listener: () => void) => void;
  removeEventListener: (type: 'start', listener: () => void) => void;
}

interface Flight {
  t: number;
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromZoom: number;
  toZoom: number;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Orbit/pan/zoom controls, perspective or parallel projection, a ViewCube, and animated camera
 * flights to standard views, the whole room (zoom extents) or one element (focus). Orbiting after a
 * focus pivots around the focused element. Grabbing the controls cancels a flight.
 */
export function CameraRig(props: { project: KitchenProject; request: CameraRequest; nonce: number; projection: Projection; walk: WalkProps | null }) {
  // Walking replaces the orbit camera, controls and ViewCube with a first-person camera.
  if (props.walk) return <WalkControls project={props.project} {...props.walk} />;
  return <OrbitRig {...props} />;
}

type WalkProps = Omit<Parameters<typeof WalkControls>[0], 'project'>;

function OrbitRig({ project, request, nonce, projection }: { project: KitchenProject; request: CameraRequest; nonce: number; projection: Projection }) {
  const get = useThree((s) => s.get);
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    const { camera, controls, size } = get();
    const c = controls as unknown as Controls | null;
    if (!c) return;
    const aspect = size.width / Math.max(1, size.height);
    const g = cameraGoal(project, request, FOV, aspect);
    if (!g) return;
    const toPos = new Vector3(...g.position);
    const ortho = camera instanceof OrthoCam;
    const toZoom = ortho ? (Math.min(size.width, size.height) / (2 * g.radius)) * 0.9 : 1;
    flight.current = { t: 0, fromPos: camera.position.clone(), toPos, fromTarget: c.target.clone(), toTarget: new Vector3(...g.target), fromZoom: (camera as OrthoCam).zoom ?? 1, toZoom };
    const cancel = () => (flight.current = null);
    c.addEventListener('start', cancel);
    return () => c.removeEventListener('start', cancel);
    // Fly only on an explicit request (nonce) or a projection switch, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, projection, get]);

  useFrame((_, dt) => {
    const f = flight.current;
    if (!f) return;
    const { camera, controls } = get();
    const c = controls as unknown as Controls | null;
    if (!c) return;
    f.t = Math.min(1, f.t + dt / DURATION);
    const k = ease(f.t);
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    c.target.lerpVectors(f.fromTarget, f.toTarget, k);
    if (camera instanceof OrthoCam) {
      camera.zoom = f.fromZoom + (f.toZoom - f.fromZoom) * k;
      camera.updateProjectionMatrix();
    }
    c.update();
    if (f.t >= 1) flight.current = null;
  });

  return (
    <>
      {projection === 'perspective' ? (
        <PerspectiveCamera makeDefault fov={FOV} near={0.05} far={200} position={[6, 4, 8]} />
      ) : (
        <OrthographicCamera makeDefault near={-100} far={200} zoom={120} position={[6, 4, 8]} />
      )}
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={0.3} maxDistance={40} screenSpacePanning />
      <GizmoHelper alignment="top-right" margin={[76, 76]}>
        <GizmoViewcube color="#f4f4f5" textColor="#27272a" strokeColor="#a1a1aa" hoverColor="#93c5fd" opacity={0.95} />
      </GizmoHelper>
    </>
  );
}

