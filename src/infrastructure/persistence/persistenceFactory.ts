import { InMemoryPersistenceAdapter } from './inMemoryPersistenceAdapter';
import { SupabasePersistenceAdapter, type SupabaseClientLike } from './supabasePersistenceAdapter';
import type { CloudPersistencePort } from '@/domain/project/cloudPersistencePort';
import { setPersistenceAdapter } from '@/state/cloudProjectStore';

export interface PersistenceConfiguration {
  mode: 'supabase' | 'in-memory';
  supabaseClient?: SupabaseClientLike;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

/**
 * Explicit runtime composition root for persistence adapters (Feature 034.2.1 FR-08, T401-T402).
 * Guarantees that production cloud mode fails loudly if required Supabase credentials or client are absent.
 */
export function initializePersistence(config: PersistenceConfiguration): CloudPersistencePort {
  if (config.mode === 'supabase') {
    if (config.supabaseClient) {
      const adapter = new SupabasePersistenceAdapter(config.supabaseClient);
      setPersistenceAdapter(adapter);
      return adapter;
    }

    const url = config.supabaseUrl || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : undefined);
    const key = config.supabaseAnonKey || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : undefined);

    if (!url || !key) {
      throw new Error(
        'Failed to initialize cloud persistence: mode "supabase" requires supabaseUrl and supabaseAnonKey (or pre-configured supabaseClient).'
      );
    }

    throw new Error(
      'Cannot instantiate Supabase client without an injected client instance in this environment.'
    );
  }

  const adapter = new InMemoryPersistenceAdapter();
  setPersistenceAdapter(adapter);
  return adapter;
}
