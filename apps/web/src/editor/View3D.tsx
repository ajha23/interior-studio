import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import { catalogById, finishById, libraryPrims, lightingOf, LIGHTING_PRESETS, wallFaceFinish, type Lighting, type LightingPreset, type LibraryItem, type WallSideSign } from '@studio/core';
import { threeMaterial } from '../materials/three';
import { paintCommand, type PaintTarget } from './paint';
import { ModelMesh } from './ModelMesh';
import { liveView } from '../render/live';
import { useStudio } from './store';
import { type FurnitureItem, type Project } from '@studio/core';
import { toM } from '@studio/core';
import { decorBoxes, isDecor, envelope, interiorPoint, pointInPolygon, resolveParametric, wallGeom, wallPieces, wallPoint, type ColoredBox, type DetectedRoom } from '@studio/core';
import { useRooms } from './hooks';
import { planBounds } from './PlanView';

const BACK_COLOR = '#d9c7a4';

const glowCache = new Map<string, THREE.MeshStandardMaterial>();
function glowMaterial(color: string, emissive: number): THREE.MeshStandardMaterial {
  const key = `${color}|${emissive}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: '#fff6e8', emissive: color, emissiveIntensity: emissive, roughness: 0.6 });
    glowCache.set(key, m);
  }
  return m;
}

/** Keeps the renderer's exposure in step with the project's lighting. */
function ExposureSync({ value }: { value: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 24, 16);
const UNIT_CONE = new THREE.CylinderGeometry(0.12, 0.5, 1, 28, 1, true);

/** Catalogue piece: unit primitives scaled to each part, materials shared across the scene. */
/** Parts of a light fitting that glow: shades and glass. */
const GLOW_KEYS = new Set(['shade', 'glow']);

function LibraryParts({ f }: { f: LibraryItem }) {
  const prims = useMemo(() => libraryPrims(f), [f]);
  const lighting = lightingOf({ lighting: useStudio((s) => s.project.lighting) });
  const W = f.params.widthUm;
  const D = f.params.depthUm;
  const z0 = f.params.elevationUm;
  const def = catalogById(f.ref);
  const isFixture = Boolean(def && def.category === 'lighting' && def.id !== 'ceiling-fan');
  const on = isFixture && lighting.fixturesOn;
  const fx = LIGHTING_PRESETS[lighting.preset].fixture;
  const glowPrim = on ? (prims.find((p) => GLOW_KEYS.has(p.key)) ?? prims[prims.length - 1]) : null;
  return (
    <>
      {glowPrim && (
        <pointLight
          position={[toM(glowPrim.x + glowPrim.w / 2 - W / 2), toM(z0 + glowPrim.z + glowPrim.h * 0.4), toM(glowPrim.y + glowPrim.d / 2 - D / 2)]}
          color={fx.color}
          intensity={fx.intensity}
          distance={7}
          decay={2}
          userData={{ fixture: true }}
        />
      )}
      {prims.map((p) => {
        const geo = p.shape === 'cylinder' ? UNIT_CYL : p.shape === 'sphere' ? UNIT_SPHERE : p.shape === 'cone' ? UNIT_CONE : UNIT_BOX;
        const mat =
          on && GLOW_KEYS.has(p.key)
            ? glowMaterial(fx.color, fx.emissive)
            : threeMaterial(p.material.id, 'surface', { uMm: Math.max(p.w, p.d) / 1000, vMm: p.h / 1000, plain: p.material.pattern !== 'fabric' && p.material.pattern !== 'planks' });
        return (
          <mesh key={p.key} geometry={geo} material={mat} castShadow receiveShadow position={[toM(p.x + p.w / 2 - W / 2), toM(z0 + p.z + p.h / 2), toM(p.y + p.d / 2 - D / 2)]} scale={[toM(p.w), toM(p.h), toM(p.d)]} userData={{ part: p.tone === 'accent' ? 'accent' : 'main' }} />
        );
      })}
    </>
  );
}

function Furniture({ f, project, selected, xray, onSelect }: { f: FurnitureItem; project: Project; selected: boolean; xray: boolean; onSelect: (e: { altKey: boolean; part?: string }) => void }) {
  const env = envelope(f);
  const boxes: ColoredBox[] = useMemo(() => {
    if (f.kind === 'library' || f.kind === 'model') return [];
    if (isDecor(f)) return decorBoxes(f);
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
        onSelect({ altKey: e.nativeEvent.altKey, part: (e.object.userData as { part?: string }).part });
      }}
    >
      {f.kind === 'library' && <LibraryParts f={f} />}
      {f.kind === 'model' && <ModelMesh item={f} />}
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
  // Each face shows its own finish, else the colour of the room it faces, else that of the room behind it.
  const faceOf = (w: (typeof plan.walls)[number], side: WallSideSign) => {
    const own = wallFaceFinish(w, side);
    if (own) return own;
    const g = wallGeom(w);
    const probe = (s: number) => wallPoint(g, g.len / 2, s * (w.thicknessUm / 2 + 50_000));
    const r = rooms.find((x) => pointInPolygon(probe(side), x.interior)) ?? rooms.find((x) => pointInPolygon(probe(-side), x.interior)) ?? rooms.find((x) => x.wallIds.includes(w.id));
    return r?.info.wallColor ?? 'warm-white';
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
        const pos = faceOf(w, 1);
        const neg = faceOf(w, -1);
        return (
          <group key={w.id} ref={(el) => { groups.current[w.id] = el; }}>
            {wallPieces(plan, w, openings).map((pc, i) => {
              const mid = wallPoint(g, (pc.a0 + pc.a1) / 2);
              return (
                <WallPiece key={i} wallId={w.id} position={[toM(mid.x), toM((pc.z0 + pc.z1) / 2), toM(mid.y)]} rotY={rotY} size={[pc.a1 - pc.a0, pc.z1 - pc.z0, w.thicknessUm]} pos={pos} neg={neg} />
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

/**
 * One wall segment. BoxGeometry material slots are +x, −x, +y, −y, +z, −z; after the rotation
 * the local +z face is wall side +1.
 */
function WallPiece({ wallId, position, rotY, size, pos, neg }: { wallId: string; position: [number, number, number]; rotY: number; size: [number, number, number]; pos: string; neg: string }) {
  const [L, H, T] = size;
  const mats = useMemo(() => {
    const edge = threeMaterial(pos, 'wall', { plain: true });
    return [edge, edge, edge, edge, threeMaterial(pos, 'wall', { uMm: L / 1000, vMm: H / 1000 }), threeMaterial(neg, 'wall', { uMm: L / 1000, vMm: H / 1000 })];
  }, [pos, neg, L, H]);
  return (
    <mesh position={position} rotation={[0, rotY, 0]} material={mats} receiveShadow castShadow userData={{ wallId }}>
      <boxGeometry args={[toM(L), toM(H), toM(T)]} />
    </mesh>
  );
}

function Floor({ room }: { room: DetectedRoom }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.interior.forEach((v, i) => (i === 0 ? s.moveTo(toM(v.x), -toM(v.y)) : s.lineTo(toM(v.x), -toM(v.y))));
    s.closePath();
    return s;
  }, [room.interior]);
  const mat = threeMaterial(room.info.floorFinish, 'floor', { worldUv: true });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat} userData={{ roomId: room.id }}>
      <shapeGeometry args={[shape]} />
    </mesh>
  );
}

type Preset = 'corner' | 'top' | 'front';

function Scene({ preset, presetNonce, xray }: { preset: Preset; presetNonce: number; xray: boolean }) {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const tool = useStudio((s) => s.tool);
  const dispatch = useStudio((s) => s.dispatch);
  const paintWith = (target: PaintTarget) => {
    const st = useStudio.getState();
    const res = paintCommand(st.project, rooms, target, st.paint);
    if (res) dispatch(res.cmd, res.label);
  };
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, scene } = useThree();
  const rooms = useRooms();
  useEffect(() => {
    liveView.current = { scene, camera: camera as THREE.PerspectiveCamera };
    return () => {
      liveView.current = null;
    };
  }, [scene, camera]);
  const bounds = planBounds(project.plan);
  const X0 = toM(bounds.minX);
  const Z0 = toM(bounds.minY);
  const W = toM(bounds.maxX - bounds.minX);
  const D = toM(bounds.maxY - bounds.minY);
  const H = toM(Math.max(project.plan.defaultCeilingUm, ...rooms.map((r) => r.info.ceilingUm)));
  const applied = useRef(-1);
  const lighting = lightingOf(project);
  const spec = LIGHTING_PRESETS[lighting.preset];
  // Sun from the chosen compass direction (plan north is −z in 3D) at the preset's elevation.
  const az = (lighting.sunAzimuthDeg * Math.PI) / 180;
  const el = ((spec.sun?.elevationDeg ?? 60) * Math.PI) / 180;
  const R = Math.max(W, D, 6) * 1.6;
  const sunPos: [number, number, number] = [X0 + W / 2 + Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Z0 + D / 2 - Math.cos(az) * Math.cos(el) * R];

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
      <ExposureSync value={spec.exposure * Math.pow(2, lighting.exposure)} />
      <hemisphereLight args={[spec.preview.sky, spec.preview.ground, spec.preview.hemi]} />
      <ambientLight intensity={spec.preview.ambient} />
      <directionalLight position={sunPos} color={spec.sun?.color ?? '#dfe6ff'} intensity={spec.sun ? spec.sun.intensity * 1.1 : 0.25} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-Math.max(6, W)} shadow-camera-right={Math.max(6, W)} shadow-camera-top={Math.max(6, D)} shadow-camera-bottom={-Math.max(6, D)} shadow-bias={-0.0004} />
      {rooms.slice(0, 8).map((r) => {
        const c = interiorPoint(r.interior);
        return <pointLight key={r.id} position={[toM(c.x), toM(r.info.ceilingUm) - 0.2, toM(c.y)]} intensity={spec.interior.intensity * 0.45} distance={8} color={spec.interior.color} />;
      })}
      <group
        onClick={(e) => {
          if (tool !== 'paint') return;
          e.stopPropagation();
          const ud = e.object.userData as { wallId?: string; roomId?: string };
          if (ud.roomId) paintWith({ kind: 'floor', roomId: ud.roomId });
          else if (ud.wallId && e.face) {
            const nz = e.face.normal.z;
            if (Math.abs(nz) > 0.5) paintWith({ kind: 'wall', wallId: ud.wallId, side: nz > 0 ? 1 : -1 });
          }
        }}
      >
        <Walls project={project} rooms={rooms} />
      </group>
      <group onPointerMissed={() => tool !== 'paint' && select(null)}>
        {project.furniture.map((f) => (
          <Furniture
            key={f.id}
            f={f}
            project={project}
            xray={xray}
            selected={selection?.kind === 'furniture' && selection.id === f.id}
            onSelect={(ev) => (tool === 'paint' ? paintWith({ kind: 'furniture', id: f.id, part: ev.altKey || ev.part === 'accent' ? 'accent' : 'main' }) : select({ kind: 'furniture', id: f.id }))}
          />
        ))}
      </group>
      <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.6} maxDistance={30} />
    </>
  );
}

const PRESET_ORDER: LightingPreset[] = ['daylight', 'golden', 'overcast', 'evening', 'night'];

/** Lighting popover: preset, exposure, sun direction and light fittings. Stored on the project. */
function LightingControl() {
  const lighting = lightingOf({ lighting: useStudio((s) => s.project.lighting) });
  const readOnly = useStudio((s) => s.readOnly);
  const dispatch = useStudio((s) => s.dispatch);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Lighting>, label = 'Change lighting') => dispatch({ type: 'lighting.update', patch }, label);
  const spec = LIGHTING_PRESETS[lighting.preset];
  if (readOnly) return null;
  return (
    <div className="light-ctl">
      <button className={`btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Lighting for the 3D view, renders and share links">
        {spec.label}
      </button>
      {open && (
        <div className="light-pop" role="dialog" aria-label="Lighting">
          <div className="light-presets">
            {PRESET_ORDER.map((p) => (
              <button key={p} className={`light-preset ${lighting.preset === p ? 'on' : ''}`} onClick={() => set({ preset: p }, `Lighting: ${LIGHTING_PRESETS[p].label}`)}>
                <span className="light-sw" style={{ background: `linear-gradient(${LIGHTING_PRESETS[p].preview.background[0]}, ${LIGHTING_PRESETS[p].preview.background[1]})` }} />
                <span>{LIGHTING_PRESETS[p].label}</span>
              </button>
            ))}
          </div>
          <p className="light-hint">{spec.hint}</p>
          <label className="light-row">
            <span>Exposure</span>
            <input type="range" min={-2} max={2} step={0.25} value={lighting.exposure} onChange={(e) => set({ exposure: Number(e.target.value) }, 'Change exposure')} />
            <span className="num">{lighting.exposure > 0 ? '+' : ''}{lighting.exposure.toFixed(2)}</span>
          </label>
          {spec.sun && (
            <label className="light-row">
              <span>Sun from</span>
              <input type="range" min={0} max={345} step={15} value={lighting.sunAzimuthDeg} onChange={(e) => set({ sunAzimuthDeg: Number(e.target.value) }, 'Move sun')} />
              <span className="num">{compass(lighting.sunAzimuthDeg)}</span>
            </label>
          )}
          <label className="light-check">
            <input type="checkbox" checked={lighting.fixturesOn} onChange={(e) => set({ fixturesOn: e.target.checked }, e.target.checked ? 'Lights on' : 'Lights off')} />
            Light fittings on (pendants, lamps, sconces)
          </label>
        </div>
      )}
    </div>
  );
}

function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

export function View3D() {
  const [preset, setPreset] = useState<Preset>('corner');
  const [nonce, setNonce] = useState(0);
  const [xray, setXray] = useState(false);
  const bg = useStudio((s) => LIGHTING_PRESETS[lightingOf(s.project).preset].preview.background);
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
        <LightingControl />
      </div>
      <div className="three-wrap" style={{ background: `linear-gradient(${bg[0]}, ${bg[1]})` }}>
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, near: 0.05, far: 100, position: [5, 4, 5] }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
          <Scene preset={preset} presetNonce={nonce} xray={xray} />
        </Canvas>
      </div>
    </div>
  );
}
