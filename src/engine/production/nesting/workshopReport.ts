/**
 * Printable Multi-Page Workshop Cutting Report Generator
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (100% Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I, Principle III
 */

import type { NestingResult } from './types';

export function generateWorkshopHtmlReport(result: NestingResult, projectName = 'Interior Studio Project'): string {
  const dateStr = new Date(result.calculatedAt || Date.now()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const sheetPages = result.sheets.map((sheet) => {
    const tableRows = sheet.placements
      .map(
        (p, idx) => `
        <tr>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">#${idx + 1}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${p.partName}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${p.length} × ${p.width}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${p.rotated ? 'Yes (↻ 90°)' : 'No'}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${p.banding}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${p.units.join(', ') || '—'}</td>
        </tr>`
      )
      .join('');

    const svgPlacements = sheet.placements
      .map(
        (p) => `
        <rect x="${p.x}" y="${p.y}" width="${p.length}" height="${p.width}" fill="#e0f2fe" stroke="#0284c7" stroke-width="2" rx="2" />
        <text x="${p.x + p.length / 2}" y="${p.y + p.width / 2}" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="bold" fill="#0f172a">
          ${p.partName} (${p.length}×${p.width})
        </text>`
      )
      .join('');

    const svgOffcuts = sheet.offcuts
      .map(
        (o) => `
        <rect x="${o.x}" y="${o.y}" width="${o.length}" height="${o.width}" fill="${o.isReusable ? '#d1fae5' : '#f1f5f9'}" stroke="${o.isReusable ? '#10b981' : '#cbd5e1'}" stroke-width="1.5" stroke-dasharray="${o.isReusable ? 'none' : '4 3'}" />
        ${
          o.isReusable
            ? `<text x="${o.x + o.length / 2}" y="${o.y + o.width / 2}" text-anchor="middle" dominant-baseline="middle" font-size="18" font-weight="600" fill="#047857">Offcut: ${o.length}×${o.width}</text>`
            : ''
        }`
      )
      .join('');

    return `
    <div class="sheet-page">
      <div class="header">
        <div class="title-group">
          <h2>Sheet ${sheet.sheetIndex} of ${result.totalSheets} &mdash; ${sheet.material} (${sheet.thickness}mm)</h2>
          <p class="meta">Board: ${sheet.boardLength} × ${sheet.boardWidth} mm &bull; Trim: ${sheet.trimMargin} mm &bull; Kerf: ${sheet.kerf} mm</p>
        </div>
        <div class="yield-badge">Yield: ${sheet.yieldPercentage}%</div>
      </div>

      <div class="diagram-container">
        <svg viewBox="0 0 ${sheet.boardLength} ${sheet.boardWidth}" class="sheet-svg">
          <rect x="0" y="0" width="${sheet.boardLength}" height="${sheet.boardWidth}" fill="#ffffff" stroke="#334155" stroke-width="3" />
          ${svgOffcuts}
          ${svgPlacements}
        </svg>
      </div>

      <div class="table-container">
        <h3>Cutting Sequence & Part Labeling</h3>
        <table class="cut-table">
          <thead>
            <tr>
              <th style="padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">Item</th>
              <th style="padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">Part Name</th>
              <th style="padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">Dimensions (mm)</th>
              <th style="padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">Rotated</th>
              <th style="padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">Edge Banding</th>
              <th style="padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">Cabinet Ref</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${projectName} - Workshop Cutting Package</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet-page { page-break-after: always; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #1e293b;
      background: #f8fafc;
    }
    .sheet-page {
      background: #ffffff;
      padding: 24px;
      margin-bottom: 24px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .header h2 { margin: 0 0 4px 0; font-size: 18px; color: #0f172a; }
    .header .meta { margin: 0; font-size: 12px; color: #64748b; }
    .yield-badge {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #10b981;
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
    }
    .diagram-container {
      margin-bottom: 16px;
      text-align: center;
    }
    .sheet-svg {
      max-width: 100%;
      height: 260px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .table-container h3 {
      font-size: 13px;
      margin: 0 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
    }
    .cut-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .project-summary {
      background: #ffffff;
      padding: 20px;
      margin-bottom: 24px;
      border-radius: 8px;
      border-left: 4px solid #0284c7;
    }
    .project-summary h1 { margin: 0 0 6px 0; font-size: 20px; }
    .project-summary p { margin: 0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="project-summary">
    <h1>${projectName} &mdash; Workshop Cutting Layouts</h1>
    <p>Calculated: ${dateStr} &bull; Total Boards: <strong>${result.totalSheets}</strong> &bull; Net Yield: <strong>${result.netYieldPercentage}%</strong> &bull; Salvage Offcuts: <strong>${result.reusableOffcuts.length}</strong></p>
  </div>

  ${sheetPages.join('\n')}
</body>
</html>`;
}
