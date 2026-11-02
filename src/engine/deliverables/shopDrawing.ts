/**
 * Module Orthographic Shop Drawing Generator.
 * Generates technical exploded panel views with cutting dimensions and boring coordinates.
 *
 * Rules:
 * - Framework-free TypeScript.
 * - Integer millimeter coordinates.
 */

import { explodeCabinet, type ExplodeCabinetInput } from '../manufacturing/explode';
import { type RulePack, SEED_RULE_PACK_V1 } from '@/domain/manufacturing/rulePack';
import { formatDimension, type Prim, type View } from './drawing';

export interface ModuleShopDrawingResult {
  view: View;
  moduleCode: string;
  totalParts: number;
  totalHardware: number;
}

/**
 * Builds an orthographic shop drawing layout showing each constituent panel, dimensions, and boring coordinates.
 */
export function buildModuleShopDrawing(
  cabinet: ExplodeCabinetInput,
  rulePack: RulePack = SEED_RULE_PACK_V1
): ModuleShopDrawingResult {
  const { parts, hardware } = explodeCabinet(cabinet, rulePack);
  const prims: Prim[] = [];

  let cursorX = 50;
  let cursorY = 50;
  let rowMaxH = 0;
  const colSpacing = 80;
  const rowSpacing = 120;
  const maxRowW = 2400; // Model mm width before wrapping

  for (const part of parts) {
    const pw = part.finishedWidth;
    const pl = part.finishedLength;

    if (cursorX + pw > maxRowW) {
      cursorX = 50;
      cursorY += rowMaxH + rowSpacing;
      rowMaxH = 0;
    }

    rowMaxH = Math.max(rowMaxH, pl);

    // Panel bounding rect
    prims.push({
      t: 'rect',
      x: cursorX,
      y: cursorY,
      w: pw,
      h: pl,
      stroke: 'medium',
      fill: part.role === 'shutter' ? 'front' : (part.role === 'carcass' ? 'unit' : 'none'),
    });

    // Panel title and specification text
    prims.push({
      t: 'text',
      at: { x: cursorX + pw / 2, y: cursorY - 15 },
      text: `${part.name} (${part.quantity}x)`,
      size: 3.2,
      bold: true,
      anchor: 'middle',
    });

    const ebInfo = [
      part.edgeBanding.w1 ? `W1:${part.edgeBanding.w1}` : '',
      part.edgeBanding.l1 ? `L1:${part.edgeBanding.l1}` : '',
    ].filter(Boolean).join(' ');

    prims.push({
      t: 'text',
      at: { x: cursorX + pw / 2, y: cursorY + pl / 2 },
      text: `${part.material} · ${part.thickness}mm${ebInfo ? ` · ${ebInfo}` : ''}`,
      size: 2.2,
      anchor: 'middle',
    });

    // Horizontal dimension (width)
    prims.push({
      t: 'dim',
      a: { x: cursorX, y: cursorY + pl },
      b: { x: cursorX + pw, y: cursorY + pl },
      offset: -20,
      value: pw,
      text: formatDimension(pw, 'mm'),
      role: 'segment',
      axis: 'x',
    });

    // Vertical dimension (length)
    prims.push({
      t: 'dim',
      a: { x: cursorX + pw, y: cursorY },
      b: { x: cursorX + pw, y: cursorY + pl },
      offset: 20,
      value: pl,
      text: formatDimension(pl, 'mm'),
      role: 'segment',
      axis: 'y',
    });

    // Boring holes (e.g. 5mm shelf pins or 35mm hinge cups)
    for (const hole of part.holes) {
      const hx = cursorX + hole.x;
      const hy = cursorY + hole.y;
      prims.push({
        t: 'arc',
        c: { x: hx, y: hy },
        r: hole.diameter / 2,
        a0: 0,
        a1: Math.PI * 2,
        stroke: 'thin',
      });
      // Small crosshair at hole centre
      prims.push({
        t: 'line',
        a: { x: hx - 4, y: hy },
        b: { x: hx + 4, y: hy },
        stroke: 'thin',
      });
      prims.push({
        t: 'line',
        a: { x: hx, y: hy - 4 },
        b: { x: hx, y: hy + 4 },
        stroke: 'thin',
      });
    }

    cursorX += pw + colSpacing;
  }

  const moduleCode = parts[0]?.moduleCode || cabinet.type.toUpperCase();
  const totalHardwareQty = hardware.reduce((acc, h) => acc + h.quantity, 0);

  return {
    view: {
      id: `shop-${cabinet.id}`,
      title: `Module Shop Drawing: ${moduleCode}`,
      prims,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: Math.max(maxRowW, cursorX + 100),
        maxY: cursorY + rowMaxH + 100,
      },
      notes: [
        `All dimensions in millimetres. Cut size accounts for edge-banding deductions.`,
        `System 32mm boring pitch on side gables with 37mm front edge setback.`,
        `Hardware items required: ${hardware.map((h) => `${h.quantity}x ${h.name}`).join(', ')}.`,
      ],
    },
    moduleCode,
    totalParts: parts.length,
    totalHardware: totalHardwareQty,
  };
}

