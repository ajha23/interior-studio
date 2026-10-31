/**
 * Design revisions for traceability. A revision id is a hash of the whole project content, so the
 * same design always has the same id (also after saving and reopening) and any change gives a new
 * one. Every deliverable records the revision it was made from; a different current id means stale.
 */
import type { KitchenProject } from '@/domain';

/** JSON with object keys sorted, so equal content gives equal text regardless of key order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 10).padStart(10, '0');
}

/** The design revision id, e.g. "r-3k9x0a1b2c". */
export function designRevision(project: KitchenProject): string {
  return `r-${fnv1a(stableJson(project))}`;
}

/** Short form for title blocks. */
export const shortRevision = (rev: string) => rev.slice(0, 8);
