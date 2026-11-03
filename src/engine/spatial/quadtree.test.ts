import { describe, expect, it } from 'vitest';
import { Quadtree, type BoundingBox2D, type SpatialItem } from './quadtree';

describe('Quadtree 2D Spatial Partitioning Index (Task 2)', () => {
  const roomBounds: BoundingBox2D = {
    minX: 0,
    minY: 0,
    maxX: 10000, // 10m
    maxY: 10000, // 10m
  };

  it('inserts and queries items by point containment', () => {
    const tree = new Quadtree<{ name: string }>(roomBounds);

    const cabinetA: SpatialItem<{ name: string }> = {
      id: 'cab-1',
      bounds: { minX: 100, minY: 100, maxX: 700, maxY: 700 },
      data: { name: 'Base Unit 600' },
    };

    const cabinetB: SpatialItem<{ name: string }> = {
      id: 'cab-2',
      bounds: { minX: 800, minY: 100, maxX: 1400, maxY: 700 },
      data: { name: 'Drawer Unit 600' },
    };

    tree.insert(cabinetA);
    tree.insert(cabinetB);

    expect(tree.size()).toBe(2);

    // Hit test within cabinetA
    const hitA = tree.queryPoint(300, 300);
    expect(hitA).toHaveLength(1);
    expect(hitA[0]!.name).toBe('Base Unit 600');

    // Hit test within cabinetB
    const hitB = tree.queryPoint(1000, 400);
    expect(hitB).toHaveLength(1);
    expect(hitB[0]!.name).toBe('Drawer Unit 600');

    // Hit test in empty space
    const emptyHit = tree.queryPoint(2000, 2000);
    expect(emptyHit).toHaveLength(0);
  });

  it('queries items intersecting a bounding box marquee', () => {
    const tree = new Quadtree<string>(roomBounds);

    tree.insert({
      id: 'item-1',
      bounds: { minX: 100, minY: 100, maxX: 500, maxY: 500 },
      data: 'Item 1',
    });
    tree.insert({
      id: 'item-2',
      bounds: { minX: 400, minY: 400, maxX: 900, maxY: 900 },
      data: 'Item 2',
    });
    tree.insert({
      id: 'item-3',
      bounds: { minX: 5000, minY: 5000, maxX: 6000, maxY: 6000 },
      data: 'Item 3 (Far Away)',
    });

    // Marquee query covering the 0..600 area
    const results = tree.queryBounds({ minX: 0, minY: 0, maxX: 600, maxY: 600 });
    expect(results).toHaveLength(2);
    expect(results).toContain('Item 1');
    expect(results).toContain('Item 2');
    expect(results).not.toContain('Item 3 (Far Away)');
  });

  it('supports removal and clearing of items', () => {
    const tree = new Quadtree<number>(roomBounds);

    tree.insert({
      id: 'p1',
      bounds: { minX: 200, minY: 200, maxX: 400, maxY: 400 },
      data: 42,
    });
    expect(tree.size()).toBe(1);

    const removed = tree.remove('p1');
    expect(removed).toBe(true);
    expect(tree.size()).toBe(0);
    expect(tree.queryPoint(300, 300)).toHaveLength(0);

    // Re-insert and clear
    tree.insert({
      id: 'p2',
      bounds: { minX: 200, minY: 200, maxX: 400, maxY: 400 },
      data: 84,
    });
    tree.clear();
    expect(tree.size()).toBe(0);
  });

  it('achieves sub-millisecond point query latency on 500+ items', () => {
    const tree = new Quadtree<{ id: string; x: number; y: number }>(roomBounds);

    const ITEM_COUNT = 500;
    // Distribute 500 items across a 10000x10000 mm space
    for (let i = 0; i < ITEM_COUNT; i++) {
      const x = (i % 25) * 380 + 50;
      const y = Math.floor(i / 25) * 450 + 50;
      tree.insert({
        id: `entity-${i}`,
        bounds: { minX: x, minY: y, maxX: x + 350, maxY: y + 400 },
        data: { id: `entity-${i}`, x, y },
      });
    }

    expect(tree.size()).toBe(ITEM_COUNT);

    // Benchmark 100 hit queries
    const QUERY_COUNT = 100;
    const start = performance.now();

    for (let q = 0; q < QUERY_COUNT; q++) {
      const qx = (q * 97) % 9500;
      const qy = (q * 113) % 9500;
      tree.queryPoint(qx, qy);
    }

    const elapsedMs = performance.now() - start;
    const avgLatencyMs = elapsedMs / QUERY_COUNT;

    // Must be well below 1.0 ms per query (typically 0.005 - 0.05 ms)
    expect(avgLatencyMs).toBeLessThan(1.0);
  });
});
