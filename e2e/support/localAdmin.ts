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
