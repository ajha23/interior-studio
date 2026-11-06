import { describe, expect, it } from 'vitest';
import {
  PRODUCT_CATALOG,
  CatalogItemSchema,
  getCatalogCategories,
  getCatalogItemById,
  getCatalogItemsByCategory,
  getCatalogItemsForCabinet,
  searchCatalogItems,
} from './index';

describe('Product Catalog & Library', () => {
  it('loads and validates all 37 product items with strict schema compliance', () => {
    expect(PRODUCT_CATALOG.length).toBe(37);
    for (const item of PRODUCT_CATALOG) {
      const parsed = CatalogItemSchema.parse(item);
      expect(parsed.asset_id).toBeDefined();
      expect(parsed.item_name.length).toBeGreaterThan(0);
      expect(parsed.dimensions_mm.width).toBeGreaterThan(0);
      expect(parsed.dimensions_mm.height).toBeGreaterThan(0);
      expect(parsed.dimensions_mm.depth).toBeGreaterThan(0);
    }
  });

  it('correctly aggregates distinct product categories with non-zero counts', () => {
    const categories = getCatalogCategories();
    expect(categories.length).toBeGreaterThanOrEqual(7);

    const waste = categories.find((c) => c.sub === 'Cabinet Waste Systems');
    expect(waste).toBeDefined();
    expect(waste!.count).toBe(10);

    const inserts = categories.find((c) => c.sub === 'Drawer Inserts & Organizers');
    expect(inserts).toBeDefined();
    expect(inserts!.count).toBe(9);

    const lifters = categories.find((c) => c.sub === 'Cabinet Flap & Lifter Hardware');
    expect(lifters).toBeDefined();
    expect(lifters!.count).toBe(8);

    const drawers = categories.find((c) => c.sub === 'Cabinet Drawers & Pull-Outs');
    expect(drawers).toBeDefined();
    expect(drawers!.count).toBe(3);

    const electronic = categories.find((c) => c.sub === 'Electronic Cabinet Hardware');
    expect(electronic).toBeDefined();
    expect(electronic!.count).toBe(2);
  });

  it('retrieves items by asset_id', () => {
    const cs450 = getCatalogItemById('HL_CS_450');
    expect(cs450).toBeDefined();
    expect(cs450?.item_name).toContain('Hailo Cargo Soft Short 450');
    expect(cs450?.dimensions_mm.width).toBe(418);
    expect(cs450?.vendor).toBe('Hailo');

    const freefold = getCatalogItemById('KB_FL_FREEFOLD');
    expect(freefold).toBeDefined();
    expect(freefold?.item_name).toContain('FREEfold Bi-Fold Wall Cabinet Lifter');
    expect(freefold?.vendor).toBe('Kesseböhmer');
  });

  it('filters items by category and sub-category', () => {
    const wasteItems = getCatalogItemsByCategory('Fixtures', 'Cabinet Waste Systems');
    expect(wasteItems.length).toBe(10);
    expect(wasteItems.every((item) => item.category.sub === 'Cabinet Waste Systems')).toBe(true);

    const lifterItems = getCatalogItemsByCategory('Fixtures', 'Cabinet Flap & Lifter Hardware');
    expect(lifterItems.length).toBe(8);
  });

  it('performs flexible multi-attribute searches across name, vendor, and tags', () => {
    const hailoResults = searchCatalogItems('Hailo');
    expect(hailoResults.length).toBe(15);

    const kesseResults = searchCatalogItems('Kesseböhmer');
    expect(kesseResults.length).toBe(17);

    const canisterResults = searchCatalogItems('canister');
    expect(canisterResults.length).toBe(5);

    const recyclingResults = searchCatalogItems('recycling');
    expect(recyclingResults.length).toBeGreaterThan(0);
  });

  it('retrieves catalog items matching cabinet constraints', () => {
    const base450 = getCatalogItemsForCabinet('base', 450);
    expect(base450.some((item) => item.asset_id === 'HL_CS_450')).toBe(true);
    expect(base450.some((item) => item.asset_id === 'HL_EC_450')).toBe(true);

    const wallLifters = getCatalogItemsForCabinet('wall');
    expect(wallLifters.some((item) => item.asset_id === 'KB_FL_FREEFOLD')).toBe(true);
    expect(wallLifters.some((item) => item.asset_id === 'KB_FL_MAXI')).toBe(true);
  });
});

