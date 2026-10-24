import type { Poly, Vec } from './walls';

/** Shoelace signed area (sign depends on vertex order; coordinate handedness is irrelevant). */
export function signedArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function area(p: Poly): number {
  return Math.abs(signedArea(p));
}

export function perimeter(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/** Even-odd point-in-polygon; points on the boundary count as inside within `tol`. */
export function pointInPolygon(pt: Vec, poly: Poly, tol = 0): boolean {
  if (tol > 0 && distanceToBoundary(pt, poly) <= tol) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToBoundary(p: Vec, poly: Poly): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distanceToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Largest distance any vertex of `p` lies outside `container` (0 when all inside). */
export function outsideDistance(p: Poly, container: Poly): number {
  let worst = 0;
  for (const v of p) if (!pointInPolygon(v, container)) worst = Math.max(worst, distanceToBoundary(v, container));
  return worst;
}

export function centroid(p: Poly): Vec {
  const a = signedArea(p);
  if (Math.abs(a) < 1e-9) {
    const n = p.length || 1;
    return { x: p.reduce((s, v) => s + v.x, 0) / n, y: p.reduce((s, v) => s + v.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    const w = p[(i + 1) % p.length];
    const f = v.x * w.y - w.x * v.y;
    cx += (v.x + w.x) * f;
    cy += (v.y + w.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * A point guaranteed to be inside the polygon (for labels and room seeds). Uses the centroid when
 * it is inside; otherwise the midpoint of the widest span on the horizontal line through the centroid.
 */
export function interiorPoint(p: Poly): Vec {
  const c = centroid(p);
  if (pointInPolygon(c, p)) return c;
  const ys = [c.y, ...p.map((v, i) => (v.y + p[(i + 1) % p.length].y) / 2)];
  for (const y of ys) {
    const xs: number[] = [];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i];
      const b = p[j];
      if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
    xs.sort((m, n) => m - n);
    let best: Vec | null = null;
    let width = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > width) {
        width = xs[i + 1] - xs[i];
        best = { x: (xs[i] + xs[i + 1]) / 2, y };
      }
    }
    if (best) return best;
  }
  return c;
}

/** Drop vertices that sit on the straight line between their neighbours. */
export function removeCollinear(p: Poly, tol = 1): Poly {
  if (p.length <= 3) return p;
  const out: Poly = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i - 1 + p.length) % p.length];
    const b = p[i];
    const c = p[(i + 1) % p.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    if (Math.abs(cross) / len > tol) out.push(b);
  }
  return out.length >= 3 ? out : p;
}
