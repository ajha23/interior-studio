/**
 * Procedural PBR textures for finishes: wood, planks, marble, tile, terrazzo, concrete, plaster,
 * stone, fabric and brick. Each is drawn once in the browser (no downloads, no licences) as a
 * seamless tile tinted by the finish's colour, with matching roughness and normal maps, and mapped
 * at real size: one tile covers `textureScale` millimetres (or a few planks/bricks of that size).
 */
import { CanvasTexture, LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { KitchenMaterial, MaterialTexture } from '@/domain';

const SIZE = 512;

/** Deterministic hash → [0, 1). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise that repeats every `period` lattice cells (so the texture tiles seamlessly). */
function noise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal noise over the unit tile; `freq` lattice cells across it at the first octave. */
function fbm(u: number, v: number, freq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(u * f, v * f, f, seed + o * 17);
    f *= 2;
    amp *= 0.5;
  }
  return sum / (1 - 0.5 ** octaves);
}

interface Sample {
  /** Multiplies the finish colour (≈1). */
  shade: number;
  /** Optional tint mixed towards (e.g. grout, mortar, terrazzo chips): [r, g, b] 0..1 and weight. */
  tint?: [number, number, number, number];
  /** 0..1 relief for the normal map. */
  height: number;
  /** Multiplies the finish roughness. */
  rough: number;
}

