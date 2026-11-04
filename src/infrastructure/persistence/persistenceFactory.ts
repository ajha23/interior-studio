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

let activeMode: 'supabase' | 'in-memory' = 'in-memory';

export function isCloudPersistenceActive(): boolean {
  return activeMode === 'supabase';
}

/**
 * Explicit runtime composition root for persistence adapters (Feature 034.2.2 FR-01, T101-T103).
 * Guarantees that production cloud mode fails loudly if required Supabase credentials or client are absent.
 */
export function initializePersistence(config: PersistenceConfiguration): CloudPersistencePort {
  if (config.mode === 'supabase') {
    if (config.supabaseClient) {
      const adapter = new SupabasePersistenceAdapter(config.supabaseClient);
      setPersistenceAdapter(adapter);
      activeMode = 'supabase';
      return adapter;
    }

    const url = config.supabaseUrl || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : undefined);
    const key = config.supabaseAnonKey || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : undefined);

    if (!url || !key) {
      throw new Error(
        'Failed to initialize cloud persistence: mode "supabase" requires supabaseUrl and supabaseAnonKey (or pre-configured supabaseClient).'
      );
    }

    const client = createBrowserSupabaseClient(url, key);
    const adapter = new SupabasePersistenceAdapter(client);
    setPersistenceAdapter(adapter);
    activeMode = 'supabase';
    return adapter;
  }

  const adapter = new InMemoryPersistenceAdapter();
  setPersistenceAdapter(adapter);
  activeMode = 'in-memory';
  return adapter;
}

/**
 * Bootstrap function executed at application startup (src/main.tsx).
 * In cloud mode (VITE_CLOUD_PERSISTENCE=true), initializes SupabasePersistenceAdapter or fails closed with a fatal error.
 */
export function bootstrapPersistence(customEnv?: Record<string, string | undefined>): CloudPersistencePort {
  const env =
    customEnv ||
    (typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : typeof process !== 'undefined'
        ? (process.env as Record<string, string | undefined>)
        : {});

  const isCloud = env.VITE_CLOUD_PERSISTENCE === 'true';
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (isCloud) {
    if (!url || !anonKey) {
      throw new Error(
        'FATAL: Cloud persistence is enabled (VITE_CLOUD_PERSISTENCE=true) but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Failing closed.'
      );
    }

    const client = createBrowserSupabaseClient(url, anonKey);
    return initializePersistence({
      mode: 'supabase',
      supabaseClient: client,
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
    });
  }

  return initializePersistence({ mode: 'in-memory' });
}

/**
 * Lightweight fetch-based SupabaseClientLike implementation for production web browser runtimes.
 */
export function createBrowserSupabaseClient(supabaseUrl: string, anonKey: string): SupabaseClientLike {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  return {
    from: () => {
      throw new Error('Direct table operations should be routed through persistence adapter methods or RPCs.');
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const endpoint = `${cleanUrl}/rest/v1/rpc/${fn}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        let errMessage = `RPC ${fn} failed with HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as Record<string, unknown>;
          errMessage = String(errJson.message || errJson.error || errMessage);
        } catch {
          // ignore
        }
        return { data: null, error: new Error(errMessage) };
      }

      const data = (await res.json()) as unknown;
      return { data, error: null };
    },
  };
}
