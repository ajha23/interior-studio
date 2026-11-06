// Spec 045: the five AI endpoints refuse strangers, non-members and viewers, and charge credits.
// Runs against the local dev server (same handlers as production) and the local Supabase stack.
import { expect, test } from '@playwright/test';
import { ensureLocalUser, localAccessToken, localPublicKey, localRpc, localStudioIds } from './support/localAdmin';

test.use({ storageState: { cookies: [], origins: [] } });

const ALPHA = 'aaaaaaaa-0000-4000-8000-000000000000';
const BETA = 'bbbbbbbb-0000-4000-8000-000000000000';
const ENDPOINTS = ['/api/assistant', '/api/speech', '/api/live-token', '/api/render', '/api/reference'];

test.describe('API: only signed-in studio members can call AI (User Story 1)', () => {
  test('every endpoint refuses an anonymous call with 401', async ({ request }) => {
    for (const path of ENDPOINTS) {
      const res = await request.post(path, { data: {} });
      expect(res.status(), path).toBe(401);
      expect(await res.json(), path).toMatchObject({ ok: false, error: { code: 'unauthorized', message: 'Sign in to use AI.' } });
    }
    expect((await request.get('/api/assistant')).status()).toBe(401);
  });

  test('a tampered token, or the public key used as a token, is refused with 401', async ({ request }) => {
    const token = await localAccessToken('designer.a@example.test');
    const tampered = `${token.slice(0, -6)}AAAAAA`;
    for (const bearer of [tampered, localPublicKey()]) {
      const res = await request.post('/api/live-token', { data: { voice: 'Puck' }, headers: { authorization: `Bearer ${bearer}`, 'x-studio-id': ALPHA } });
      expect(res.status()).toBe(401);
    }
  });

  test('a viewer, and a member of another studio, are refused with 403', async ({ request }) => {
    const viewer = await localAccessToken('viewer.b@example.test');
    const asViewer = await request.post('/api/live-token', { data: { voice: 'Puck' }, headers: { authorization: `Bearer ${viewer}`, 'x-studio-id': BETA } });
    expect(asViewer.status()).toBe(403);
    expect(await asViewer.json()).toMatchObject({ error: { code: 'forbidden', message: "Viewers can't use AI. Ask a studio owner for designer access." } });

    const alphaDesigner = await localAccessToken('designer.a@example.test');
    const elsewhere = await request.post('/api/live-token', { data: { voice: 'Puck' }, headers: { authorization: `Bearer ${alphaDesigner}`, 'x-studio-id': BETA } });
    expect(elsewhere.status()).toBe(403);
    expect(await elsewhere.json()).toMatchObject({ error: { code: 'forbidden', message: 'You are not a member of this studio.' } });
  });
});

test.describe('API: every call is paid for from studio credits (User Story 2)', () => {
  test('a new Free studio (0 credits) gets 402 and nothing is spent', async ({ request }) => {
    const email = `ai-free-${Date.now()}@example.test`;
    await ensureLocalUser(email);
    const token = await localAccessToken(email);
    await localRpc(token, 'start_session'); // what the app does at sign-in: creates their Free studio
    const [studio] = await localStudioIds(token);
    expect(studio).toBeTruthy();
    const res = await request.post('/api/speech', {
      data: { text: 'Applied.', engine: 'gemini', voice: 'Kore', language: 'en-GB' },
      headers: { authorization: `Bearer ${token}`, 'x-studio-id': studio! },
    });
    expect(res.status()).toBe(402);
    expect(await res.json()).toMatchObject({ error: { code: 'no_credits', message: 'Your studio has no AI credits left. Contact Interior Studio to add credits.' } });
    expect(await localRpc<number>(token, 'ai_credit_balance', { p_org: studio })).toBe(0);
  });

  test('a designer passes the gate; with no provider key locally the call fails and is refunded', async ({ request }) => {
    const token = await localAccessToken('designer.a@example.test');
    const before = await localRpc<number>(token, 'ai_credit_balance', { p_org: ALPHA });
    const res = await request.post('/api/live-token', { data: { voice: 'Puck' }, headers: { authorization: `Bearer ${token}`, 'x-studio-id': ALPHA } });
    // Past the gate: the local server has no GEMINI_API_KEY, so the provider step answers 503.
    expect(res.status()).toBe(503);
    expect(res.headers()['x-ai-credits']).toBe(String(before));
    expect(await localRpc<number>(token, 'ai_credit_balance', { p_org: ALPHA })).toBe(before);
  });
});
