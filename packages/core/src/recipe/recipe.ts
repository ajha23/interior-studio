import { isMaterialId } from '../materials/library';

/**
 * A furniture "recipe": a compact, engine-neutral description of how to build a piece from
 * shaped parts. Written by Gemini from a photo or a description, built by three.js in the
 * browser today and by Blender on a server later — both read the same format.
 *
 * Coordinates are millimetres in the piece's own frame: x across the width (centred on 0),
 * y up from the floor, z front-to-back (centred on 0, +z is the front). Rotations in degrees.
 */
export const RECIPE_VERSION = 1;

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

interface PartBase {
  id: string;
  /** Material slot name (key of `materials`). */
  material: string;
  /** Centre of the part. */
  position: Vec3;
  rotation?: Vec3;
  /** Repeat the part `count` times, each copy shifted by `offset` from the previous. */
  repeat?: { count: number; offset: Vec3 };
}

export type RecipePart =
  | (PartBase & { shape: 'box'; size: Vec3 })
  /** Box with rounded edges: cushions, tabletops, soft blocks. */
  | (PartBase & { shape: 'roundedBox'; size: Vec3; radius: number })
  /** Cylinder or tapered cylinder along y (legs, rods, posts). */
  | (PartBase & { shape: 'cylinder'; radiusTop: number; radiusBottom: number; height: number })
  | (PartBase & { shape: 'sphere'; radius: number })
  /** Torus in the xz plane (rings, handles). */
  | (PartBase & { shape: 'torus'; radius: number; tube: number })
  /** Surface of revolution around y: [radius, y] points bottom to top (turned legs, vases, lamp bases). */
  | (PartBase & { shape: 'lathe'; profile: Vec2[] })
  /** 2D outline in the xy plane, extruded along z by `depth` (headboards, arched panels, shaped arms, cabriole legs). */
  | (PartBase & { shape: 'extrude'; outline: Vec2[]; holes?: Vec2[][]; depth: number; bevel?: number })
  /** Round tube along a smooth path of 3D points (bent frames, rails, cane loops). */
  | (PartBase & { shape: 'tube'; path: Vec3[]; radius: number; closed?: boolean });

export interface Recipe {
  version: number;
  name: string;
  category: string;
  /** Overall size in mm: width (x), depth (z), height (y). */
  size: { w: number; d: number; h: number };
  /** Slot name → material id from the studio material library. */
  materials: Record<string, string>;
  parts: RecipePart[];
  /** Short note on what was assumed (shown to the designer). */
  notes?: string;
}

export const RECIPE_SHAPES = ['box', 'roundedBox', 'cylinder', 'sphere', 'torus', 'lathe', 'extrude', 'tube'] as const;
const MAX_PARTS = 120;
const MAX_INSTANCES = 400;
const MAX_POINTS = 64;
const MAX_MM = 8000;

const num = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const vec3 = (v: unknown, lo = -MAX_MM, hi = MAX_MM): Vec3 => {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0], lo, hi, 0), num(a[1], lo, hi, 0), num(a[2], lo, hi, 0)];
};
const points2 = (v: unknown): Vec2[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, MAX_POINTS)
    .filter((p) => Array.isArray(p))
    .map((p) => [num(p[0], -MAX_MM, MAX_MM, 0), num(p[1], -MAX_MM, MAX_MM, 0)] as Vec2);
const points3 = (v: unknown): Vec3[] => (Array.isArray(v) ? v : []).slice(0, MAX_POINTS).map((p) => vec3(p));

export class RecipeError extends Error {}

/**
 * Turn untrusted JSON (from a model) into a safe, bounded recipe. Unknown shapes are dropped,
 * numbers are clamped, unknown materials fall back to a neutral finish, and the total number of
 * built pieces is capped so a bad answer can't hang the browser.
 */
