/**
 * Pure Deterministic AutoCAD DXF (R12 / AC1009) Exporter.
 * Generates layered 2D CAD files compatible with AutoCAD, BricsCAD, SolidWorks and CNC tools.
 *
 * Layers:
 * - 0: Boundary
 * - WALLS: Wall outlines (Color 7 White)
 * - CABINETS: Cabinet footprints and elevations (Color 3 Green)
 * - APPLIANCES: Appliance footprints (Color 1 Red)
 * - WORKTOPS: Countertop contours (Color 4 Cyan)
 * - MEP_PLUMBING: Water inlet & drain points (Color 5 Blue)
 * - MEP_ELECTRICAL: 16A & 6A sockets, chimney duct (Color 1 Red)
 * - DIMENSIONS: Dimension chains (Color 2 Yellow)
 * - LABELS: Cabinet codes & room text (Color 7 White)
 */

import { deriveCountertops, type KitchenProject } from '@/domain';
import { elementBox } from '../geometry/box';

export interface DxfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
}

export interface DxfCircle {
  cx: number;
  cy: number;
  r: number;
  layer: string;
}

export interface DxfText {
  x: number;
  y: number;
  height: number;
  text: string;
  layer: string;
}

export class DxfBuilder {
  private lines: DxfLine[] = [];
  private circles: DxfCircle[] = [];
  private texts: DxfText[] = [];

  addLine(x1: number, y1: number, x2: number, y2: number, layer: string): this {
    this.lines.push({ x1, y1, x2, y2, layer });
    return this;
  }

  addRect(x: number, y: number, w: number, h: number, layer: string): this {
    this.addLine(x, y, x + w, y, layer);
    this.addLine(x + w, y, x + w, y + h, layer);
    this.addLine(x + w, y + h, x, y + h, layer);
    this.addLine(x, y + h, x, y, layer);
    return this;
  }

  addCircle(cx: number, cy: number, r: number, layer: string): this {
    this.circles.push({ cx, cy, r, layer });
    return this;
  }

  addText(x: number, y: number, height: number, text: string, layer: string): this {
    this.texts.push({ x, y, height, text, layer });
    return this;
  }

  stringify(): string {
    const out: string[] = [];

    // 1. Header
    out.push('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC');

    // 2. Tables & Layers
    out.push('  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n     8');

    const layerDefs = [
      { name: '0', color: 7 },
      { name: 'WALLS', color: 7 },
      { name: 'CABINETS', color: 3 },
      { name: 'APPLIANCES', color: 1 },
      { name: 'WORKTOPS', color: 4 },
      { name: 'MEP_PLUMBING', color: 5 },
      { name: 'MEP_ELECTRICAL', color: 1 },
      { name: 'DIMENSIONS', color: 2 },
      { name: 'LABELS', color: 7 },
    ];

    for (const l of layerDefs) {
      out.push(`  0\nLAYER\n  2\n${l.name}\n 70\n     0\n 62\n     ${l.color}\n  6\nCONTINUOUS`);
    }

    out.push('  0\nENDTAB\n  0\nENDSEC');

    // 3. Blocks Section (minimal)
    out.push('  0\nSECTION\n  2\nBLOCKS\n  0\nENDSEC');

    // 4. Entities Section
    out.push('  0\nSECTION\n  2\nENTITIES');

    for (const line of this.lines) {
      out.push(
        `  0\nLINE\n  8\n${line.layer}\n 10\n${line.x1}\n 20\n${line.y1}\n 30\n0.0\n 11\n${line.x2}\n 21\n${line.y2}\n 31\n0.0`
      );
    }

    for (const c of this.circles) {
      out.push(
        `  0\nCIRCLE\n  8\n${c.layer}\n 10\n${c.cx}\n 20\n${c.cy}\n 30\n0.0\n 40\n${c.r}`
      );
    }

    for (const t of this.texts) {
      out.push(
        `  0\nTEXT\n  8\n${t.layer}\n 10\n${t.x}\n 20\n${t.y}\n 30\n0.0\n 40\n${t.height}\n  1\n${t.text}`
      );
    }

    out.push('  0\nENDSEC\n  0\nEOF\n');

    return out.join('\n');
  }
}

/**
 * Exports the 2D floor plan of a kitchen project into a layered AutoCAD DXF string.
 */
export function exportPlanDxf(project: KitchenProject): string {
  const dxf = new DxfBuilder();
  const { width: W, length: L, wallThickness: wt } = project.room;

  // 1. Room Inner and Outer Walls
  dxf.addRect(0, 0, W, L, 'WALLS');
  dxf.addRect(-wt, -wt, W + 2 * wt, L + 2 * wt, 'WALLS');

  // Room Title & Dimensions
  dxf.addText(W / 2 - 200, L / 2, 120, `${project.name} (Plan)`, 'LABELS');
  dxf.addText(W / 2 - 150, L / 2 - 150, 80, `${W} x ${L} mm`, 'LABELS');

  // 2. Cabinets Footprints
  for (const cab of project.cabinets) {
    const b = elementBox(cab);
    dxf.addRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ, 'CABINETS');
    const labelX = (b.minX + b.maxX) / 2 - 40;
    const labelZ = (b.minZ + b.maxZ) / 2;
    dxf.addText(labelX, labelZ, 60, cab.id, 'LABELS');
  }

  // 3. Appliances
  for (const app of project.appliances) {
    const b = elementBox(app);
    dxf.addRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ, 'APPLIANCES');
    dxf.addText((b.minX + b.maxX) / 2 - 50, (b.minZ + b.maxZ) / 2, 60, app.type.toUpperCase(), 'LABELS');
  }

  // 4. Countertops
  const slabs = deriveCountertops(project);
  for (const slab of slabs) {
    const b = slab.box;
    dxf.addRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ, 'WORKTOPS');
  }

  // 5. MEP Points on Plan
  const mepPoints = project.mep || [];
  for (const p of mepPoints) {
    let px = 0;
    let pz = 0;
    if (p.wallId === 'back') {
      px = p.offset;
      pz = 25;
    } else if (p.wallId === 'left') {
      px = 25;
      pz = p.offset;
    } else if (p.wallId === 'right') {
      px = W - 25;
      pz = p.offset;
    } else if (p.wallId === 'front') {
      px = p.offset;
      pz = L - 25;
    }

    const isPlumbing = p.kind.startsWith('water');
    const layer = isPlumbing ? 'MEP_PLUMBING' : 'MEP_ELECTRICAL';

    dxf.addCircle(px, pz, 30, layer);
    dxf.addText(px + 35, pz, 40, p.label || p.kind, layer);
  }

  return dxf.stringify();
}
