import * as THREE from 'three';
import { unzipSync } from 'fflate';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * Browser-side conversion of common 3D formats to an optimised GLB, so every studio model is
 * stored and rendered the same way. Runs entirely on the designer's machine: nothing is sent
 * anywhere until the converted GLB is uploaded.
 *
 * SketchUp (.skp) is a closed format with no browser reader; SketchUp exports .dae (built in)
 * and .glb (free extension), both of which this accepts.
 */
export type SourceFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'dae' | '3ds' | 'stl' | 'ply' | '3mf';
export type UnitChoice = 'auto' | 'mm' | 'cm' | 'm' | 'in';

export const ACCEPT = '.glb,.gltf,.fbx,.obj,.dae,.3ds,.stl,.ply,.3mf,.zip';
export const MAX_SOURCE_BYTES = 150 * 1024 * 1024;
const MAX_TEXTURE = 2048;
const PRIORITY: SourceFormat[] = ['glb', 'gltf', 'fbx', 'dae', 'obj', '3ds', '3mf', 'ply', 'stl'];

export interface ConvertReport {
  source: SourceFormat;
  unit: Exclude<UnitChoice, 'auto'>;
  unitGuessed: boolean;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  warnings: string[];
}

export interface ConvertResult {
  glb: Blob;
  name: string;
  report: ConvertReport;
}

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';
const baseName = (path: string) => path.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
const UNIT_SCALE: Record<Exclude<UnitChoice, 'auto'>, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254 };

/** Expand a zip into files; other inputs pass through. */
async function expandFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (extOf(f.name) !== 'zip') {
      out.push(f);
      continue;
    }
    const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/') || path.startsWith('__MACOSX') || baseName(path).startsWith('.')) continue;
      out.push(new File([data.slice().buffer as ArrayBuffer], path));
    }
  }
  return out;
}

/** Pick the model file; the rest are its textures and material libraries. */
function pickMain(files: File[]): { main: File; format: SourceFormat } {
  for (const fmt of PRIORITY) {
    const hit = files.find((f) => extOf(f.name) === fmt);
    if (hit) return { main: hit, format: fmt };
  }
  if (files.some((f) => extOf(f.name) === 'skp')) throw new Error('SketchUp files can’t be read in the browser. In SketchUp use File → Export → 3D Model → COLLADA (.dae), then upload the .dae (or a zip with its textures folder).');
  throw new Error('No supported 3D file found. Use .glb, .gltf, .fbx, .obj, .dae, .3ds, .stl, .ply or .3mf — or a .zip with the model and its textures.');
}

/** Load the model with a manager that resolves texture/material paths to the other dropped files. */
type Loaded = { root: THREE.Object3D; zUp: boolean; unitKnown: boolean };