export function sanitizeRecipe(input: unknown): Recipe {
  const r = (input ?? {}) as Record<string, unknown>;
  const size = (r.size ?? {}) as Record<string, unknown>;
  const mats: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.materials ?? {}) as Record<string, unknown>).slice(0, 12)) {
    const key = String(k).slice(0, 32);
    mats[key] = typeof v === 'string' && isMaterialId(v) ? v : 'white-matte';
  }
  if (!Object.keys(mats).length) mats.main = 'oak-light';
  const firstSlot = Object.keys(mats)[0];

  let instances = 0;
  const parts: RecipePart[] = [];
  for (const raw of (Array.isArray(r.parts) ? r.parts : []).slice(0, MAX_PARTS)) {
    const p = raw as Record<string, unknown>;
    const shape = String(p.shape) as RecipePart['shape'];
    if (!(RECIPE_SHAPES as readonly string[]).includes(shape)) continue;
    const rep = p.repeat as { count?: unknown; offset?: unknown } | undefined;
    const count = rep ? Math.round(num(rep.count, 1, 60, 1)) : 1;
    if (instances + count > MAX_INSTANCES) break;
    const base = {
      id: String(p.id ?? `p${parts.length + 1}`).slice(0, 40),
      material: typeof p.material === 'string' && p.material in mats ? p.material : firstSlot,
      position: vec3(p.position),
      ...(p.rotation ? { rotation: vec3(p.rotation, -360, 360) } : {}),
      ...(rep && count > 1 ? { repeat: { count, offset: vec3(rep.offset) } } : {}),
    };
    const s = (v: unknown, d = 10) => num(v, 0.5, MAX_MM, d);
    let part: RecipePart | null = null;
    switch (shape) {
      case 'box':
        part = { ...base, shape, size: vec3(p.size, 0.5, MAX_MM).map((x) => Math.max(0.5, x)) as Vec3 };
        break;
      case 'roundedBox': {
        const sz = vec3(p.size, 0.5, MAX_MM).map((x) => Math.max(0.5, x)) as Vec3;
        part = { ...base, shape, size: sz, radius: num(p.radius, 0, Math.min(...sz) / 2, Math.min(...sz) / 8) };
        break;
      }
      case 'cylinder':
        part = { ...base, shape, radiusTop: s(p.radiusTop ?? p.radius, 20), radiusBottom: s(p.radiusBottom ?? p.radius, 20), height: s(p.height, 100) };
        break;
      case 'sphere':
        part = { ...base, shape, radius: s(p.radius, 50) };
        break;
      case 'torus':
        part = { ...base, shape, radius: s(p.radius, 50), tube: s(p.tube, 5) };
        break;
      case 'lathe': {
        const profile = points2(p.profile).map(([rr, y]) => [Math.max(0, rr), y] as Vec2);
        if (profile.length >= 2) part = { ...base, shape, profile };
        break;
      }
      case 'extrude': {
        const outline = points2(p.outline);
        if (outline.length >= 3) {
          const holes = (Array.isArray(p.holes) ? p.holes : []).slice(0, 8).map(points2).filter((h) => h.length >= 3);
          part = { ...base, shape, outline, holes: holes.length ? holes : undefined, depth: s(p.depth, 18), bevel: num(p.bevel, 0, 50, 0) };
        }
        break;
      }
      case 'tube': {
        const path = points3(p.path);
        if (path.length >= 2) part = { ...base, shape, path, radius: s(p.radius, 8), closed: Boolean(p.closed) };
        break;
      }
    }
    if (part) {
      parts.push(part);
      instances += count;
    }
  }
  if (!parts.length) throw new RecipeError('The description had no usable parts.');
  return {
    version: RECIPE_VERSION,
    name: String(r.name ?? 'AI model').slice(0, 120),
    category: String(r.category ?? 'decor').slice(0, 40),
    size: { w: num(size.w, 20, MAX_MM, 600), d: num(size.d, 20, MAX_MM, 600), h: num(size.h, 20, MAX_MM, 600) },
    materials: mats,
    parts,
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 400) : undefined,
  };
}

/** Scale a recipe so its overall size becomes `size` (designer adjustments before saving). */
export function resizeRecipe(r: Recipe, size: { w: number; d: number; h: number }): Recipe {
  const sx = size.w / r.size.w;
  const sy = size.h / r.size.h;
  const sz = size.d / r.size.d;
  const v3 = (v: Vec3): Vec3 => [v[0] * sx, v[1] * sy, v[2] * sz];
  const mean = (sx + sy + sz) / 3;
  const parts = r.parts.map((p): RecipePart => {
    const base = { ...p, position: v3(p.position), ...(p.repeat ? { repeat: { ...p.repeat, offset: v3(p.repeat.offset) } } : {}) };
    switch (p.shape) {
      case 'box':
        return { ...base, shape: 'box', size: v3(p.size) } as RecipePart;
      case 'roundedBox':
        return { ...base, shape: 'roundedBox', size: v3(p.size), radius: p.radius * Math.min(sx, sy, sz) } as RecipePart;
      case 'cylinder':
        return { ...base, shape: 'cylinder', radiusTop: p.radiusTop * Math.min(sx, sz), radiusBottom: p.radiusBottom * Math.min(sx, sz), height: p.height * sy } as RecipePart;
      case 'sphere':
        return { ...base, shape: 'sphere', radius: p.radius * mean } as RecipePart;
      case 'torus':
        return { ...base, shape: 'torus', radius: p.radius * Math.min(sx, sz), tube: p.tube * mean } as RecipePart;
      case 'lathe':
        return { ...base, shape: 'lathe', profile: p.profile.map(([rr, y]) => [rr * Math.min(sx, sz), y * sy] as Vec2) } as RecipePart;
      case 'extrude':
        // Outline lives in the part's own xy plane; rotation may map it elsewhere, so scale evenly in-plane.
        return { ...base, shape: 'extrude', outline: p.outline.map(([x, y]) => [x * sx, y * sy] as Vec2), holes: p.holes?.map((h) => h.map(([x, y]) => [x * sx, y * sy] as Vec2)), depth: p.depth * sz } as RecipePart;
      case 'tube':
        return { ...base, shape: 'tube', path: p.path.map(v3), radius: p.radius * mean } as RecipePart;
    }
  });
  return { ...r, size: { ...size }, parts };
}

/** Number of meshes the recipe builds (repeats expanded). */
export function recipeInstanceCount(r: Recipe): number {
  return r.parts.reduce((n, p) => n + (p.repeat?.count ?? 1), 0);
}
