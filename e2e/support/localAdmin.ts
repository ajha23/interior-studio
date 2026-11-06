/**
 * Test-only helper for the LOCAL Supabase stack: creates confirmed users through the local Auth admin
 * API. It refuses any URL that is not on this machine, so it can never touch a hosted project.
 */
import { execSync } from 'node:child_process';

const URL_LOCAL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';

function localServiceKey(): string {
  const env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const key = /^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m.exec(env)?.[1];
  if (!key) throw new Error('Local service key not found: start the stack with npm run db:start');
  return key;
}

/** Creates a confirmed email user with the local test password; an existing user is fine. */
export async function ensureLocalUser(email: string, password = 'password123'): Promise<void> {
  const host = new URL(URL_LOCAL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to create users on a non-local project: ${URL_LOCAL}`);
  const key = localServiceKey();
  const res = await fetch(`${URL_LOCAL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) return;
  const body = await res.text();
  if (res.status === 422 && /already|exists|registered/i.test(body)) return;
  throw new Error(`Could not create ${email}: ${res.status} ${body}`);
}

/** Creates a pending invite in a seeded studio on the LOCAL stack (spec 054 e2e), as the studio's owner would. */
export async function createLocalInvite(orgId: string, email: string, role: 'admin' | 'designer' | 'viewer', invitedBy: string): Promise<void> {
  const host = new URL(URL_LOCAL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to create invites on a non-local project: ${URL_LOCAL}`);
  const key = localServiceKey();
  const res = await fetch(`${URL_LOCAL}/rest/v1/org_invites`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ org_id: orgId, email: email.toLowerCase(), role, invited_by: invitedBy }),
  });
  if (!res.ok) throw new Error(`Could not invite ${email}: ${res.status} ${await res.text()}`);
}

function localAnonKey(): string {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  const env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const key = /^ANON_KEY="?([^"\n]+)"?$/m.exec(env)?.[1];
  if (!key) throw new Error('Local anon key not found: start the stack with npm run db:start');
  return key;
}

/** The local publishable (anon) key, for tests that call the local API directly (spec 045). */
export const localPublicKey = localAnonKey;

/** Signs a local test user in with the password grant and returns their access token (LOCAL stack only). */
export async function localAccessToken(email: string, password = 'password123'): Promise<string> {
  const host = new URL(URL_LOCAL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to sign in on a non-local project: ${URL_LOCAL}`);
  const key = localAnonKey();
  const res = await fetch(`${URL_LOCAL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !body.access_token) throw new Error(`Could not sign in ${email}: ${res.status} ${body.error_description ?? body.msg ?? ''}`);
  return body.access_token;
}

/** Calls a database function on the LOCAL stack as the user (their token), like the app does. */
export async function localRpc<T>(token: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${URL_LOCAL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: localAnonKey(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** The studios the user belongs to, as the app reads them (LOCAL stack, RLS applies). */
export async function localStudioIds(token: string): Promise<string[]> {
  const res = await fetch(`${URL_LOCAL}/rest/v1/org_members?select=org_id`, { headers: { apikey: localAnonKey(), Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`org_members: ${res.status}`);
  return ((await res.json()) as { org_id: string }[]).map((r) => r.org_id);
}
