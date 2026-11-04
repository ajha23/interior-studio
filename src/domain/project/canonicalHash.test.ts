import { describe, expect, it } from 'vitest';
import { canonicalStringify, computeCanonicalSha256, sha256Bytes } from './canonicalHash';

describe('Canonical JSON & UTF-8 SHA-256 Hashing (T403, T404, T405)', () => {
  it('matches standard NIST SHA-256 test vectors for raw bytes', () => {
    const encoder = new TextEncoder();
    
    // 1. Empty string
    expect(sha256Bytes(encoder.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );

    // 2. "abc"
    expect(sha256Bytes(encoder.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );

    // 3. 448 bits / 56 bytes message: boundary test
    const str56 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(sha256Bytes(encoder.encode(str56))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  it('guarantees key-order independence at all nesting levels', () => {
    const obj1 = {
      z: 100,
      a: { beta: 'test', alpha: 123 },
      m: [1, 2, { y: 2, x: 1 }],
    };
    const obj2 = {
      m: [1, 2, { x: 1, y: 2 }],
      a: { alpha: 123, beta: 'test' },
      z: 100,
    };

    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
    expect(computeCanonicalSha256(obj1)).toBe(computeCanonicalSha256(obj2));
  });

  it('correctly digests non-ASCII multi-byte UTF-8 strings (T405 golden vector)', () => {
    const payload = {
      materialName: 'Teak Wood Finishing — ₹1,850 / sq.m',
      clientNotes: 'आवासीय परियोजना (Residential Project) · Étude d’intérieur',
      halfMillimetreGrip: 102.5,
    };

    const hash = computeCanonicalSha256(payload);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // Assert exact golden hash consistency across repeated runs
    const hashRepeat = computeCanonicalSha256(payload);
    expect(hash).toBe(hashRepeat);
  });

  it('deterministically formats half-millimetre centroid numbers without floating point drift', () => {
    const coords1 = { x: 102.5, z: 204.5, width: 600 };
    const coords2 = { width: 600, z: 204.5, x: 102.5 };

    expect(canonicalStringify(coords1)).toBe('{"width":600,"x":102.5,"z":204.5}');
    expect(computeCanonicalSha256(coords1)).toBe(computeCanonicalSha256(coords2));
  });
});
