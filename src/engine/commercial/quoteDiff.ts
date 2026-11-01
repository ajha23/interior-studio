/**
 * Quote Revision Diffing & Option Pricing Engine.
 * Enables client studios to track line-item additions, removals, and price deltas between revisions.
 *
 * Rules:
 * - Pure framework-free TypeScript. Zero React, Three.js, Zustand, or DOM.
 * - Deterministic integer paise arithmetic.
 */

import type { CommercialQuotation, QuotationLineItem } from './gst';

export interface ModifiedQuoteItem {
  id: string;
  description: string;
  oldQuantity: number;
  newQuantity: number;
  oldUnitRatePaise: number;
  newUnitRatePaise: number;
  oldTotalPaise: number;
  newTotalPaise: number;
  deltaPaise: number;
}

export interface QuoteDiffResult {
  fromRevision: string;
  toRevision: string;
  addedItems: QuotationLineItem[];
  removedItems: QuotationLineItem[];
  modifiedItems: ModifiedQuoteItem[];
  unchangedItems: QuotationLineItem[];
  subtotalDeltaPaise: number;
  taxDeltaPaise: number;
  grandTotalDeltaPaise: number;
  formatted: {
    subtotalDelta: string;
    taxDelta: string;
    grandTotalDelta: string;
  };
}

function formatPaiseDelta(paise: number): string {
  const sign = paise > 0 ? '+' : paise < 0 ? '-' : '';
  const absRupees = Math.abs(paise) / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(absRupees);

  return `${sign}${formatted}`;
}

function calculateItemTotal(item: QuotationLineItem): number {
  const raw = Math.round(item.quantity * item.unitRatePaise);
  const discount = item.discountPaise || 0;
  return Math.max(0, raw - discount);
}

/**
 * Computes deterministic difference between two commercial quotations.
 */
export function diffQuotes(
  quoteA: CommercialQuotation,
  quoteB: CommercialQuotation
): QuoteDiffResult {
  const mapA = new Map<string, QuotationLineItem>();
  for (const item of quoteA.items) {
    mapA.set(item.id, item);
  }

  const mapB = new Map<string, QuotationLineItem>();
  for (const item of quoteB.items) {
    mapB.set(item.id, item);
  }

  const addedItems: QuotationLineItem[] = [];
  const removedItems: QuotationLineItem[] = [];
  const modifiedItems: ModifiedQuoteItem[] = [];
  const unchangedItems: QuotationLineItem[] = [];

  // Check items in B
  for (const [id, itemB] of mapB.entries()) {
    const itemA = mapA.get(id);
    if (!itemA) {
      addedItems.push(itemB);
    } else {
      const oldTot = calculateItemTotal(itemA);
      const newTot = calculateItemTotal(itemB);
      if (
        itemA.quantity !== itemB.quantity ||
        itemA.unitRatePaise !== itemB.unitRatePaise ||
        (itemA.discountPaise || 0) !== (itemB.discountPaise || 0)
      ) {
        modifiedItems.push({
          id,
          description: itemB.description,
          oldQuantity: itemA.quantity,
          newQuantity: itemB.quantity,
          oldUnitRatePaise: itemA.unitRatePaise,
          newUnitRatePaise: itemB.unitRatePaise,
          oldTotalPaise: oldTot,
          newTotalPaise: newTot,
          deltaPaise: newTot - oldTot,
        });
      } else {
        unchangedItems.push(itemB);
      }
    }
  }

  // Check removed items (in A but not in B)
  for (const [id, itemA] of mapA.entries()) {
    if (!mapB.has(id)) {
      removedItems.push(itemA);
    }
  }

  const subtotalDeltaPaise = quoteB.totalTaxablePaise - quoteA.totalTaxablePaise;
  const taxDeltaPaise = quoteB.totalTaxPaise - quoteA.totalTaxPaise;
  const grandTotalDeltaPaise = quoteB.grandTotalPaise - quoteA.grandTotalPaise;

  return {
    fromRevision: quoteA.quotationNumber,
    toRevision: quoteB.quotationNumber,
    addedItems,
    removedItems,
    modifiedItems,
    unchangedItems,
    subtotalDeltaPaise,
    taxDeltaPaise,
    grandTotalDeltaPaise,
    formatted: {
      subtotalDelta: formatPaiseDelta(subtotalDeltaPaise),
      taxDelta: formatPaiseDelta(taxDeltaPaise),
      grandTotalDelta: formatPaiseDelta(grandTotalDeltaPaise),
    },
  };
}

/**
 * Calculates live ₹ cost delta between two shutter finish options (e.g. Laminate vs Acrylic).
 */
export function calculateFinishOptionDelta(
  shutterAreaSqM: number,
  finishARatePaisePerSqM: number,
  finishBRatePaisePerSqM: number
): { deltaPaise: number; formattedDelta: string } {
  const costA = Math.round(shutterAreaSqM * finishARatePaisePerSqM);
  const costB = Math.round(shutterAreaSqM * finishBRatePaisePerSqM);
  const deltaPaise = costB - costA;

  return {
    deltaPaise,
    formattedDelta: formatPaiseDelta(deltaPaise),
  };
}

