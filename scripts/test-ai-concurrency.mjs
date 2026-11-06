#!/usr/bin/env node
/**
 * Spec 045, SC-002: ten AI calls arrive at once for a studio with credit for five. Exactly five are
 * charged, five are refused with PT402, and the balance never goes below zero.
 *
 * pgTAP runs in one transaction and cannot open independent connections, so this runs against the
 * LOCAL stack over HTTP. Each call goes through its own client, PostgREST and its own database
 * connection. It refuses any URL that is not on this machine. The local service key is used only to
 * set up and clean up the test studio; the calls themselves run as the signed-in user.
 *
 *   npm run db:test:concurrency
 */
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const read = (name) => new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm').exec(env)?.[1];
const url = read('API_URL') ?? 'http://127.0.0.1:54321';
const anonKey = read('ANON_KEY');
const serviceKey = read('SERVICE_ROLE_KEY');

const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  console.error(`Refusing to run against a non-local project: ${url}`);
  process.exit(2);
}
if (!anonKey || !serviceKey) {
  console.error('Local keys not found: start the stack with npm run db:start');
  process.exit(2);
}

const CALLS = 10;
const CREDIT = 5; // five assistant messages at 1 credit each
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now();
const email = `concurrency-${stamp}@example.test`;
const orgId = crypto.randomUUID();
let userId;

function fail(message) {
  throw new Error(message);
}

try {
  // Setup (service key, local only): a user, a studio they own, and exactly CREDIT credits.
  const created = await admin.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
  if (created.error) fail(`create user: ${created.error.message}`);
  userId = created.data.user.id;
  for (const [table, row] of [
    ['organizations', { id: orgId, name: 'Concurrency Test', slug: `concurrency-${stamp}`, plan: 'free' }],
    ['org_members', { org_id: orgId, user_id: userId, role: 'owner' }],
    ['ai_credit_ledger', { org_id: orgId, delta: CREDIT, reason: 'topup', note: 'spec 045 concurrency test' }],
  ]) {
    const { error } = await admin.from(table).insert(row);
    if (error) fail(`insert ${table}: ${error.message}`);
  }

  // The calls: one signed-in client per call, all fired together.
  const signedIn = await createClient(url, anonKey, noSession).auth.signInWithPassword({ email, password: 'password123' });
  if (signedIn.error) fail(`sign in: ${signedIn.error.message}`);
  const token = signedIn.data.session.access_token;
  const results = await Promise.all(
    Array.from({ length: CALLS }, () =>
      createClient(url, anonKey, { ...noSession, global: { headers: { Authorization: `Bearer ${token}` } } }).rpc('ai_start_call', {
        p_org: orgId,
        p_op: 'assistant',
      }),
    ),
  );

  const ok = results.filter((r) => !r.error).length;
  const refused = results.filter((r) => r.error?.code === 'PT402').length;
  const other = results.filter((r) => r.error && r.error.code !== 'PT402').map((r) => `${r.error.code}: ${r.error.message}`);
  const ledger = await admin.from('ai_credit_ledger').select('delta').eq('org_id', orgId);
  const jobs = await admin.from('ai_jobs').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
  const balance = (ledger.data ?? []).reduce((sum, row) => sum + row.delta, 0);

  console.log(JSON.stringify({ calls: CALLS, credit: CREDIT, charged: ok, refusedNoCredits: refused, otherErrors: other, jobs: jobs.count, balance }));
  if (other.length) fail(`unexpected errors: ${other.join('; ')}`);
  if (ok !== CREDIT || refused !== CALLS - CREDIT) fail(`expected ${CREDIT} charged and ${CALLS - CREDIT} refused`);
  if (jobs.count !== CREDIT) fail(`expected ${CREDIT} jobs, found ${jobs.count}`);
  if (balance !== 0) fail(`expected a final balance of 0, found ${balance}`);
  console.log('PASS: concurrent calls never overspend');
} catch (e) {
  console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await admin.from('organizations').delete().eq('id', orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
