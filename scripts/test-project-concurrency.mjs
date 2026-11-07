#!/usr/bin/env node
/**
 * Spec 043, SaaS §8 and SC-003: saves that race on separate connections.
 *   (a) ten saves with the same expected head at once: exactly one becomes the next version, nine
 *       get PT409, and no version is lost or duplicated;
 *   (b) ten retries of one save (same idempotency key) at once: exactly one new version, and every
 *       response names it.
 *
 * pgTAP runs in one transaction and cannot open independent connections, so this runs against the
 * LOCAL stack over HTTP, one client per call. It refuses any URL that is not on this machine. The
 * local service key is used only to set up and clean up the test studio; the saves run as the
 * signed-in designer.
 *
 *   npm run db:test:project-concurrency
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
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now();
const email = `project-concurrency-${stamp}@example.test`;
const orgId = crypto.randomUUID();
let userId;

function fail(message) {
  throw new Error(message);
}

/** After `db reset`, PostgREST reloads its schema cache for a few seconds; wait until it answers. */
async function waitForApi(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { error } = await admin.from('organizations').select('id').limit(1);
    if (!error) return;
    if (Date.now() > deadline) fail(`the local API is not ready: ${error.message}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

const scene = (id, width) => ({ id, name: 'Concurrency kitchen', width });

try {
  await waitForApi();
  const created = await admin.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
  if (created.error) fail(`create user: ${created.error.message}`);
  userId = created.data.user.id;
  for (const [table, row] of [
    ['organizations', { id: orgId, name: 'Project Concurrency Test', slug: `project-concurrency-${stamp}`, plan: 'free' }],
    ['org_members', { org_id: orgId, user_id: userId, role: 'designer' }],
  ]) {
    const { error } = await admin.from(table).insert(row);
    if (error) fail(`insert ${table}: ${error.message}`);
  }

  const signedIn = await createClient(url, anonKey, noSession).auth.signInWithPassword({ email, password: 'password123' });
  if (signedIn.error) fail(`sign in: ${signedIn.error.message}`);
  const token = signedIn.data.session.access_token;
  const client = () => createClient(url, anonKey, { ...noSession, global: { headers: { Authorization: `Bearer ${token}` } } });

  const made = await client().rpc('create_project', {
    p_org: orgId, p_name: 'Race', p_doc_type: 'kitchen', p_scene: scene('x', 600), p_schema_version: 2, p_idempotency_key: crypto.randomUUID(),
  });
  if (made.error) fail(`create_project: ${made.error.message}`);
  const projectId = made.data[0].id;

  // (a) Same expected head, different keys.
  const race = await Promise.all(
    Array.from({ length: CALLS }, (_, i) =>
      client().rpc('save_project_version', {
        p_project: projectId, p_expected_version_no: 1, p_idempotency_key: crypto.randomUUID(),
        p_doc_type: 'kitchen', p_scene: scene(projectId, 600 + i), p_schema_version: 2,
      }),
    ),
  );
  const won = race.filter((r) => !r.error);
  const conflicts = race.filter((r) => r.error?.code === 'PT409');
  const otherA = race.filter((r) => r.error && r.error.code !== 'PT409').map((r) => `${r.error.code}: ${r.error.message}`);

  // (b) Same key, sent ten times at once (expected head 2).
  const key = crypto.randomUUID();
  const retries = await Promise.all(
    Array.from({ length: CALLS }, () =>
      client().rpc('save_project_version', {
        p_project: projectId, p_expected_version_no: 2, p_idempotency_key: key,
        p_doc_type: 'kitchen', p_scene: scene(projectId, 900), p_schema_version: 2,
      }),
    ),
  );
  const otherB = retries.filter((r) => r.error).map((r) => `${r.error.code}: ${r.error.message}`);
  const retryIds = new Set(retries.filter((r) => !r.error).map((r) => r.data[0].id));

  const versions = await admin.from('project_versions').select('version_no').eq('project_id', projectId).order('version_no');
  const numbers = (versions.data ?? []).map((v) => v.version_no);
  const head = await admin.from('projects').select('current_version_no').eq('id', projectId).single();

  console.log(JSON.stringify({
    sameHead: { calls: CALLS, saved: won.length, conflicts: conflicts.length, otherErrors: otherA },
    sameKey: { calls: CALLS, distinctVersions: retryIds.size, errors: otherB },
    versions: numbers, head: head.data?.current_version_no,
  }));
  if (otherA.length || otherB.length) fail(`unexpected errors: ${[...otherA, ...otherB].join('; ')}`);
  if (won.length !== 1 || conflicts.length !== CALLS - 1) fail(`expected 1 save and ${CALLS - 1} conflicts`);
  if (retryIds.size !== 1) fail(`expected every retry to return one version, got ${retryIds.size}`);
  if (numbers.join(',') !== '1,2,3' || head.data?.current_version_no !== 3) fail('expected exactly versions 1, 2, 3 with head 3');
  console.log('PASS: racing saves never overwrite or duplicate a version');
} catch (e) {
  console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await admin.from('organizations').delete().eq('id', orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
