import { materialById, type Material, type MaterialCategory } from '@studio/core';

/**
 * Procedural material swatches. One canvas tile is drawn per material and reused by the plan
 * (as an SVG pattern image), the 3D view (as a repeating texture) and the swatch pickers.
 */
const TILE_PX = 256;

/** Real-world size of one tile, in mm. */
export function tileMm(m: Material): number {
  const s = m.scaleMm ?? 300;
  switch (m.pattern) {
    case 'planks':
      return s * 4;
    case 'herringbone':
      return s * 4;
    case 'tiles':
      return s * 2;
    case 'brick':
      return s * 2;
    case 'stripes':
      return s * 2;
    case 'stone':
      return s * 2;
    case 'fabric':
      return s * 8;
    case 'marble':
      return s;
    default:
      return 1000;
  }
}

/** Deterministic pseudo-random sequence so tiles look the same on every load. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function draw(ctx: CanvasRenderingContext2D, m: Material) {
  const S = TILE_PX;
  const rand = rng(m.id);
  const accent = m.accent ?? shade(m.color, -0.08);
  ctx.fillStyle = m.color;
  ctx.fillRect(0, 0, S, S);
  ctx.lineWidth = 2;
  switch (m.pattern) {
    case 'planks': {
      const n = 4;
      const pw = S / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(m.color, (rand() - 0.5) * 0.08);
        ctx.fillRect(i * pw, 0, pw, S);
        // grain
        ctx.strokeStyle = shade(m.color, -0.05);
        ctx.lineWidth = 1;
        for (let g = 0; g < 6; g++) {
          const x = i * pw + rand() * pw;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(x + 4, S * 0.3, x - 4, S * 0.7, x + 2, S);
          ctx.stroke();
        }
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(i * pw, 0);
        ctx.lineTo(i * pw, S);
        const joint = rand() * S;
        ctx.moveTo(i * pw, joint);
        ctx.lineTo(i * pw + pw, joint);
        ctx.stroke();
      }
      break;
    }
    case 'herringbone': {
      const u = S / 4;
      ctx.strokeStyle = accent;
      for (let row = -2; row < 8; row++)
        for (let col = -2; col < 8; col++) {
          const x = col * u;
          const y = row * u + col * u;
          ctx.fillStyle = shade(m.color, (rand() - 0.5) * 0.08);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + u, y + u);
          ctx.lineTo(x + u, y + 2 * u);
          ctx.lineTo(x, y + u);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      break;
    }
    case 'tiles': {
      const n = 2;
      const t = S / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = shade(m.color, (rand() - 0.5) * 0.04);
          ctx.fillRect(i * t, j * t, t, t);
        }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath();
        ctx.moveTo(i * t, 0);
        ctx.lineTo(i * t, S);
        ctx.moveTo(0, i * t);
        ctx.lineTo(S, i * t);
        ctx.stroke();
      }
      break;
    }
    case 'brick': {
      const bw = S / 2;
      const bh = bw / 3;
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, S, S);
      for (let r = 0; r * bh < S; r++)
        for (let c = -1; c < 3; c++) {
          const x = c * bw + (r % 2 ? bw / 2 : 0);
          ctx.fillStyle = shade(m.color, (rand() - 0.5) * 0.12);
          ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        }
      break;
    }
    case 'stripes': {
      const n = 4;
      const sw = S / n;
      ctx.fillStyle = accent;
      for (let i = 0; i < n; i += 2) ctx.fillRect(i * sw, 0, sw, S);
      break;
    }
    case 'marble': {
      ctx.strokeStyle = accent;
      for (let v = 0; v < 7; v++) {
        ctx.lineWidth = 0.5 + rand() * 2;
        ctx.globalAlpha = 0.35 + rand() * 0.4;
        let x = rand() * S;
        let y = 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (y < S) {
          x += (rand() - 0.4) * 40;
          y += 10 + rand() * 30;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'stone': {
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = rand() > 0.5 ? accent : shade(m.color, (rand() - 0.5) * 0.2);
        const r = 1 + rand() * 6;
        ctx.beginPath();
        ctx.arc(rand() * S, rand() * S, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'fabric': {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      for (let i = 0; i < S; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, S);
        ctx.moveTo(0, i + 2);
        ctx.lineTo(S, i + 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}

const canvases = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

export function patternCanvas(id: string, category: MaterialCategory = 'surface'): HTMLCanvasElement {
  const m = materialById(id, category);
  let c = canvases.get(m.id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = TILE_PX;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, m);
    canvases.set(m.id, c);
  }
  return c;
}

/** PNG data URL of the swatch tile (cached). */
export function patternUrl(id: string, category: MaterialCategory = 'surface'): string {
  const m = materialById(id, category);
  let u = urls.get(m.id);
  if (!u) {
    try {
      u = patternCanvas(m.id, category).toDataURL('image/png');
    } catch {
      u = '';
    }
    urls.set(m.id, u);
  }
  return u;
}
