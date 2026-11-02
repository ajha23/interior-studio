/**
 * Workshop Nesting Export Dropdown Actions
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/features/manufacturing/
 */

import { useState } from 'react';
import { Download, FileCode, Printer, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportSheetToDxf } from '@/engine/production/nesting/dxfExporter';
import { generateWorkshopHtmlReport } from '@/engine/production/nesting/workshopReport';
import type { NestedSheet, NestingResult } from '@/engine/production/nesting/types';

interface NestingExportDropdownProps {
  sheet?: NestedSheet;
  result: NestingResult;
  projectName?: string;
  className?: string;
}

export function NestingExportDropdown({
  sheet,
  result,
  projectName = 'Interior Studio Project',
  className,
}: NestingExportDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleDownloadDxf = () => {
    if (!sheet) return;
    const dxfString = exportSheetToDxf(sheet);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sheet_${sheet.sheetIndex}_${sheet.material.replace(/\s+/g, '_')}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const handlePrintReport = () => {
    const reportHtml = generateWorkshopHtmlReport(result, projectName);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
    setOpen(false);
  };

  return (
    <div className={`relative inline-block text-left ${className || ''}`}>
      <Button
        size="sm"
        variant="default"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs"
        aria-expanded={open}
      >
        <Download className="size-3.5" />
        <span>Export Layouts</span>
        <ChevronDown className="size-3 opacity-70" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border bg-card p-1 shadow-md text-xs">
            <button
              type="button"
              onClick={handleDownloadDxf}
              disabled={!sheet}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent disabled:opacity-50"
            >
              <FileCode className="size-3.5 text-blue-500" />
              <div>
                <div className="font-medium text-foreground">AutoCAD DXF (.dxf)</div>
                <div className="text-[10px] text-muted-foreground">Active Sheet CAM Contours</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handlePrintReport}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
            >
              <Printer className="size-3.5 text-emerald-500" />
              <div>
                <div className="font-medium text-foreground">Print Workshop Package</div>
                <div className="text-[10px] text-muted-foreground">Multi-Page PDF & Cut Sequence</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
