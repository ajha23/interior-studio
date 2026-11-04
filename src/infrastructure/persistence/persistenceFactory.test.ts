import { describe, expect, it } from 'vitest';
import { initializePersistence } from './persistenceFactory';
import { InMemoryPersistenceAdapter } from './inMemoryPersistenceAdapter';
import { SupabasePersistenceAdapter, type SupabaseClientLike, type SupabaseFilterBuilder } from './supabasePersistenceAdapter';
import { getPersistenceAdapter } from '@/state/cloudProjectStore';

describe('Persistence Runtime Factory (Feature 034.2.1 T401-T403)', () => {
  it('initializes InMemoryPersistenceAdapter when mode is "in-memory"', () => {
    const adapter = initializePersistence({ mode: 'in-memory' });
    expect(adapter).toBeInstanceOf(InMemoryPersistenceAdapter);
    expect(getPersistenceAdapter()).toBe(adapter);
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
});