async function load(main: File, format: SourceFormat, all: File[]): Promise<Loaded> {
  const urls = new Map<string, string>();
  for (const f of all) urls.set(baseName(f.name), URL.createObjectURL(f));
  const ours = new Set(urls.values());
  const missing = new Set<string>();
  const manager = new THREE.LoadingManager();
  let pending = 0;
  let settle: (() => void) | null = null;
  manager.onStart = () => undefined;
  manager.itemStart = ((orig) => (url: string) => {
    pending++;
    orig.call(manager, url);
  })(manager.itemStart);
  const done = (orig: (url: string) => void) => (url: string) => {
    pending--;
    orig.call(manager, url);
    if (pending <= 0) settle?.();
  };
  manager.itemEnd = done(manager.itemEnd);
  manager.itemError = done(manager.itemError);
  /** Textures referenced by materials load after the model resolves; wait for them (max 20 s). */
  const idle = () => (pending <= 0 ? Promise.resolve() : new Promise<void>((r) => {
    settle = r;
    setTimeout(r, 20_000);
  }));
  manager.setURLModifier((url) => {
    if (ours.has(url) || url.startsWith('data:')) return url;
    const hit = urls.get(baseName(decodeURIComponent(url.split('?')[0])));
    if (hit) return hit;
    missing.add(baseName(url));
    return url;
  });
  const mainUrl = urls.get(baseName(main.name))!;
  try {
    const result = await (async (): Promise<Loaded> => {
    switch (format) {
      case 'glb':
      case 'gltf': {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const g = await new GLTFLoader(manager).loadAsync(mainUrl);
        return { root: g.scene, zUp: false, unitKnown: true };
      }
      case 'fbx': {
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
        return { root: await new FBXLoader(manager).loadAsync(mainUrl), zUp: false, unitKnown: false };
      }
      case 'obj': {
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
        const loader = new OBJLoader(manager);
        const mtl = all.find((f) => extOf(f.name) === 'mtl');
        if (mtl) {
          const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
          const mats = await new MTLLoader(manager).loadAsync(urls.get(baseName(mtl.name))!);
          mats.preload();
          loader.setMaterials(mats);
        }
        return { root: await loader.loadAsync(mainUrl), zUp: false, unitKnown: false };
      }
      case 'dae': {
        const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
        const c = await new ColladaLoader(manager).loadAsync(mainUrl);
        // ColladaLoader applies the file's <unit> and up-axis itself.
        return { root: c!.scene, zUp: false, unitKnown: true };
      }
      case '3ds': {
        const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js');
        return { root: await new TDSLoader(manager).loadAsync(mainUrl), zUp: true, unitKnown: false };
      }
      case '3mf': {
        const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
        return { root: await new ThreeMFLoader(manager).loadAsync(mainUrl), zUp: true, unitKnown: false };
      }
      case 'stl': {
        const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
        const geo = await new STLLoader(manager).loadAsync(mainUrl);
        geo.computeVertexNormals();
        return { root: new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cfc8bc', roughness: 0.7 })), zUp: true, unitKnown: false };
      }
      case 'ply': {
        const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
        const geo = await new PLYLoader(manager).loadAsync(mainUrl);
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: '#cfc8bc', roughness: 0.7, vertexColors: Boolean(geo.getAttribute('color')) });
        return { root: new THREE.Mesh(geo, mat), zUp: true, unitKnown: false };
      }
    }
    throw new Error(`Unsupported format: ${format}`);
    })();
    await idle();
    return result;
  } finally {
    // Textures are decoded into images by now; the object URLs can go once export reads them.
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 30_000);
    if (missing.size) loadWarnings.push(`Missing files referenced by the model: ${[...missing].slice(0, 5).join(', ')}${missing.size > 5 ? '…' : ''}. Add them to a zip with the model.`);
  }
}
let loadWarnings: string[] = [];

/**
 * Furniture spans roughly 2 cm to 12 m. Read the largest dimension as metres, then centimetres
 * (FBX and most DCC exports), then millimetres (CAD), and keep the first that fits. Inches are
 * never guessed; pick them explicitly.
 */
function guessUnit(maxDim: number, format: SourceFormat): Exclude<UnitChoice, 'auto'> {
  // CAD and 3D-print formats (STL, PLY, 3MF) are millimetres by convention.
  if (format === 'stl' || format === 'ply' || format === '3mf') return maxDim <= 12 ? 'm' : 'mm';
  if (maxDim <= 12) return 'm';
  if (maxDim <= 1200) return 'cm';
  return 'mm';
}