type Pattern = (u: number, v: number) => Sample;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const PATTERNS: Record<Exclude<MaterialTexture, 'plain'>, Pattern> = {
  wood: (u, v) => {
    // Straight-grained veneer: fine streaks along u with a gentle drift, no waves.
    const drift = fbm(u, v, 2, 2, 1) * 0.35;
    const streaks = Math.sin((v * 16 + drift) * Math.PI * 2) * 0.5 + 0.5;
    const fibre = fbm(u * 0.12, v * 7, 28, 2, 2);
    const shade = 0.94 + streaks * 0.05 + (fibre - 0.5) * 0.1;
    return { shade, height: fibre * 0.6 + streaks * 0.4, rough: 0.92 + fibre * 0.15 };
  },
  planks: (u, v) => {
    // Four planks across the tile, butt joints staggered per row.
    const rows = 4;
    const row = Math.floor(v * rows);
    const inRow = v * rows - row;
    const offset = hash(row, 0, 3) * 0.6;
    const along = (u + offset) % 1;
    const tone = 0.93 + hash(row, Math.floor((u + offset) * 2), 4) * 0.12;
    // Long, soft grain streaks along the plank plus fine fibres; no ridges.
    const warp = fbm(u, v, 2, 3, 5) * 0.9;
    const grain = Math.sin((inRow * 2.2 + warp + row * 0.37) * Math.PI * 2) * 0.5 + 0.5;
    const fibre = fbm(u * 0.15, v * 6, 24, 2, 6);
    const seam = inRow < 0.012 || inRow > 0.988 || Math.abs(along - 0.5) < 0.0025;
    if (seam) return { shade: 0.6, height: 0, rough: 1.2 };
    return { shade: tone * (0.95 + grain * 0.06 + (fibre - 0.5) * 0.08), height: 0.8 + fibre * 0.2, rough: 0.92 + fibre * 0.12 };
  },
  marble: (u, v) => {
    const t = fbm(u, v, 4, 5, 7);
    const vein = Math.abs(Math.sin((u + v * 0.5 + t * 2.4) * Math.PI));
    const line = Math.pow(1 - vein, 28);
    const cloud = fbm(u, v, 2, 4, 8);
    return { shade: 1.02 - cloud * 0.05, tint: [0.55, 0.55, 0.58, line * 0.45], height: 0.5 - line * 0.1, rough: 0.9 + line * 0.2 };
  },
  tile: (u, v) => {
    const g = 0.012;
    const grout = u < g || u > 1 - g || v < g || v > 1 - g;
    if (grout) return { shade: 1, tint: [0.62, 0.61, 0.59, 0.9], height: 0, rough: 1.4 };
    const n = fbm(u, v, 6, 3, 9);
    return { shade: 0.97 + (n - 0.5) * 0.08, height: 0.9, rough: 0.85 + n * 0.25 };
  },
  terrazzo: (u, v) => {
    const base = fbm(u, v, 8, 3, 10);
    // Chips: a jittered grid of small blobs in several tones.
    const cells = 14;
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        const wx = ((x % cells) + cells) % cells;
        const wy = ((y % cells) + cells) % cells;
        const px = (x + hash(wx, wy, 11)) / cells;
        const py = (y + hash(wx, wy, 12)) / cells;
        const r = (0.12 + hash(wx, wy, 13) * 0.22) / cells;
        if ((u - px) ** 2 + (v - py) ** 2 < r * r) {
          const k = hash(wx, wy, 14);
          const tone: [number, number, number] = k < 0.35 ? [0.25, 0.25, 0.27] : k < 0.6 ? [0.62, 0.45, 0.36] : k < 0.8 ? [0.85, 0.84, 0.8] : [0.45, 0.5, 0.48];
          return { shade: 1, tint: [...tone, 0.85], height: 0.6, rough: 0.8 };
        }
      }
    return { shade: 0.97 + (base - 0.5) * 0.08, height: 0.5, rough: 1 };
  },
  concrete: (u, v) => {
    const n = fbm(u, v, 5, 5, 15);
    const pit = hash(Math.floor(u * 180), Math.floor(v * 180), 16) > 0.996;
    return { shade: 0.9 + n * 0.2 - (pit ? 0.25 : 0), height: n - (pit ? 0.4 : 0), rough: 0.95 + n * 0.1 };
  },
  plaster: (u, v) => {
    const n = fbm(u, v, 3, 4, 17);
    return { shade: 0.975 + n * 0.05, height: n, rough: 1 };
  },
  stone: (u, v) => {
    const speck = hash(Math.floor(u * 220), Math.floor(v * 220), 18);
    const n = fbm(u, v, 6, 4, 19);
    const tint: [number, number, number, number] | undefined = speck > 0.93 ? [0.85, 0.84, 0.82, 0.55] : speck < 0.05 ? [0.05, 0.05, 0.06, 0.5] : undefined;
    return { shade: 0.92 + n * 0.16, ...(tint ? { tint } : {}), height: n, rough: 0.85 + n * 0.25 };
  },
  fabric: (u, v) => {
    const n = 64;
    const warp = Math.sin(u * n * Math.PI * 2) * 0.5 + 0.5;
    const weft = Math.sin(v * n * Math.PI * 2) * 0.5 + 0.5;
    const over = (Math.floor(u * n) + Math.floor(v * n)) % 2 === 0 ? warp : weft;
    const fuzz = fbm(u, v, 32, 2, 20);
    return { shade: 0.88 + over * 0.14 + (fuzz - 0.5) * 0.06, height: over, rough: 1.1 };
  },
  brick: (u, v) => {
    // Running bond: 4 courses per tile, each brick half a tile long.
    const courses = 4;
    const row = Math.floor(v * courses);
    const inRow = v * courses - row;
    const x = (u * 2 + (row % 2) * 0.5) % 1;
    const mortar = inRow < 0.08 || x < 0.03;
    if (mortar) return { shade: 1, tint: [0.78, 0.75, 0.7, 0.9], height: 0, rough: 1.3 };
    const id = Math.floor(u * 2 + (row % 2) * 0.5);
    const tone = 0.85 + hash(id, row, 21) * 0.25;
    const n = fbm(u, v, 12, 3, 22);
    return { shade: tone * (0.94 + n * 0.12), height: 0.8 + n * 0.2, rough: 1 };
  },
};

const INFER: [RegExp, MaterialTexture, number][] = [
  [/plank|parquet|laminate floor|wood floor/i, 'planks', 180],
  [/oak|walnut|teak|ash|maple|wood|veneer|butcher/i, 'wood', 600],
  [/marble|quartz|calacatta|carrara/i, 'marble', 1000],
  [/terrazzo/i, 'terrazzo', 800],
  [/granite|stone|slate|travertine/i, 'stone', 600],
  [/concrete|cement|microcement/i, 'concrete', 1500],
  [/brick/i, 'brick', 300],
  [/tile|porcelain|ceramic/i, 'tile', 600],
  [/linen|fabric|velvet|boucl/i, 'fabric', 150],
];

