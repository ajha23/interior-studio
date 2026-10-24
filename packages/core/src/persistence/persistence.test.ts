import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalJson, sceneHash } from './canonical';
import { migrateScene, SceneMigrationError, type MigrationRegistry } from './migrate';

describe('canonicalJson', () => {
  it('is independent of key order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(obj));
      }),
    );
  });

  it('drops undefined object fields and rejects non-finite numbers', () => {
    expect(canonicalJson({ b: 1, a: undefined })).toBe('{"b":1}');
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
  });
});

describe('sceneHash', () => {
  it('matches for equivalent scenes and differs on change', async () => {
    const a = await sceneHash({ room: { w: 3000, d: 4000 }, items: [1, 2] });
    const b = await sceneHash({ items: [1, 2], room: { d: 4000, w: 3000 } });
    const c = await sceneHash({ items: [1, 2], room: { d: 4001, w: 3000 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('migrateScene', () => {
  const registry: MigrationRegistry = {
    current: 3,
    steps: {
      1: (s) => ({ ...(s as object), addedIn2: true }),
      2: (s) => ({ ...(s as object), addedIn3: true }),
    },
  };

  it('walks every step from an old version', () => {
    expect(migrateScene({ a: 1 }, 1, registry)).toEqual({ a: 1, addedIn2: true, addedIn3: true });
  });

  it('is a no-op at the current version and never mutates input', () => {
    const input = { a: 1 };
    expect(migrateScene(input, 3, registry)).toEqual({ a: 1 });
    migrateScene(input, 1, registry);
    expect(input).toEqual({ a: 1 });
  });

  it('refuses scenes from a newer app', () => {
    expect(() => migrateScene({}, 4, registry)).toThrow(SceneMigrationError);
  });
});
