/**
 * Keeps the page a signed-out visitor asked for across the Google redirect (spec 042, FR-006).
 * Google returns to the site root with `?code=…`; the Supabase client exchanges it for a session,
 * then the app removes the OAuth parameters and restores the remembered hash.
 */
const KEY = 'auth:return-to';
const OAUTH_PARAMS = ['code', 'error', 'error_description', 'error_code', 'state'];

export function rememberReturnTo(hash: string): void {
  if (!hash || hash === '#' || hash === '#/') return;
  try {
    sessionStorage.setItem(KEY, hash);
  } catch {
    // Storage blocked: the visitor lands on the default page instead.
  }
}

/** The remembered hash, cleared on read; null when there is none. */
export function takeReturnTo(): string | null {
  try {
    const hash = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return hash;
  } catch {
    return null;
  }
}

/** Removes OAuth parameters from the address bar without reloading; keeps the hash. */
export function cleanAuthParams(): void {
  const url = new URL(window.location.href);
  const before = url.search;
  for (const p of OAUTH_PARAMS) url.searchParams.delete(p);
  if (url.search === before) return;
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/** A readable reason when Google sends the visitor back with an error (for example, consent cancelled). */
export function authErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return null;
  return error === 'access_denied' ? 'Sign-in was cancelled.' : (params.get('error_description') ?? 'Sign-in did not complete.');
}
