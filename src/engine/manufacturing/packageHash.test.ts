import { describe, it, expect } from 'vitest';
import { canonicalStringify, computeCanonicalSha256 } from './packageHash';

describe('Canonical JSON & SHA-256 Hashing (ARC-02, ARC-03)', () => {
  it('canonicalStringify sorts keys alphabetically regardless of insertion order', () => {
    const a = { z: 1, a: 2, m: { y: 10, b: 20 } };
    const b = { a: 2, m: { b: 20, y: 10 }, z: 1 };

    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalStringify(a)).toBe('{"a":2,"m":{"b":20,"y":10},"z":1}');
  });

  it('computes identical SHA-256 hash for identical data structures', () => {
    const pkg1 = {
      packageId: 'pkg_123',
      parts: [{ id: 'p1', length: 720, width: 560 }],
      rulePackVersion: 1,
    };
    const pkg2 = {
      rulePackVersion: 1,
      packageId: 'pkg_123',
      parts: [{ id: 'p1', length: 720, width: 560 }],
    };

    const hash1 = computeCanonicalSha256(pkg1);
    const hash2 = computeCanonicalSha256(pkg2);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different SHA-256 digest when any value changes', () => {
    const pkgOriginal = {
      packageId: 'pkg_123',
      parts: [{ id: 'p1', length: 720, width: 560 }],
    };
    const pkgModified = {
      packageId: 'pkg_123',
      parts: [{ id: 'p1', length: 721, width: 560 }], // 1mm diff
    };

    const hashOriginal = computeCanonicalSha256(pkgOriginal);
    const hashModified = computeCanonicalSha256(pkgModified);

    expect(hashOriginal).not.toBe(hashModified);
  });
});

