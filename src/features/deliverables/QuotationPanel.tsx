import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Percent, Receipt } from 'lucide-react';
import { type KitchenProject } from '@/domain';
import { SEED_RULE_PACK_V1 } from '@/domain/manufacturing/rulePack';
import { calculateQuotation, type QuotationLineItem, type TaxType } from '@/engine/commercial/gst';
import { explodeScene } from '@/engine/manufacturing/explode';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { downloadFile, useDeliverablesStore } from '@/state/deliverablesStore';

interface QuotationPanelProps {
  project: KitchenProject;
  revision: string;
}

export function QuotationPanel({ project, revision }: QuotationPanelProps) {
  const [taxType, setTaxType] = useState<TaxType>('INTRA_STATE');
  const generate = useDeliverablesStore((s) => s.generate);

  // Compute exploded manufacturing summary for bottom-up rate application
  const pkg = useMemo(() => {
    return explodeScene(project.cabinets, SEED_RULE_PACK_V1, project.name);
  }, [project.cabinets, project.name]);

  // Build quotation line items from exploded manufacturing metrics
  const quote = useMemo(() => {
    const items: QuotationLineItem[] = [];

    // 1. Carcase Panels (HSN 9403.40.00)
    if (pkg.summary.totalCarcaseAreaSqM > 0) {
      items.push({
        id: 'item_carcase',
        description: '18mm BWP Marine Ply Carcase (Factory Pre-drilled 32mm System)',
        code: '9403.40.00',
        type: 'goods',
        quantity: Math.max(1, Math.round(pkg.summary.totalCarcaseAreaSqM * 10) / 10),
        unit: 'sqm',
        unitRatePaise: 240000, // ₹2,400 per sqm
      });
    }

    // 2. Shutters / Fronts (HSN 9403.40.00)
    if (pkg.summary.totalShutterAreaSqM > 0) {
      items.push({
        id: 'item_shutters',
        description: '18mm High-Gloss Acrylic Shutters with 2.0mm ABS Edge Banding',
        code: '9403.40.00',
        type: 'goods',
        quantity: Math.max(1, Math.round(pkg.summary.totalShutterAreaSqM * 10) / 10),
        unit: 'sqm',
        unitRatePaise: 360000, // ₹3,600 per sqm
      });
    }

    // 3. Hardware & Fasteners (HSN 9403.90.00)
    const hingeCount = pkg.hardware
      .filter((h) => h.category === 'hinge')
      .reduce((sum, h) => sum + h.quantity, 0);

    if (hingeCount > 0) {
      items.push({
        id: 'item_hinges',
        description: 'German Soft-Close 110° Concealed Hinges with Mounting Plates',
        code: '9403.90.00',
        type: 'goods',
        quantity: hingeCount,
        unit: 'nos',
        unitRatePaise: 45000, // ₹450 per hinge pair
      });
    }

    const legCount = pkg.hardware
      .filter((h) => h.category === 'leg')
      .reduce((sum, h) => sum + h.quantity, 0);

    if (legCount > 0) {
      items.push({
        id: 'item_legs',
        description: '100mm Heavy-Duty Adjustable PVC Legs with Plinth Clips',
        code: '9403.90.00',
        type: 'goods',
        quantity: legCount,
        unit: 'nos',
        unitRatePaise: 12000, // ₹120 per leg
      });
    }

    // 4. On-site Installation & Precision Alignment (SAC 9954.79)
    items.push({
      id: 'item_services_installation',
      description: 'Factory Trained Installation, Laser Leveling & Precision Alignment',
      code: '9954.79',
      type: 'services',
      quantity: Math.max(1, project.cabinets.length),
      unit: 'nos',
      unitRatePaise: 120000, // ₹1,200 per cabinet install
    });

    const quoteNumber = `QT-${project.id.slice(0, 6).toUpperCase()}-${revision.slice(0, 4).toUpperCase()}`;
    return calculateQuotation(quoteNumber, items, taxType);
  }, [pkg, project.id, project.cabinets.length, revision, taxType]);

  const handleExportQuotation = () => {
    const file = generate('quotation-csv');
    if (file) downloadFile(file);
  };

  const handleExportOptiCut = () => {
    const file = generate('opticut-csv');
    if (file) downloadFile(file);
  };

  return (
    <div className="space-y-6" data-testid="quotation-panel">
      {/* Top Banner and Tax Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            <h3 className="font-semibold text-foreground">Commercial Quotation & GST Breakdown</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quotation #{quote.quotationNumber} · Deterministic 18% GST split per Indian statutory rules
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="tax-mode-select" className="text-muted-foreground font-medium">Tax Mode:</label>
            <Select
              id="tax-mode-select"
              aria-label="Tax Mode"
              data-testid="tax-mode-select"
              value={taxType}
              onChange={(e) => setTaxType(e.target.value as TaxType)}
              className="h-8 w-44 text-xs"
            >
              <option value="INTRA_STATE">Intra-State (CGST 9% + SGST 9%)</option>
              <option value="INTER_STATE">Inter-State (IGST 18%)</option>
            </Select>
          </div>

          <Button size="xs" variant="outline" onClick={handleExportQuotation}>
            <FileSpreadsheet className="size-3.5" /> Export Quotation CSV
          </Button>

          <Button size="xs" onClick={handleExportOptiCut} className="bg-primary text-primary-foreground">
            <Download className="size-3.5" /> OptiCut 16-Col CSV
          </Button>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bill of Materials & Services Line Items
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/20 text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">HSN / SAC</th>
                <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                <th className="px-3 py-2.5 font-medium text-right">Rate (₹)</th>
                <th className="px-3 py-2.5 font-medium text-right">Taxable (₹)</th>
                {taxType === 'INTRA_STATE' ? (
                  <>
                    <th className="px-3 py-2.5 font-medium text-right">CGST (9%)</th>
                    <th className="px-3 py-2.5 font-medium text-right">SGST (9%)</th>
                  </>
                ) : (
                  <th className="px-3 py-2.5 font-medium text-right">IGST (18%)</th>
                )}
                <th className="px-4 py-2.5 font-medium text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quote.items.map((item) => {
                const taxable = Math.round(item.quantity * item.unitRatePaise) / 100;
                const tax = Math.round(taxable * 0.18 * 100) / 100;
                const cgst = Math.round(taxable * 0.09 * 100) / 100;
                const sgst = cgst;
                const total = taxable + tax;

                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.description}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{item.code}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      ₹{(item.unitRatePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      ₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    {taxType === 'INTRA_STATE' ? (
                      <>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">
                          ₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">
                          ₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">
                        ₹{tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                      ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Statutory HSN / SAC Split */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Percent className="size-4 text-muted-foreground" />
            <h5 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Statutory GST Tax Summary
            </h5>
          </div>

          <div className="space-y-2">
            {Object.entries(quote.hsnSummary).map(([code, breakdown]) => (
              <div key={code} className="flex items-center justify-between text-xs border-b border-dashed pb-1.5">
                <div>
                  <span className="font-mono font-medium">{code}</span>
                  <span className="ml-2 text-muted-foreground">
                    {code.startsWith('9403') ? 'Wooden Kitchen Furniture (18%)' : 'Interior Assembly Services (18%)'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="tabular-nums font-semibold">
                    ₹{(breakdown.totalTaxPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    on ₹{(breakdown.taxableAmountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} taxable
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commercial Grand Total */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h5 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Commercial Total
            </h5>
            <span className="text-[11px] text-muted-foreground">Currency: INR (₹)</span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Taxable Amount</span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {quote.formatted.totalTaxable}
              </span>
            </div>

            {taxType === 'INTRA_STATE' ? (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Central GST (CGST 9%)</span>
                  <span className="font-mono tabular-nums">
                    ₹{(quote.totalCgstPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>State GST (SGST 9%)</span>
                  <span className="font-mono tabular-nums">
                    ₹{(quote.totalSgstPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-muted-foreground">
                <span>Integrated GST (IGST 18%)</span>
                <span className="font-mono tabular-nums">
                  ₹{(quote.totalIgstPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex justify-between border-t pt-2 text-sm font-semibold text-primary">
              <span>Grand Total (incl. GST)</span>
              <span className="font-mono text-base tabular-nums">
                {quote.formatted.grandTotal}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

