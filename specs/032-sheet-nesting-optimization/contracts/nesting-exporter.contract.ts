/**
 * Nesting Exporter Interface Contract
 * Feature: 032-sheet-nesting-optimization
 * Architecture: Export generation for SVG, DXF, and Print/PDF
 */

import type { NestedSheet, NestingResult } from '../../src/engine/production/nesting/types';

export interface SvgRenderOptions {
  widthPx?: number;
  heightPx?: number;
  showLabels?: boolean;
  showDimensions?: boolean;
  showOffcuts?: boolean;
  highlightReusableOffcuts?: boolean;
  colorScheme?: 'workshop' | 'high_contrast' | 'monochrome';
}

export interface DxfExportOptions {
  layerParts?: string;
  layerKerf?: string;
  layerBoard?: string;
  layerLabels?: string;
}

export interface INestingExporter {
  /**
   * Generates a fully responsive, printable SVG vector string for a single sheet layout.
   */
  renderSheetSvg(sheet: NestedSheet, options?: SvgRenderOptions): string;

  /**
   * Generates standard AutoCAD Release 12 DXF format string containing 2D panel polylines
   * for direct import into CNC router CAM software (e.g., Vectric, ArtCAM, Alphacam).
   */
  exportSheetDxf(sheet: NestedSheet, options?: DxfExportOptions): string;

  /**
   * Generates printable workshop cutting report HTML/document bundle with QR codes,
   * cutting sequences, edge banding indicators, and sheet yield summary.
   */
  exportWorkshopHtmlReport(result: NestingResult, projectName: string): string;
}
