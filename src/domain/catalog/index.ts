import { CATALOG_ITEMS } from './items';
import { CatalogItemSchema } from './schema';
import type { CatalogItem } from './types';

export * from './schema';
export * from './types';
export * from './items';

/**
 * Validated in-memory product catalog.
 */
export const PRODUCT_CATALOG: readonly CatalogItem[] = CATALOG_ITEMS.map((item) =>
  CatalogItemSchema.parse(item)
);

/**
 * Look up a product item by its unique asset ID.
 */
export function getCatalogItemById(assetId: string): CatalogItem | undefined {
  return PRODUCT_CATALOG.find((item) => item.asset_id === assetId);
}

/**
 * Filter catalog items by primary and optional sub-category.
 */
export function getCatalogItemsByCategory(
  primaryCategory: string,
  subCategory?: string
): CatalogItem[] {
  return PRODUCT_CATALOG.filter((item) => {
    if (item.category.primary.toLowerCase() !== primaryCategory.toLowerCase()) {
      return false;
    }
    if (subCategory && item.category.sub.toLowerCase() !== subCategory.toLowerCase()) {
      return false;
    }
    return true;
  });
}

/**
 * Search product catalog items by name, category, vendor, or tags.
 */
export function searchCatalogItems(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PRODUCT_CATALOG];

  return PRODUCT_CATALOG.filter((item) => {
    return (
      item.item_name.toLowerCase().includes(q) ||
      item.asset_id.toLowerCase().includes(q) ||
      item.category.primary.toLowerCase().includes(q) ||
      item.category.sub.toLowerCase().includes(q) ||
      (item.vendor && item.vendor.toLowerCase().includes(q)) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

/**
 * Get catalog items suitable for a specific cabinet type and optional width.
 */
export function getCatalogItemsForCabinet(
  cabinetType: string,
  cabinetWidth?: number
): CatalogItem[] {
  return PRODUCT_CATALOG.filter((item) => {
    if (item.target_cabinet_type && item.target_cabinet_type !== cabinetType) {
      return false;
    }
    if (cabinetWidth && item.target_cabinet_width_mm && item.target_cabinet_width_mm !== cabinetWidth) {
      return false;
    }
    return true;
  });
}

export interface CatalogCategorySummary {
  primary: string;
  sub: string;
  count: number;
}

/**
 * Returns distinct category hierarchies and product counts.
 */
export function getCatalogCategories(): CatalogCategorySummary[] {
  const map = new Map<string, CatalogCategorySummary>();
  for (const item of PRODUCT_CATALOG) {
    const key = `${item.category.primary}::${item.category.sub}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        primary: item.category.primary,
        sub: item.category.sub,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}
