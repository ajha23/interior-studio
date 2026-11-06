/**
 * The app's single Supabase client (spec 042, FR-001). Every database and auth call goes through
 * this module; nothing else may call `createClient` (constitution XII: official client only).
 *
 * The browser build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. When either is
 * missing, `supabase` is null and `supabaseConfigError` names what is missing, so the app can show
 * a configuration screen instead of a blank page (FR-002).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type AppSupabaseClient = SupabaseClient<Database>;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Reads the browser configuration; returns the missing variable names when it is incomplete. */
export function readSupabaseConfig(env: Record<string, string | undefined>): { config: SupabaseConfig } | { missing: string[] } {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const missing = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY'].filter((v): v is string => Boolean(v));
  return missing.length ? { missing } : { config: { url, anonKey } };
}

/** Whether the email-and-password form may be shown: local development and Playwright only. */
export const passwordSignInEnabled = import.meta.env.VITE_AUTH_PASSWORD_SIGN_IN === 'true';

const read = readSupabaseConfig(import.meta.env as Record<string, string | undefined>);

/** Null when configured; otherwise a message naming each missing variable. */
export const supabaseConfigError: string | null =
  'missing' in read ? `Missing configuration: ${read.missing.join(', ')}. Set ${read.missing.length > 1 ? 'them' : 'it'} for this build.` : null;

export const supabase: AppSupabaseClient | null =
  'config' in read
    ? createClient<Database>(read.config.url, read.config.anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
