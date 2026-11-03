/**
 * Quadtree 2D Spatial Partitioning Index for sub-millisecond hit-testing,
 * point queries, and bounding box overlap detection.
 * All spatial coordinates are integer millimetres.
 */

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialItem<T> {
  id: string;
  bounds: BoundingBox2D;
  data: T;
}

function intersects(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function containsPoint(box: BoundingBox2D, x: number, y: number): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

export class Quadtree<T> {
  private readonly bounds: BoundingBox2D;
  private readonly maxItems: number;
  private readonly maxDepth: number;
  private readonly depth: number;
  private items: SpatialItem<T>[] = [];
  private children: Quadtree<T>[] | null = null;

  constructor(bounds: BoundingBox2D, maxItems = 8, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
    this.depth = depth;
  }

  /** Subdivides the current node into 4 quadrant children (NW, NE, SW, SE). */
  private subdivide(): void {
    const midX = Math.floor((this.bounds.minX + this.bounds.maxX) / 2);
    const midY = Math.floor((this.bounds.minY + this.bounds.maxY) / 2);

    this.children = [
      // NW
      new Quadtree<T>(
        { minX: this.bounds.minX, minY: this.bounds.minY, maxX: midX, maxY: midY },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ),
      // NE
      new Quadtree<T>(
        { minX: midX, minY: this.bounds.minY, maxX: this.bounds.maxX, maxY: midY },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ),
      // SW
      new Quadtree<T>(
        { minX: this.bounds.minX, minY: midY, maxX: midX, maxY: this.bounds.maxY },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ),
      // SE
      new Quadtree<T>(
        { minX: midX, minY: midY, maxX: this.bounds.maxX, maxY: this.bounds.maxY },
        this.maxItems,
        this.maxDepth,
        this.depth + 1
      ),
    ];
  }

  /**
   * Inserts a spatial item into the tree.
   * If the item does not intersect this node's bounds, returns false.
   */
  public insert(item: SpatialItem<T>): boolean {
    if (!intersects(this.bounds, item.bounds)) {
      return false;
    }

    if (this.children === null) {
      if (this.items.length < this.maxItems || this.depth >= this.maxDepth) {
        this.items.push(item);
        return true;
      }
      this.subdivide();
      const existingItems = this.items;
      this.items = [];
      for (const existing of existingItems) {
        this.insertToChildrenOrSelf(existing);
      }
    }

    this.insertToChildrenOrSelf(item);
    return true;
  }

  private insertToChildrenOrSelf(item: SpatialItem<T>): void {
    if (!this.children) {
      this.items.push(item);
      return;
    }

    let insertedIntoChild = false;
    for (const child of this.children) {
      if (intersects(child.bounds, item.bounds)) {
        child.insert(item);
        insertedIntoChild = true;
      }
    }

    if (!insertedIntoChild) {
      this.items.push(item);
    }
  }

  /**
   * Queries all unique items containing the specified (x, y) point.
   */
  public queryPoint(x: number, y: number): T[] {
    const results = new Map<string, T>();
    this.queryPointInternal(x, y, results);
    return Array.from(results.values());
  }

  private queryPointInternal(x: number, y: number, results: Map<string, T>): void {
    if (!containsPoint(this.bounds, x, y)) {
      return;
    }

    for (const item of this.items) {
      if (containsPoint(item.bounds, x, y)) {
        results.set(item.id, item.data);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.queryPointInternal(x, y, results);
      }
    }
  }

  /**
   * Queries all unique items that intersect the specified 2D bounding box.
   */
  public queryBounds(box: BoundingBox2D): T[] {
    const results = new Map<string, T>();
    this.queryBoundsInternal(box, results);
    return Array.from(results.values());
  }

  private queryBoundsInternal(box: BoundingBox2D, results: Map<string, T>): void {
    if (!intersects(this.bounds, box)) {
      return;
    }

    for (const item of this.items) {
      if (intersects(item.bounds, box)) {
        results.set(item.id, item.data);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.queryBoundsInternal(box, results);
      }
    }
  }

  /**
   * Removes an item by its id from this node and all descendants.
   */
  public remove(id: string): boolean {
    const initialLen = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    let removed = this.items.length < initialLen;

    if (this.children) {
      for (const child of this.children) {
        if (child.remove(id)) {
          removed = true;
        }
      }
    }
    return removed;
  }

  /**
   * Clears all items and resets child nodes.
   */
  public clear(): void {
    this.items = [];
    this.children = null;
  }

  /**
   * Returns total count of unique items indexed in the tree.
   */
  public size(): number {
    const all = new Set<string>();
    this.collectIds(all);
    return all.size;
  }

  private collectIds(ids: Set<string>): void {
    for (const item of this.items) {
      ids.add(item.id);
    }
    if (this.children) {
      for (const child of this.children) {
        child.collectIds(ids);
      }
    }
  }
}

