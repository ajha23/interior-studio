import * as THREE from 'three';
import { EquirectCamera, WebGLPathTracer } from 'three-gpu-pathtracer';
import { LIGHTING_PRESETS, type Lighting, type LightingSpec } from '@studio/core';

export interface RenderRoomLight {
  /** Ceiling centre in metres (three.js world: x, y up, z). */
  x: number;
  z: number;
  ceiling: number;
  /** Clear floor extent in metres. */
  w: number;
  d: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  samples: number;
  rooms: RenderRoomLight[];
  lighting: Lighting;
  /** Centre of the plan in metres, for placing the sun. */
  centre: { x: number; z: number };
  /** A 360° equirectangular panorama from this eye point (metres) instead of the camera view. */
  panorama?: { x: number; y: number; z: number };
  format?: 'png' | 'jpeg';
  /** Ceilings to close the rooms (panoramas look up). Polygons in metres (x, z). */
  ceilings?: { poly: { x: number; z: number }[]; height: number }[];
  onProgress?: (stage: 'preparing' | 'tracing', fraction: number) => void;
  signal?: AbortSignal;
}

/** Equirectangular sky gradient used as the environment light. */
function skyTexture(spec: LightingSpec): THREE.DataTexture {
  const W = 256;
  const H = 128;
  const data = new Float32Array(W * H * 4);
  // Rooms are open-topped in the editor, so the sky reaches in from above: presets keep it gentle.
  const { zenith, horizon, ground, gain } = spec.sky;
  for (let y = 0; y < H; y++) {
    const v = 1 - y / (H - 1); // 1 = up
    for (let x = 0; x < W; x++) {
      let c: number[];
      if (v >= 0.5) {
        const t = Math.pow((v - 0.5) * 2, 0.6);
        c = horizon.map((h, i) => h + (zenith[i] - h) * t);
      } else {
        const t = Math.min(1, (0.5 - v) * 6);
        c = horizon.map((h, i) => h + (ground[i] - h) * t);
      }
      const o = (y * W + x) * 4;
      data[o] = c[0] * gain;
      data[o + 1] = c[1] * gain;
      data[o + 2] = c[2] * gain;
      data[o + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Copy of the live scene with only renderable meshes: no helpers, outlines or hidden (cut-away) walls. */
function renderableCopy(src: THREE.Scene, includeCutaway = false): THREE.Scene {
  src.updateMatrixWorld(true);
  const out = new THREE.Scene();
  const visible = (o: THREE.Object3D) => {
    // Walls hidden by the editor's cut-away carry a wallId; a panorama needs every wall.
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible && !(includeCutaway && isCutawayWall(p))) return false;
    return true;
  };
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !visible(m)) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[];
    if (mats.every((x) => x.opacity < 0.2)) return; // x-ray ghosts
    // Hand the tracer only single-material, group-free meshes with their own geometry. Its merge
    // step maps geometry groups to material slots, which goes wrong with the editor's shared unit
    // geometries (boxes carry 6 groups, cylinders 3) and multi-material walls.
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geo.clearGroups();
      const copy = new THREE.Mesh(geo, forTracing(mat));
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(m.matrixWorld);
      copy.matrixWorld.copy(m.matrixWorld);
      out.add(copy);
    };
    if (!Array.isArray(m.material)) {
      add(m.geometry.clone(), m.material);
      return;
    }
    const src = m.geometry;
    for (const g of src.groups) {
      const mat = m.material[g.materialIndex ?? 0];
      if (!mat) continue;
      const part = src.clone();
      if (src.index) {
        const idx = src.index.array.slice(g.start, g.start + g.count);
        part.setIndex(new THREE.BufferAttribute(idx, 1));
      } else {
        part.setDrawRange(g.start, g.count);
        const sub = part.toNonIndexed();
        add(sub, mat);
        continue;
      }
      add(part, mat);
    }
  });
  return out;
}

/** Glass needs real transmission in a path tracer; alpha-blended "glass" renders as a dark slab. */
const glassCache = new WeakMap<THREE.Material, THREE.Material>();
function forTracing(mat: THREE.Material): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial;
  if (!mat.transparent || mat.opacity >= 0.99 || !std.isMeshStandardMaterial) return mat;
  let g = glassCache.get(mat);
  if (!g) {
    g = new THREE.MeshPhysicalMaterial({ color: std.color, roughness: 0.02, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.006 });
    glassCache.set(mat, g);
  }
  return g;
}

