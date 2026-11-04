/**
 * Canonical JSON serialization and UTF-8 SHA-256 hashing.
 * Satisfies Constitution Principles III, IV, and Feature 034 Tasks T403, T404, T405.
 * 
 * Guarantees:
 * 1. Object keys are sorted lexicographically at all depths.
 * 2. Array item order is preserved.
 * 3. Undefined and function properties are omitted.
 * 4. Strings are encoded as UTF-8 bytes, correctly handling multi-byte Unicode (e.g. ₹, emoji, non-ASCII).
 * 5. Numbers (including half-millimetre coordinates like 102.5) format deterministically.
 */

export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalStringify(item)).join(',')}]`;
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries: string[] = [];

  for (const key of sortedKeys) {
    const value = record[key];
    if (value !== undefined && typeof value !== 'function') {
      entries.push(`${JSON.stringify(key)}:${canonicalStringify(value)}`);
    }
  }

  return `{${entries.join(',')}}`;
}

/**
 * Pure TypeScript SHA-256 implementation operating on UTF-8 bytes.
 * Works uniformly in browser V8, headless Node/Deno runtimes, and Web Workers.
 */
export function sha256Bytes(bytes: Uint8Array): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  const bitLength = bytes.length * 8;

  // Prepare initial hash constants (first 32 bits of the fractional parts of the square roots of the first 8 primes)
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  // Round constants (first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Pre-processing: padding
  // Find padded length: byte length + 1 (for 0x80) + padding zeroes + 8 bytes length
  // (length + 1 + 8 + k) % 64 === 0 => (length + 9 + k) % 64 === 0
  const totalLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  // Append 64-bit length in big-endian bits
  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLength / maxWord);
  const lowBits = (bitLength & 0xffffffff) >>> 0;
  view.setUint32(totalLength - 8, highBits, false);
  view.setUint32(totalLength - 4, lowBits, false);

  // Process message in 512-bit (64-byte) blocks
  const w = new Int32Array(64);
  const numBlocks = totalLength / 64;

  for (let b = 0; b < numBlocks; b++) {
    const blockOffset = b * 64;
    for (let t = 0; t < 16; t++) {
      w[t] = view.getInt32(blockOffset + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(w[t - 15]!, 7) ^ rightRotate(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 = rightRotate(w[t - 2]!, 17) ^ rightRotate(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) | 0;
    }

    let a = hash[0]!;
    let bVal = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;

    for (let t = 0; t < 64; t++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[t]! + w[t]!) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & bVal) ^ (a & c) ^ (bVal & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = bVal;
      bVal = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0]! + a) | 0;
    hash[1] = (hash[1]! + bVal) | 0;
    hash[2] = (hash[2]! + c) | 0;
    hash[3] = (hash[3]! + d) | 0;
    hash[4] = (hash[4]! + e) | 0;
    hash[5] = (hash[5]! + f) | 0;
    hash[6] = (hash[6]! + g) | 0;
    hash[7] = (hash[7]! + h) | 0;
  }

  // Format hex digest
  let hex = '';
  for (let i = 0; i < 8; i++) {
    const word = hash[i]!;
    for (let byteIdx = 3; byteIdx >= 0; byteIdx--) {
      const byte = (word >> (byteIdx * 8)) & 0xff;
      hex += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return hex;
}

/**
 * Computes a deterministic 64-character SHA-256 digest over any canonical payload using UTF-8 bytes.
 */
export function computeCanonicalSha256(payload: unknown): string {
  const canonical = canonicalStringify(payload);
  const utf8Bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(canonical)
    : Uint8Array.from(Buffer.from(canonical, 'utf8'));
  return sha256Bytes(utf8Bytes);
}
