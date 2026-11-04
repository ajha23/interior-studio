/**
 * AutoCAD Release 12 (R12) DXF Exporter for 2D Sheet Nesting Layouts
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (100% Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I, Principle III
 */

import type { NestedSheet } from './types';

function createClosedPolyline(x: number, y: number, length: number, width: number, layer: string): string {
  const v1 = `0\nVERTEX\n8\n${layer}\n10\n${x.toFixed(2)}\n20\n${y.toFixed(2)}\n30\n0.0\n`;
  const v2 = `0\nVERTEX\n8\n${layer}\n10\n${(x + length).toFixed(2)}\n20\n${y.toFixed(2)}\n30\n0.0\n`;
  const v3 = `0\nVERTEX\n8\n${layer}\n10\n${(x + length).toFixed(2)}\n20\n${(y + width).toFixed(2)}\n30\n0.0\n`;
  const v4 = `0\nVERTEX\n8\n${layer}\n10\n${x.toFixed(2)}\n20\n${(y + width).toFixed(2)}\n30\n0.0\n`;

  return `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n1\n${v1}${v2}${v3}${v4}0\nSEQEND\n`;
}

function createText(x: number, y: number, text: string, height: number, layer: string): string {
  const sanitized = text.replace(/[\r\n]/g, ' ').trim();
  return `0\nTEXT\n8\n${layer}\n10\n${x.toFixed(2)}\n20\n${y.toFixed(2)}\n30\n0.0\n40\n${height}\n1\n${sanitized}\n`;
}

/**
 * Generates standard AutoCAD R12 DXF format string for a nested sheet.
 */
export function exportSheetToDxf(sheet: NestedSheet): string {
  const parts: string[] = [];

  // DXF Header
  parts.push('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n');

  // DXF Tables & Layers
  parts.push(
    '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n' +
      '0\nLAYER\n2\nBOARD_OUTLINE\n70\n0\n62\n7\n6\nCONTINUOUS\n' +
      '0\nLAYER\n2\nPANEL_CUTS\n70\n0\n62\n4\n6\nCONTINUOUS\n' +
      '0\nLAYER\n2\nPART_LABELS\n70\n0\n62\n2\n6\nCONTINUOUS\n' +
      '0\nLAYER\n2\nOFFCUT_ZONES\n70\n0\n62\n3\n6\nCONTINUOUS\n' +
      '0\nENDTAB\n0\nENDSEC\n'
  );

  // DXF Entities Section
  parts.push('0\nSECTION\n2\nENTITIES\n');

  // 1. Raw Board Boundary
  parts.push(createClosedPolyline(0, 0, sheet.boardLength, sheet.boardWidth, 'BOARD_OUTLINE'));

  // 2. Usable Margin Boundary
  parts.push(
    createClosedPolyline(
      sheet.trimMargin,
      sheet.trimMargin,
      sheet.boardLength - 2 * sheet.trimMargin,
      sheet.boardWidth - 2 * sheet.trimMargin,
      'BOARD_OUTLINE'
    )
  );

  // 3. Nested Panel Contours and Text Labels
  for (const panel of sheet.placements) {
    parts.push(createClosedPolyline(panel.x, panel.y, panel.length, panel.width, 'PANEL_CUTS'));

    // Label in the center of the part
    const labelX = panel.x + 20;
    const labelY = panel.y + panel.width / 2;
    const label = `${panel.partName} (${panel.length}x${panel.width})`;
    parts.push(createText(labelX, labelY, label, 24, 'PART_LABELS'));
  }

  // 4. Reusable Offcuts
  for (const offcut of sheet.offcuts) {
    if (offcut.isReusable) {
      parts.push(createClosedPolyline(offcut.x, offcut.y, offcut.length, offcut.width, 'OFFCUT_ZONES'));
      parts.push(
        createText(
          offcut.x + 20,
          offcut.y + offcut.width / 2,
          `SALVAGE_OFFCUT (${offcut.length}x${offcut.width})`,
          20,
          'PART_LABELS'
        )
      );
    }
  }

  // End Entities & End of File
  parts.push('0\nENDSEC\n0\nEOF\n');

  return parts.join('');
}
