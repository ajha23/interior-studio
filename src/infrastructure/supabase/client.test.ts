import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from './client';

describe('readSupabaseConfig', () => {
  it('returns the configuration when both variables are set', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'key' })).toEqual({
      config: { url: 'http://127.0.0.1:54321', anonKey: 'key' },
    });
  });

  it('names each missing variable', () => {
    expect(readSupabaseConfig({})).toEqual({ missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] });
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://x' })).toEqual({ missing: ['VITE_SUPABASE_ANON_KEY'] });
  });

  it('treats blank values as missing', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: 'key' })).toEqual({ missing: ['VITE_SUPABASE_URL'] });
  });
});
