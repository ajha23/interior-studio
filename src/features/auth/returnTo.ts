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

// --- Email sign-in (spec 054, research R7) ---------------------------------------------------
// The emailed link usually opens in a new tab, which cannot see this tab's sessionStorage, so the
// page asked for is also kept briefly in localStorage. It is a route hash only, never a token.

const EMAIL_RETURN_KEY = 'interior-studio:email-return-to';
const EMAIL_PENDING_KEY = 'interior-studio:email-pending';
const EMAIL_RETURN_TTL_MS = 15 * 60_000; // the link's lifetime (otp_expiry = 900)

/** A route hash inside the app, like `#/s/alpha/projects`; anything else is ignored. */
function isRouteHash(hash: unknown): hash is string {
  return typeof hash === 'string' && hash.startsWith('#/') && hash !== '#/';
}

export function saveEmailReturnTo(hash: string, now = Date.now()): void {
  if (!isRouteHash(hash)) return;
  try {
    localStorage.setItem(EMAIL_RETURN_KEY, JSON.stringify({ hash, at: now }));
  } catch {
    // Storage blocked: the link lands on the default page instead.
  }
}

/** The page asked for when the email was requested, if recent; removed on read. */
export function takeEmailReturnTo(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(EMAIL_RETURN_KEY);
    localStorage.removeItem(EMAIL_RETURN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { hash?: unknown; at?: unknown };
    if (!isRouteHash(value.hash) || typeof value.at !== 'number' || now - value.at > EMAIL_RETURN_TTL_MS) return null;
    return value.hash;
  } catch {
    return null;
  }
}

export function clearEmailReturnTo(): void {
  try {
    localStorage.removeItem(EMAIL_RETURN_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** The address waiting for its code, for this tab only (survives a reload of the code step). */
export function savePendingEmail(email: string): void {
  try {
    sessionStorage.setItem(EMAIL_PENDING_KEY, email);
  } catch {
    // Storage blocked: a reload asks for the address again.
  }
}

export function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(EMAIL_PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingEmail(): void {
  try {
    sessionStorage.removeItem(EMAIL_PENDING_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}
