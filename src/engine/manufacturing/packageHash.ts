/**
 * Pure Deterministic Canonical JSON Serialization & SHA-256 Hashing.
 * Satisfies PRD v2.1 ARC-02 and ARC-03 across browser, Node.js, and edge workers.
 */

/**
 * Deterministically serializes any JavaScript object or primitive into a canonical JSON string:
 * - Object keys are sorted alphabetically at all nesting levels.
 * - Array element order is strictly preserved.
 * - Undefined and function properties are ignored.
 * - Numbers and booleans format consistently.
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
 * Pure TS implementation of SHA-256 for fast synchronous hashing in pure engine layers.
 */
function sha256Pure(asciiStr: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  let ascii = asciiStr;
  const asciiBitLength = ascii.length * 8;

  const words: number[] = [];
  const hash: number[] = [];
  const k: number[] = [];

  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';

  for (let i = 0; i < ascii.length; i++) {
    const code = ascii.charCodeAt(i);
    const wordIndex = i >> 2;
    words[wordIndex] = (words[wordIndex] ?? 0) | (code << (((3 - i) % 4) * 8));
  }
  words.push((asciiBitLength / maxWord) | 0);
  words.push(asciiBitLength);

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;

      const s0 = i < 16 ? (w[i] ?? 0) : ((w[i] =
        ((w[i - 16] ?? 0) +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          (w[i - 7] ?? 0) +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
        0));

      const ch = ((hash[4] ?? 0) & (hash[5] ?? 0)) ^ (~(hash[4] ?? 0) & (hash[6] ?? 0));
      const maj = ((hash[0] ?? 0) & (hash[1] ?? 0)) ^ ((hash[0] ?? 0) & (hash[2] ?? 0)) ^ ((hash[1] ?? 0) & (hash[2] ?? 0));
      const s1 = rightRotate(hash[4] ?? 0, 6) ^ rightRotate(hash[4] ?? 0, 11) ^ rightRotate(hash[4] ?? 0, 25);
      const s0Maj = rightRotate(hash[0] ?? 0, 2) ^ rightRotate(hash[0] ?? 0, 13) ^ rightRotate(hash[0] ?? 0, 22);

      const t1 = (hash[7] ?? 0) + s1 + ch + (k[i] ?? 0) + s0;
      const t2 = s0Maj + maj;

      hash[7] = hash[6] ?? 0;
      hash[6] = hash[5] ?? 0;
      hash[5] = hash[4] ?? 0;
      hash[4] = ((hash[3] ?? 0) + t1) | 0;
      hash[3] = hash[2] ?? 0;
      hash[2] = hash[1] ?? 0;
      hash[1] = hash[0] ?? 0;
      hash[0] = (t1 + t2) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = ((hash[i] ?? 0) + (oldHash[i] ?? 0)) | 0;
    }
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let byteIdx = 3; byteIdx >= 0; byteIdx--) {
      const b = ((hash[i] ?? 0) >> (byteIdx * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Computes a deterministic 64-character SHA-256 digest over any canonical payload.
 */
export function computeCanonicalSha256(payload: unknown): string {
  const canonical = canonicalStringify(payload);
  return sha256Pure(canonical);
}