/**
 * The texture a finish is drawn with: its own, or for finishes saved before textures existed, one
 * read from its name ("Oak planks" → planks). Walls default to a faint plaster.
 */
export function effectiveTexture(m: KitchenMaterial): Pick<KitchenMaterial, 'texture' | 'textureScale'> {
  if (m.texture) return { texture: m.texture, textureScale: m.textureScale };
  const name = `${m.name} ${m.id}`;
  const hit = INFER.find(([re]) => re.test(name));
  if (hit) return { texture: hit[1], textureScale: hit[2] };
  return m.category === 'wall' ? { texture: 'plaster', textureScale: 2000 } : {};
}

/** How much of the finish one texture tile covers, in mm (planks and bricks draw several per tile). */
export function tileSizeMm(m: Pick<KitchenMaterial, 'texture' | 'textureScale'>): number {
  const s = m.textureScale ?? 600;
  return m.texture === 'planks' || m.texture === 'brick' ? s * 4 : s;
}

export interface FinishMaps {
  map: Texture;
  roughnessMap: Texture;
  normalMap: Texture;
  /** World units (metres) per tile. */
  tile: number;
}

const cache = new Map<string, FinishMaps>();

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function canvas(): { el: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  const el = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(SIZE, SIZE) : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const ctx = el.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  return ctx ? { el, ctx } : null;
}

function texture(el: HTMLCanvasElement | OffscreenCanvas, srgb: boolean): Texture {
  const t = new CanvasTexture(el as HTMLCanvasElement);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** The colour, roughness and normal maps for a textured finish (null for plain ones or without a canvas). */
export function finishMaps(material: KitchenMaterial): FinishMaps | null {
  const m = { ...material, ...effectiveTexture(material) };
  if (!m.texture || m.texture === 'plain') return null;
  const key = `${m.texture}|${m.color}|${m.textureScale ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pattern = PATTERNS[m.texture];
  const colour = canvas();
  const rough = canvas();
  const normal = canvas();
  if (!pattern || !colour || !rough || !normal) return null;
  const [r0, g0, b0] = hexToRgb(m.color);
  const heights = new Float32Array(SIZE * SIZE);
  const c = colour.ctx.createImageData(SIZE, SIZE);
  const rgh = rough.ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const s = pattern(x / SIZE, y / SIZE);
      let r = r0 * s.shade;
      let g = g0 * s.shade;
      let b = b0 * s.shade;
      if (s.tint) {
        const [tr, tg, tb, w] = s.tint;
        r = r * (1 - w) + tr * w;
        g = g * (1 - w) + tg * w;
        b = b * (1 - w) + tb * w;
      }
      const i = (y * SIZE + x) * 4;
      c.data[i] = clamp01(r) * 255;
      c.data[i + 1] = clamp01(g) * 255;
      c.data[i + 2] = clamp01(b) * 255;
      c.data[i + 3] = 255;
      // three.js reads roughness from the green channel and multiplies the material's roughness.
      const rv = clamp01(s.rough * 0.8) * 255;
      rgh.data[i] = rgh.data[i + 1] = rgh.data[i + 2] = rv;
      rgh.data[i + 3] = 255;
      heights[y * SIZE + x] = s.height;
    }
  // Normals from the height field (wrapping, so seams stay invisible).
  const n = normal.ctx.createImageData(SIZE, SIZE);
  const h = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  const strength = m.texture === 'plaster' ? 1.5 : 3;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      n.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      n.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      n.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      n.data[i + 3] = 255;
    }
  colour.ctx.putImageData(c, 0, 0);
  rough.ctx.putImageData(rgh, 0, 0);
  normal.ctx.putImageData(n, 0, 0);
  const maps: FinishMaps = { map: texture(colour.el, true), roughnessMap: texture(rough.el, false), normalMap: texture(normal.el, false), tile: tileSizeMm(m) / 1000 };
  // Geometry UVs are in metres (see worldUVs.ts): one tile repeats every `tile` metres.
  for (const t of [maps.map, maps.roughnessMap, maps.normalMap]) t.repeat.set(1 / maps.tile, 1 / maps.tile);
  cache.set(key, maps);
  return maps;
}