function isCutawayWall(o: THREE.Object3D): boolean {
  return o.children.some((c) => (c.userData as { wallId?: string }).wallId !== undefined);
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Progressive GPU path tracing of the current 3D view. Runs on its own WebGL context so the
 * editor stays responsive; resolves with a PNG (or JPEG for large and panoramic images).
 */
export async function renderPathTraced(source: { scene: THREE.Scene; camera: THREE.PerspectiveCamera }, opts: RenderOptions): Promise<Blob> {
  const { width, height, samples, signal } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const spec = LIGHTING_PRESETS[opts.lighting.preset];
  renderer.toneMappingExposure = spec.exposure * Math.pow(2, opts.lighting.exposure);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = renderableCopy(source.scene, Boolean(opts.panorama));
  const sky = skyTexture(spec);
  scene.environment = sky;
  // Panoramas look out of the windows at the sky; stills keep a plain studio backdrop.
  scene.background = opts.panorama ? sky : new THREE.Color(spec.preview.background[1]);
  scene.environmentIntensity = 1;
  // The editor shows rooms open-topped; a panorama from inside needs a ceiling overhead.
  const ceilingMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9, side: THREE.DoubleSide });
  for (const c of opts.ceilings ?? []) {
    const shape = new THREE.Shape(c.poly.map((p) => new THREE.Vector2(p.x, -p.z)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), ceilingMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = c.height;
    mesh.updateMatrixWorld(true);
    scene.add(mesh);
  }
  // Light fittings switched on in the editor carry over as real lights (their shades are emissive).
  if (opts.lighting.fixturesOn) {
    source.scene.traverse((o) => {
      const l = o as THREE.PointLight;
      if (!l.isPointLight || !(l.userData as { fixture?: boolean }).fixture) return;
      const copy = new THREE.PointLight(l.color, l.intensity * 1.4, l.distance, 2);
      l.getWorldPosition(copy.position);
      scene.add(copy);
    });
  }

  // Soft ceiling panels per room stand in for the fittings a designer would specify.
  for (const r of opts.rooms) {
    const w = Math.max(0.4, Math.min(1.4, r.w * 0.35));
    const d = Math.max(0.4, Math.min(1.4, r.d * 0.35));
    const light = new THREE.RectAreaLight(spec.interior.color, spec.interior.intensity, w, d);
    light.position.set(r.x, r.ceiling - 0.02, r.z);
    light.lookAt(r.x, 0, r.z);
    scene.add(light);
  }
  if (spec.sun) {
    const sun = new THREE.DirectionalLight(spec.sun.color, spec.sun.intensity);
    const az = (opts.lighting.sunAzimuthDeg * Math.PI) / 180;
    const el = (spec.sun.elevationDeg * Math.PI) / 180;
    const c = opts.centre;
    sun.position.set(c.x + Math.sin(az) * Math.cos(el) * 12, Math.sin(el) * 12, c.z - Math.cos(az) * Math.cos(el) * 12);
    sun.target.position.set(c.x, 0, c.z);
    scene.add(sun, sun.target);
  }

  let camera: THREE.Camera;
  if (opts.panorama) {
    const eq = new EquirectCamera();
    eq.position.set(opts.panorama.x, opts.panorama.y, opts.panorama.z);
    eq.updateMatrixWorld();
    camera = eq;
  } else {
    const persp = source.camera.clone();
    persp.aspect = width / height;
    persp.updateProjectionMatrix();
    camera = persp;
  }

  const pt = new WebGLPathTracer(renderer);
  pt.renderDelay = 0;
  pt.minSamples = 0;
  pt.fadeDuration = 0;
  pt.dynamicLowRes = false;
  pt.rasterizeScene = false;
  pt.multipleImportanceSampling = true;
  pt.bounces = 6;
  pt.filterGlossyFactor = 0.5;
  pt.tiles.set(width * height > 2_500_000 ? 3 : 2, width * height > 2_500_000 ? 3 : 2);

  try {
    opts.onProgress?.('preparing', 0);
    await nextFrame();
    // Interior scenes are small; building the BVH synchronously takes well under a second.
    pt.setScene(scene, camera);
    opts.onProgress?.('preparing', 1);
    let last = performance.now();
    while (pt.samples < samples) {
      if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');
      pt.renderSample();
      // Yield every ~40 ms so the page keeps painting the progress bar.
      if (performance.now() - last > 40) {
        opts.onProgress?.('tracing', Math.min(1, pt.samples / samples));
        await nextFrame();
        last = performance.now();
      }
    }
    opts.onProgress?.('tracing', 1);
    const jpeg = opts.format === 'jpeg';
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, jpeg ? 'image/jpeg' : 'image/png', jpeg ? 0.92 : undefined));
    if (!blob) throw new Error('Could not encode the image.');
    return blob;
  } finally {
    scene.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    pt.dispose();
    sky.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
