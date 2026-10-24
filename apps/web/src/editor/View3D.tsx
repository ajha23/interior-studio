import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import { finishById, FLOOR_FINISHES, WALL_COLORS } from '@studio/core';
import { useStudio } from './store';
import { isParametric, type FurnitureItem, type Project, type WallSide } from '@studio/core';
import { toM, type Um } from '@studio/core';
import { decorBoxes, envelope, resolveParametric, type ColoredBox } from '@studio/core';
import { wallPieces } from '@studio/core';

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

const SIDES: WallSide[] = ['N', 'E', 'S', 'W'];

function Walls({ project }: { project: Project }) {
  const { room, openings } = project;
  const T = room.wallThicknessUm;
  const color = WALL_COLORS.find((c) => c.id === room.wallColor)?.color ?? '#eee';
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const { camera } = useThree();
  const cx = toM(room.widthUm) / 2;
  const cz = toM(room.depthUm) / 2;

  useFrame(() => {
    for (const side of SIDES) {
      const g = groups.current[side];
      if (!g) continue;
      const p = camera.position;
      const hide = (side === 'N' && p.z < 0) || (side === 'S' && p.z > toM(room.depthUm)) || (side === 'W' && p.x < 0) || (side === 'E' && p.x > toM(room.widthUm));
      g.visible = !hide;
    }
  });

  const piece = (side: WallSide, a0: Um, a1: Um, z0: Um, z1: Um, key: string) => {
    const len = toM(a1 - a0);
    const h = toM(z1 - z0);
    const t = toM(T);
    const mid = toM((a0 + a1) / 2);
    const y = toM((z0 + z1) / 2);
    let pos: [number, number, number];
    let size: [number, number, number];
    if (side === 'N') {
      pos = [mid, y, -t / 2];
      size = [len, h, t];
    } else if (side === 'S') {
      pos = [mid, y, toM(room.depthUm) + t / 2];
      size = [len, h, t];
    } else if (side === 'W') {
      pos = [-t / 2, y, mid];
      size = [t, h, len];
    } else {
      pos = [toM(room.widthUm) + t / 2, y, mid];
      size = [t, h, len];
    }
    return (
      <mesh key={key} position={pos} receiveShadow castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    );
  };

  return (
    <>
      {SIDES.map((side) => (
        <group key={side} ref={(g) => { groups.current[side] = g; }}>
          {wallPieces(room, openings, side).map((p, i) => piece(side, p.a0, p.a1, p.z0, p.z1, `${side}${i}`))}
          {openings
            .filter((o) => o.wall === side && o.kind === 'window')
            .map((o) => {
              const along = toM(o.offsetUm + o.widthUm / 2);
              const y = toM(o.sillUm + o.heightUm / 2);
              const horiz = side === 'N' || side === 'S';
              const at = side === 'N' ? -toM(T) / 2 : side === 'S' ? toM(room.depthUm + T / 2) : side === 'W' ? -toM(T) / 2 : toM(room.widthUm + T / 2);
              return (
                <mesh key={o.id} position={horiz ? [along, y, at] : [at, y, along]}>
                  <boxGeometry args={horiz ? [toM(o.widthUm), toM(o.heightUm), 0.02] : [0.02, toM(o.heightUm), toM(o.widthUm)]} />
                  <meshStandardMaterial color="#b9d6e3" transparent opacity={0.35} roughness={0.1} />
                </mesh>
              );
            })}
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[toM(room.widthUm), toM(room.depthUm)]} />
        <meshStandardMaterial color={FLOOR_FINISHES.find((x) => x.id === room.floorFinish)?.color ?? '#ccc'} roughness={0.8} />
      </mesh>
    </>
  );
}

type Preset = 'corner' | 'top' | 'front';

function Scene({ preset, presetNonce, xray }: { preset: Preset; presetNonce: number; xray: boolean }) {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const W = toM(project.room.widthUm);
  const D = toM(project.room.depthUm);
  const H = toM(project.room.ceilingUm);
  const applied = useRef(-1);

  useFrame(() => {
    if (applied.current === presetNonce || !controls.current) return;
    applied.current = presetNonce;
    const target = new THREE.Vector3(W / 2, H * 0.35, D / 2);
    if (preset === 'top') camera.position.set(W / 2, Math.max(W, D) * 1.6, D / 2 + 0.01);
    else if (preset === 'front') {
      const f = selection?.kind === 'furniture' ? project.furniture.find((x) => x.id === selection.id) : null;
      if (f) {
        const a = (f.rotDeg * Math.PI) / 180;
        const fx = toM(f.xUm);
        const fz = toM(f.yUm);
        const dist = Math.max(toM(envelope(f).widthUm), 1.5) * 1.3;
        target.set(fx, toM(envelope(f).heightUm) / 2, fz);
        camera.position.set(fx - Math.sin(a) * dist, toM(envelope(f).heightUm) * 0.55, fz + Math.cos(a) * dist);
      } else camera.position.set(W / 2, H * 0.5, D * 1.9);
    } else camera.position.set(W * 1.75, H * 2.1, D * 2.05);
    controls.current.target.copy(target);
    controls.current.update();
  });

  return (
    <>
      <hemisphereLight args={['#fff8ec', '#8a8070', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[W * 0.2, H * 2.4, D * 1.4]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.0004} />
      <pointLight position={[W / 2, H - 0.2, D / 2]} intensity={1.2} distance={8} color="#ffe9c7" />
      <Walls project={project} />
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
