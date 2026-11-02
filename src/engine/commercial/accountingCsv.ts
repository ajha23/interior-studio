/**
 * Accounting CSV Export for Indian ERPs (Tally Prime, Zoho Books, Busy).
 * Formats statutory commercial quotations into accounting sales vouchers with itemized HSN/SAC splits.
 *
 * Rules:
 * - Framework-free TypeScript. Pure CSV text generator.
 * - Integer paise conversion to exact 2-decimal rupee strings.
 */

import type { CommercialQuotation } from './gst';

export interface AccountingVoucherMeta {
  voucherNumber: string;
  voucherDate?: string; // DD/MM/YYYY or ISO
  customerName: string;
  customerGstin?: string | null;
  placeOfSupply?: string; // e.g. "29-Karnataka"
  studioGstin?: string;
}

function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

function escapeCsv(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Generates an accounting CSV compatible with Tally Prime and Zoho Books sales voucher import.
 */
export function generateAccountingCsv(
  quote: CommercialQuotation,
  meta: AccountingVoucherMeta
): string {
  const dateStr = meta.voucherDate || new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
  const vNum = meta.voucherNumber || quote.quotationNumber;
  const custName = meta.customerName || 'Cash Customer';
  const custGstin = meta.customerGstin || 'URP'; // Unregistered Person
  const pos = meta.placeOfSupply || '29-Karnataka';

  const headers = [
    'Voucher Date',
    'Voucher Type',
    'Voucher Number',
    'Customer Name',
    'Customer GSTIN',
    'Place of Supply',
    'Supply Type',
    'Item Description',
    'HSN/SAC Code',
    'Quantity',
    'Unit',
    'Unit Rate (INR)',
    'Taxable Value (INR)',
    'GST Rate (%)',
    'CGST Amount (INR)',
    'SGST Amount (INR)',
    'IGST Amount (INR)',
    'Total Amount (INR)',
  ];

  const lines: string[] = [headers.join(',')];

  const isIntraState = quote.taxType === 'INTRA_STATE';

  for (const item of quote.items) {
    const rawTotalPaise = Math.round(item.quantity * item.unitRatePaise);
    const taxablePaise = Math.max(0, rawTotalPaise - (item.discountPaise || 0));
    const rate = 18; // Standard rate for 9403 and 9954

    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;

    if (isIntraState) {
      cgstPaise = Math.round(taxablePaise * 0.09);
      sgstPaise = Math.round(taxablePaise * 0.09);
    } else {
      igstPaise = Math.round(taxablePaise * 0.18);
    }

    const totalPaise = taxablePaise + cgstPaise + sgstPaise + igstPaise;

    const row = [
      escapeCsv(dateStr),
      escapeCsv('Sales Invoice'),
      escapeCsv(vNum),
      escapeCsv(custName),
      escapeCsv(custGstin),
      escapeCsv(pos),
      escapeCsv(item.type === 'goods' ? 'Goods' : 'Services'),
      escapeCsv(item.description),
      escapeCsv(item.code),
      item.quantity.toString(),
      escapeCsv(item.unit),
      paiseToRupees(item.unitRatePaise),
      paiseToRupees(taxablePaise),
      rate.toString(),
      paiseToRupees(cgstPaise),
      paiseToRupees(sgstPaise),
      paiseToRupees(igstPaise),
      paiseToRupees(totalPaise),
    ];

    lines.push(row.join(','));
  }

  // Summary Voucher Total Row
  const totalRow = [
    escapeCsv(dateStr),
    escapeCsv('TOTAL'),
    escapeCsv(vNum),
    escapeCsv(custName),
    escapeCsv(custGstin),
    escapeCsv(pos),
    escapeCsv(''),
    escapeCsv('Consolidated Invoice Total'),
    escapeCsv(''),
    '',
    '',
    '',
    paiseToRupees(quote.totalTaxablePaise),
    '',
    paiseToRupees(quote.totalCgstPaise),
    paiseToRupees(quote.totalSgstPaise),
    paiseToRupees(quote.totalIgstPaise),
    paiseToRupees(quote.grandTotalPaise),
  ];

  lines.push(totalRow.join(','));

  return lines.join('\r\n');
}

