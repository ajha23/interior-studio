import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

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
  /** 'day' adds a sun and bright sky through the windows; 'evening' relies on interior lights. */
  mood: 'day' | 'evening';
  onProgress?: (stage: 'preparing' | 'tracing', fraction: number) => void;
  signal?: AbortSignal;
}

/** Equirectangular sky gradient used as the environment light. */
function skyTexture(mood: RenderOptions['mood']): THREE.DataTexture {
  const W = 256;
  const H = 128;
  const data = new Float32Array(W * H * 4);
  const zenith = mood === 'day' ? [0.55, 0.72, 1.0] : [0.08, 0.1, 0.18];
  const horizon = mood === 'day' ? [1.0, 0.96, 0.9] : [0.35, 0.25, 0.22];
  const ground = mood === 'day' ? [0.42, 0.38, 0.33] : [0.06, 0.05, 0.05];
  // Rooms are open-topped in the editor, so the sky reaches in from above: keep it gentle.
  const gain = mood === 'day' ? 0.55 : 0.12;
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
function renderableCopy(src: THREE.Scene): THREE.Scene {
  src.updateMatrixWorld(true);
  const out = new THREE.Scene();
  const visible = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
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

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Progressive GPU path tracing of the current 3D view. Runs on its own WebGL context so the
 * editor stays responsive; resolves with a PNG.
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
  renderer.toneMappingExposure = opts.mood === 'day' ? 0.9 : 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = renderableCopy(source.scene);
  const sky = skyTexture(opts.mood);
  scene.environment = sky;
  scene.background = new THREE.Color(opts.mood === 'day' ? '#f2efe8' : '#1c1f26');
  scene.environmentIntensity = 1;

  // Soft ceiling panels per room stand in for the fittings a designer would specify.
  for (const r of opts.rooms) {
    const w = Math.max(0.4, Math.min(1.4, r.w * 0.35));
    const d = Math.max(0.4, Math.min(1.4, r.d * 0.35));
    const light = new THREE.RectAreaLight(opts.mood === 'day' ? '#fff4e6' : '#ffd9a8', opts.mood === 'day' ? 2.5 : 6, w, d);
    light.position.set(r.x, r.ceiling - 0.02, r.z);
    light.lookAt(r.x, 0, r.z);
    scene.add(light);
  }
  if (opts.mood === 'day') {
    const sun = new THREE.DirectionalLight('#fff1dc', 1.4);
    const c = opts.rooms[0] ?? { x: 0, z: 0 };
    sun.position.set(c.x - 6, 9, c.z + 8);
    sun.target.position.set(c.x, 0, c.z);
    scene.add(sun, sun.target);
  }

  const camera = source.camera.clone();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

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
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
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
