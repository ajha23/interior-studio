import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import { finishById, FLOOR_FINISHES, WALL_COLORS } from '@studio/core';
import { useStudio } from './store';
import { isParametric, type FurnitureItem, type Project } from '@studio/core';
import { toM } from '@studio/core';
import { decorBoxes, envelope, interiorPoint, pointInPolygon, resolveParametric, wallGeom, wallPieces, wallPoint, type ColoredBox, type DetectedRoom } from '@studio/core';
import { useRooms } from './hooks';
import { planBounds } from './PlanView';

const BACK_COLOR = '#d9c7a4';

function Furniture({ f, project, selected, xray, onSelect }: { f: FurnitureItem; project: Project; selected: boolean; xray: boolean; onSelect: () => void }) {
  const env = envelope(f);
  const boxes: ColoredBox[] = useMemo(() => {
    if (!isParametric(f)) return decorBoxes(f);
    const r = resolveParametric(f, project.rulePack);
    const carcass = finishById(f.materials.carcass).color;
    const shutter = finishById(f.materials.shutter).color;
    return r.parts.map((p) => ({ ...p.box, key: p.key, color: p.material === 'shutter' ? shutter : p.material === 'back' ? BACK_COLOR : p.role === 'drawer-box' ? '#e9e1d2' : carcass, role: p.role }));
  }, [f, project.rulePack]);
  const W = env.widthUm;
  const D = env.depthUm;
  const outlineBox = useMemo(() => new THREE.BoxGeometry(toM(W) + 0.02, toM(env.heightUm - env.zMinUm) + 0.02, toM(D) + 0.02), [W, D, env.heightUm, env.zMinUm]);
  return (
    <group
      position={[toM(f.xUm), 0, toM(f.yUm)]}
      rotation={[0, -(f.rotDeg * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {boxes.map((b) => {
        const isFront = (b as ColoredBox & { role?: string }).role === 'shutter' || (b as ColoredBox & { role?: string }).role === 'drawer-front';
        return (
          <mesh key={b.key} castShadow receiveShadow position={[toM(b.x + b.w / 2 - W / 2), toM(b.z + b.h / 2), toM(b.y + b.d / 2 - D / 2)]}>
            <boxGeometry args={[toM(b.w), toM(b.h), toM(b.d)]} />
            <meshStandardMaterial key={xray && isFront ? 'x' : 'o'} color={b.color} roughness={0.62} metalness={0.02} transparent={xray && isFront} opacity={xray && isFront ? 0.12 : 1} depthWrite={!(xray && isFront)} />
          </mesh>
        );
      })}
      {selected && (
        <lineSegments position={[0, toM(env.zMinUm + (env.heightUm - env.zMinUm) / 2), 0]}>
          <edgesGeometry args={[outlineBox]} />
          <lineBasicMaterial color="#1f9a74" />
        </lineSegments>
      )}
    </group>
  );
}

function Walls({ project, rooms }: { project: Project; rooms: DetectedRoom[] }) {
  const { plan, openings } = project;
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const { camera } = useThree();
  // Exterior walls have a room on one side only; their outward normal decides the cut-away.
  const outward = useMemo(() => {
    const m = new Map<string, { x: number; z: number; mx: number; mz: number }>();
    for (const w of plan.walls) {
      const g = wallGeom(w);
      const probe = (side: 1 | -1) => wallPoint(g, g.len / 2, side * (w.thicknessUm / 2 + 50_000));
      const inPos = rooms.some((r) => pointInPolygon(probe(1), r.interior));
      const inNeg = rooms.some((r) => pointInPolygon(probe(-1), r.interior));
      if (inPos === inNeg) continue; // interior partition or free-standing wall: always shown
      const sign = inPos ? -1 : 1;
      const mid = wallPoint(g, g.len / 2);
      m.set(w.id, { x: g.n.x * sign, z: g.n.y * sign, mx: toM(mid.x), mz: toM(mid.y) });
    }
    return m;
  }, [plan.walls, rooms]);
  // A wall takes the colour of the first room it bounds.
  const colorOf = (wallId: string) => {
    const r = rooms.find((x) => x.wallIds.includes(wallId));
    return WALL_COLORS.find((c) => c.id === (r?.info.wallColor ?? 'warm-white'))?.color ?? '#eee';
  };

  // Cut-away: hide exterior walls whose outside face points at the camera, so rooms stay visible.
  useFrame(() => {
    const p = camera.position;
    for (const w of plan.walls) {
      const g = groups.current[w.id];
      if (!g) continue;
      const o = outward.get(w.id);
      g.visible = !o || (p.x - o.mx) * o.x + (p.z - o.mz) * o.z <= 0 || p.y > 25;
    }
  });

  return (
    <>
      {plan.walls.map((w) => {
        const g = wallGeom(w);
        const rotY = -Math.atan2(g.u.y, g.u.x);
        const color = colorOf(w.id);
        return (
          <group key={w.id} ref={(el) => { groups.current[w.id] = el; }}>
            {wallPieces(plan, w, openings).map((pc, i) => {
              const mid = wallPoint(g, (pc.a0 + pc.a1) / 2);
              return (
                <mesh key={i} position={[toM(mid.x), toM((pc.z0 + pc.z1) / 2), toM(mid.y)]} rotation={[0, rotY, 0]} receiveShadow castShadow>
                  <boxGeometry args={[toM(pc.a1 - pc.a0), toM(pc.z1 - pc.z0), toM(w.thicknessUm)]} />
                  <meshStandardMaterial color={color} roughness={0.95} />
                </mesh>
              );
            })}
            {openings
              .filter((o) => o.wallId === w.id && o.kind === 'window')
              .map((o) => {
                const mid = wallPoint(g, o.offsetUm + o.widthUm / 2);
                return (
                  <mesh key={o.id} position={[toM(mid.x), toM(o.sillUm + o.heightUm / 2), toM(mid.y)]} rotation={[0, rotY, 0]}>
                    <boxGeometry args={[toM(o.widthUm), toM(o.heightUm), 0.02]} />
                    <meshStandardMaterial color="#b9d6e3" transparent opacity={0.35} roughness={0.1} />
                  </mesh>
                );
              })}
          </group>
        );
      })}
      {rooms.map((r) => (
        <Floor key={r.id} room={r} />
      ))}
    </>
  );
}

function Floor({ room }: { room: DetectedRoom }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.interior.forEach((v, i) => (i === 0 ? s.moveTo(toM(v.x), -toM(v.y)) : s.lineTo(toM(v.x), -toM(v.y))));
    s.closePath();
    return s;
  }, [room.interior]);
  const color = FLOOR_FINISHES.find((x) => x.id === room.info.floorFinish)?.color ?? '#ccc';
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

type Preset = 'corner' | 'top' | 'front';

function Scene({ preset, presetNonce, xray }: { preset: Preset; presetNonce: number; xray: boolean }) {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const rooms = useRooms();
  const bounds = planBounds(project.plan);
  const X0 = toM(bounds.minX);
  const Z0 = toM(bounds.minY);
  const W = toM(bounds.maxX - bounds.minX);
  const D = toM(bounds.maxY - bounds.minY);
  const H = toM(Math.max(project.plan.defaultCeilingUm, ...rooms.map((r) => r.info.ceilingUm)));
  const applied = useRef(-1);

  useFrame(() => {
    if (applied.current === presetNonce || !controls.current) return;
    applied.current = presetNonce;
    const target = new THREE.Vector3(X0 + W / 2, H * 0.35, Z0 + D / 2);
    if (preset === 'top') camera.position.set(X0 + W / 2, Math.max(W, D) * 1.6, Z0 + D / 2 + 0.01);
    else if (preset === 'front') {
      const f = selection?.kind === 'furniture' ? project.furniture.find((x) => x.id === selection.id) : null;
      if (f) {
        const a = (f.rotDeg * Math.PI) / 180;
        const fx = toM(f.xUm);
        const fz = toM(f.yUm);
        const dist = Math.max(toM(envelope(f).widthUm), 1.5) * 1.3;
        target.set(fx, toM(envelope(f).heightUm) / 2, fz);
        camera.position.set(fx - Math.sin(a) * dist, toM(envelope(f).heightUm) * 0.55, fz + Math.cos(a) * dist);
      } else camera.position.set(X0 + W / 2, H * 0.5, Z0 + D * 1.9);
    } else camera.position.set(X0 + W * 1.75, H * 2.1, Z0 + D * 2.05);
    controls.current.target.copy(target);
    controls.current.update();
  });

  return (
    <>
      <hemisphereLight args={['#fff8ec', '#8a8070', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[X0 + W * 0.2, H * 2.4, Z0 + D * 1.4]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-Math.max(6, W)} shadow-camera-right={Math.max(6, W)} shadow-camera-top={Math.max(6, D)} shadow-camera-bottom={-Math.max(6, D)} shadow-bias={-0.0004} />
      {rooms.slice(0, 8).map((r) => {
        const c = interiorPoint(r.interior);
        return <pointLight key={r.id} position={[toM(c.x), toM(r.info.ceilingUm) - 0.2, toM(c.y)]} intensity={1.2} distance={8} color="#ffe9c7" />;
      })}
      <Walls project={project} rooms={rooms} />
      <group onPointerMissed={() => select(null)}>
        {project.furniture.map((f) => (
          <Furniture key={f.id} f={f} project={project} xray={xray} selected={selection?.kind === 'furniture' && selection.id === f.id} onSelect={() => select({ kind: 'furniture', id: f.id })} />
        ))}
      </group>
      <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.6} maxDistance={30} />
    </>
  );
}

export function View3D() {
  const [preset, setPreset] = useState<Preset>('corner');
  const [nonce, setNonce] = useState(0);
  const [xray, setXray] = useState(false);
  const go = (p: Preset) => {
    setPreset(p);
    setNonce((n) => n + 1);
  };
  return (
    <div className="view">
      <div className="view-label">3D · same model</div>
      <div className="view-tools">
        <button className={`btn ${xray ? 'on' : ''}`} onClick={() => setXray((x) => !x)} title="See inside cabinets">
          Interior
        </button>
        <button className="btn" onClick={() => go('corner')}>Corner</button>
        <button className="btn" onClick={() => go('front')}>Front</button>
        <button className="btn" onClick={() => go('top')}>Top</button>
      </div>
      <div className="three-wrap">
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, near: 0.05, far: 100, position: [5, 4, 5] }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
          <Scene preset={preset} presetNonce={nonce} xray={xray} />
        </Canvas>
      </div>
    </div>
  );
}