/** Standard PBR materials only, textures capped at 2048 px, no lights, cameras or helpers. */
function optimise(root: THREE.Object3D, warnings: string[]): { triangles: number; meshes: number; materials: number; textures: number } {
  const remove: THREE.Object3D[] = [];
  const matCache = new Map<THREE.Material, THREE.Material>();
  const texSeen = new Set<THREE.Texture>();
  let triangles = 0;
  let meshes = 0;
  root.traverse((o) => {
    if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
      remove.push(o);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    const conv = (src: THREE.Material): THREE.Material => {
      const hit = matCache.get(src);
      if (hit) return hit;
      let out: THREE.Material = src;
      const s = src as THREE.MeshPhongMaterial & THREE.MeshStandardMaterial;
      if (!(src as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const shininess = (src as THREE.MeshPhongMaterial).shininess ?? 30;
        out = new THREE.MeshStandardMaterial({
          name: src.name,
          color: s.color ?? new THREE.Color('#cccccc'),
          map: s.map ?? null,
          normalMap: s.normalMap ?? null,
          emissive: s.emissive ?? new THREE.Color(0),
          emissiveMap: s.emissiveMap ?? null,
          alphaMap: s.alphaMap ?? null,
          transparent: src.transparent,
          opacity: src.opacity,
          side: src.side,
          vertexColors: (src as THREE.MeshBasicMaterial).vertexColors,
          roughness: Math.max(0.15, Math.min(1, 1 - Math.sqrt(shininess / 200))),
          metalness: 0,
        });
      }
      for (const key of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'] as const) {
        const t = (out as THREE.MeshStandardMaterial)[key];
        const img = t?.image as { width?: number } | undefined;
        if (t && (!img || !img.width)) {
          // Missing or undecodable image: drop the slot rather than fail the export.
          (out as THREE.MeshStandardMaterial)[key] = null;
          continue;
        }
        if (t) {
          texSeen.add(t);
          shrinkTexture(t);
        }
      }
      matCache.set(src, out);
      return out;
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
    m.castShadow = m.receiveShadow = true;
  });
  for (const o of remove) o.parent?.remove(o);
  if (triangles > 400_000) warnings.push(`Heavy model (${Math.round(triangles / 1000)}k triangles). It will slow the editor with many copies; decimate it in Blender if you can.`);
  return { triangles: Math.round(triangles), meshes, materials: matCache.size, textures: texSeen.size };
}

function shrinkTexture(t: THREE.Texture) {
  const img = t.image as (HTMLImageElement | ImageBitmap | HTMLCanvasElement) & { width: number; height: number };
  if (!img || !img.width || (img.width <= MAX_TEXTURE && img.height <= MAX_TEXTURE)) return;
  const k = MAX_TEXTURE / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')?.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  t.image = c;
  t.needsUpdate = true;
}

/**
 * Convert dropped files (one model, optionally with .mtl and textures, or a .zip of them)
 * into a GLB in metres, Y up, resting on the floor and centred.
 */
export async function convertToGlb(input: File[], opts: { unit: UnitChoice; fitMaxMm?: number } = { unit: 'auto' }): Promise<ConvertResult> {
  loadWarnings = [];
  const total = input.reduce((s, f) => s + f.size, 0);
  if (total > MAX_SOURCE_BYTES) throw new Error(`Files up to ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`);
  const files = await expandFiles(input);
  const { main, format } = pickMain(files);
  const { root, zUp, unitKnown } = await load(main, format, files);
  const warnings = [...loadWarnings];

  const wrap = new THREE.Group();
  wrap.add(root);
  if (zUp) root.rotation.x = -Math.PI / 2;
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) throw new Error('This file has no visible geometry.');

  let unit: Exclude<UnitChoice, 'auto'>;
  let unitGuessed = false;
  if (opts.unit !== 'auto') unit = opts.unit;
  else if (unitKnown) unit = 'm';
  else {
    unit = guessUnit(maxDim, format);
    unitGuessed = true;
  }
  // AI-generated models come in arbitrary units: scale so the largest side matches the size given.
  const s = opts.fitMaxMm ? opts.fitMaxMm / 1000 / maxDim : UNIT_SCALE[unit];
  if (opts.fitMaxMm) unitGuessed = false;
  wrap.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  const c = box.getCenter(new THREE.Vector3());
  wrap.position.set(-c.x, -box.min.y, -c.z);
  wrap.updateMatrixWorld(true);
  const finalSize = new THREE.Box3().setFromObject(wrap).getSize(new THREE.Vector3());
  if (Math.max(finalSize.x, finalSize.y, finalSize.z) > 15) warnings.push('Larger than 15 m after conversion — check the units.');
  if (Math.max(finalSize.x, finalSize.y, finalSize.z) < 0.02) warnings.push('Smaller than 2 cm after conversion — check the units.');

  const stats = optimise(wrap, warnings);
  const scene = new THREE.Scene();
  scene.add(wrap);
  const buf = (await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: MAX_TEXTURE, onlyVisible: true })) as ArrayBuffer;
  const name = baseName(main.name).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return { glb: new Blob([buf], { type: 'model/gltf-binary' }), name, report: { source: format, unit, unitGuessed, warnings, ...stats } };
}
