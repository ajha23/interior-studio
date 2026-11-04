import { describe, expect, it } from 'vitest';
import { bootstrapPersistence, initializePersistence, isCloudPersistenceActive } from './persistenceFactory';
import { InMemoryPersistenceAdapter } from './inMemoryPersistenceAdapter';
import { SupabasePersistenceAdapter, type SupabaseClientLike, type SupabaseFilterBuilder } from './supabasePersistenceAdapter';
import { getPersistenceAdapter } from '@/state/cloudProjectStore';

describe('Persistence Runtime Factory (Feature 034.2.2 T101-T104)', () => {
  it('initializes InMemoryPersistenceAdapter when mode is "in-memory"', () => {
    const adapter = initializePersistence({ mode: 'in-memory' });
    expect(adapter).toBeInstanceOf(InMemoryPersistenceAdapter);
    expect(getPersistenceAdapter()).toBe(adapter);
    expect(isCloudPersistenceActive()).toBe(false);
  });

  it('initializes SupabasePersistenceAdapter when client is supplied', () => {
    const mockFilterBuilder = {} as unknown as SupabaseFilterBuilder;
    const mockClient: SupabaseClientLike = {
      from: () => mockFilterBuilder,
      rpc: async () => ({ data: null, error: null }),
    };

    const adapter = initializePersistence({
      mode: 'supabase',
      supabaseClient: mockClient,
    });

    expect(adapter).toBeInstanceOf(SupabasePersistenceAdapter);
    expect(getPersistenceAdapter()).toBe(adapter);
    expect(isCloudPersistenceActive()).toBe(true);
  });

  it('fails loudly when mode is "supabase" but credentials are missing', () => {
    expect(() =>
      initializePersistence({
        mode: 'supabase',
        supabaseUrl: '',
        supabaseAnonKey: '',
      })
    ).toThrow('Failed to initialize cloud persistence: mode "supabase" requires supabaseUrl and supabaseAnonKey');
  });

  describe('bootstrapPersistence', () => {
    it('initializes in-memory mode when VITE_CLOUD_PERSISTENCE is false or unset', () => {
      const adapter = bootstrapPersistence({ VITE_CLOUD_PERSISTENCE: 'false' });
      expect(adapter).toBeInstanceOf(InMemoryPersistenceAdapter);
      expect(isCloudPersistenceActive()).toBe(false);
    });

    it('initializes Supabase adapter when VITE_CLOUD_PERSISTENCE is true and credentials are provided', () => {
      const adapter = bootstrapPersistence({
        VITE_CLOUD_PERSISTENCE: 'true',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key-123',
      });
      expect(adapter).toBeInstanceOf(SupabasePersistenceAdapter);
      expect(isCloudPersistenceActive()).toBe(true);
    });

    it('fails closed when VITE_CLOUD_PERSISTENCE is true but credentials are missing', () => {
      expect(() =>
        bootstrapPersistence({
          VITE_CLOUD_PERSISTENCE: 'true',
          VITE_SUPABASE_URL: '',
          VITE_SUPABASE_ANON_KEY: '',
        })
      ).toThrow('FATAL: Cloud persistence is enabled');
    });
  });
});
