/**
 * Indian GST Commercial & Tax Engine.
 * Compliant with GST Act rules for Modular Furniture (HSN 9403) and Design/Installation Services (SAC 9954).
 *
 * Rules:
 * - Deterministic integer paise (1 INR = 100 paise) to avoid floating-point inaccuracies.
 * - Clear HSN/SAC separation on quotation invoices.
 */

export type TaxType = 'INTRA_STATE' | 'INTER_STATE';

export interface QuotationLineItem {
  id: string;
  description: string;
  code: string; // HSN or SAC code
  type: 'goods' | 'services';
  quantity: number;
  unit: string; // 'sqm', 'mtr', 'nos', 'lump_sum'
  unitRatePaise: number; // e.g. 150000 paise = ₹1,500.00
  discountPaise?: number;
}

export interface TaxBreakdown {
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
}

export interface CommercialQuotation {
  quotationNumber: string;
  taxType: TaxType;
  currency: string;
  rateCardId?: string;
  rateCardVersion?: string;
  items: QuotationLineItem[];
  hsnSummary: Record<string, TaxBreakdown>;
  totalTaxablePaise: number;
  totalCgstPaise: number;
  totalSgstPaise: number;
  totalIgstPaise: number;
  totalTaxPaise: number;
  grandTotalPaise: number;
  // Rupee formatted helpers
  formatted: {
    totalTaxable: string;
    totalTax: string;
    grandTotal: string;
  };
}

/**
 * Standard GST tax rates in percentage.
 */
export const GST_RATES = {
  HSN_9403: 18, // Wooden & Modular Furniture
  SAC_9954: 18, // Interior decoration & Installation Services
} as const;

export function formatInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Calculates deterministic tax breakdown for quotation line items.
 */
export function calculateQuotation(
  quotationNumber: string,
  items: QuotationLineItem[],
  taxType: TaxType = 'INTRA_STATE',
  rateCardInfo?: { id: string; version: string }
): CommercialQuotation {
  const hsnSummary: Record<string, TaxBreakdown> = {};
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  for (const item of items) {
    const rawTotal = Math.round(item.quantity * item.unitRatePaise);
    const lineDiscount = item.discountPaise || 0;
    const taxableLine = Math.max(0, rawTotal - lineDiscount);

    totalTaxable += taxableLine;

    // Rate determination
    const rate = item.code.startsWith('9403')
      ? GST_RATES.HSN_9403
      : item.code.startsWith('9954')
      ? GST_RATES.SAC_9954
      : 18;

    let lineCgst = 0;
    let lineSgst = 0;
    let lineIgst = 0;

    if (taxType === 'INTRA_STATE') {
      const halfRate = rate / 2; // e.g. 9%
      lineCgst = Math.round((taxableLine * halfRate) / 100);
      lineSgst = Math.round((taxableLine * halfRate) / 100);
    } else {
      lineIgst = Math.round((taxableLine * rate) / 100);
    }

    const lineTax = lineCgst + lineSgst + lineIgst;
    totalCgst += lineCgst;
    totalSgst += lineSgst;
    totalIgst += lineIgst;

    // Aggregate by HSN / SAC code
    const existing = hsnSummary[item.code] || {
      taxableAmountPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalTaxPaise: 0,
    };

    existing.taxableAmountPaise += taxableLine;
    existing.cgstPaise += lineCgst;
    existing.sgstPaise += lineSgst;
    existing.igstPaise += lineIgst;
    existing.totalTaxPaise += lineTax;

    hsnSummary[item.code] = existing;
  }

  const totalTax = totalCgst + totalSgst + totalIgst;
  const grandTotal = totalTaxable + totalTax;

  return {
    quotationNumber,
    taxType,
    currency: 'INR',
    rateCardId: rateCardInfo?.id,
    rateCardVersion: rateCardInfo?.version,
    items,
    hsnSummary,
    totalTaxablePaise: totalTaxable,
    totalCgstPaise: totalCgst,
    totalSgstPaise: totalSgst,
    totalIgstPaise: totalIgst,
    totalTaxPaise: totalTax,
    grandTotalPaise: grandTotal,
    formatted: {
      totalTaxable: formatInr(totalTaxable),
      totalTax: formatInr(totalTax),
      grandTotal: formatInr(grandTotal),
    },
  };
}

