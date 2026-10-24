import type { Page, Route } from '@playwright/test';
import { sampleProject, SCHEMA_VERSION, type Project } from '../packages/core/src/index';

export const ORG_ID = '00000000-0000-4000-8000-0000000000a1';
export const PROJECT_ID = '00000000-0000-4000-8000-0000000000b1';
export const USER_ID = '00000000-0000-4000-8000-0000000000c1';
const BASE = 'http://mock.supabase.test';

export interface SavedVersion {
  versionNo: number;
  kind: string;
  message: string;
  scene: Project;
}

/**
 * A minimal in-memory Supabase: auth session, membership, one project and its versions. Every
 * save through `save_project_version` is recorded so tests can assert what was persisted.
 */
export class MockBackend {
  versions: SavedVersion[] = [];
  aiCommandCalls: unknown[] = [];
  /** Optional canned reply for the `ai-command` edge function. */
  aiCommandReply: ((body: unknown) => unknown) | null = null;
  priceList: unknown = null;
  quotes: Record<string, unknown>[] = [];

  constructor(initial: Project) {
    this.versions.push({ versionNo: 1, kind: 'manual', message: 'Seed', scene: initial });
  }

  get latest(): SavedVersion {
    return this.versions[this.versions.length - 1];
  }

  private versionRow(v: SavedVersion) {
    return {
      id: `ver-${v.versionNo}`,
      org_id: ORG_ID,
      project_id: PROJECT_ID,
      version_no: v.versionNo,
      kind: v.kind,
      message: v.message,
      scene: v.scene,
      scene_hash: `hash-${v.versionNo}`,
      schema_version: SCHEMA_VERSION,
      size_bytes: 1000,
      created_at: new Date(Date.now() - 60_000).toISOString(),
      created_by: USER_ID,
    };
  }

  private projectRow() {
    return {
      id: PROJECT_ID,
      org_id: ORG_ID,
      name: this.latest.scene.name,
      client_name: this.latest.scene.client,
      site_address: '',
      status: 'design',
      archived_at: null,
      created_at: new Date(Date.now() - 86_400_000).toISOString(),
      created_by: USER_ID,
      updated_at: new Date().toISOString(),
      updated_by: USER_ID,
      current_version_id: `ver-${this.latest.versionNo}`,
      current_version_no: this.latest.versionNo,
    };
  }

  async install(page: Page) {
    await page.addInitScript(
      ({ user }) => {
        localStorage.setItem(
          'sb-mock-auth-token',
          JSON.stringify({
            access_token: 'e2e-token',
            refresh_token: 'e2e-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: 4102444800,
            user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'designer@studio.test', app_metadata: {}, user_metadata: { full_name: 'E2E Designer' }, created_at: '2026-01-01T00:00:00Z' },
          }),
        );
      },
      { user: USER_ID },
    );
    const json = (route: Route, body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

    await page.route(`${BASE}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (path === '/auth/v1/user') return json(route, { id: USER_ID, email: 'designer@studio.test' });
      if (path === '/rest/v1/rpc/accept_pending_invites') return json(route, 0);
      if (path === '/rest/v1/org_members') return json(route, [{ role: 'owner', organizations: { id: ORG_ID, name: 'E2E Studio', slug: 'e2e', plan: 'pro' } }]);
      if (path === '/rest/v1/projects') return json(route, single ? this.projectRow() : [this.projectRow()]);
      if (path === '/rest/v1/project_versions') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const v = this.versions.find((x) => `ver-${x.versionNo}` === id) ?? this.latest;
        return json(route, single ? this.versionRow(v) : this.versions.map((x) => this.versionRow(x)).reverse());
      }
      if (path === '/rest/v1/rpc/save_project_version') {
        const body = req.postDataJSON() as { p_scene: Project; p_kind: string; p_message: string };
        const v: SavedVersion = { versionNo: this.latest.versionNo + 1, kind: body.p_kind, message: body.p_message, scene: body.p_scene };
        this.versions.push(v);
        return json(route, this.versionRow(v));
      }
      if (path === '/functions/v1/ai-command') {
        const body = req.postDataJSON();
        this.aiCommandCalls.push(body);
        if (this.aiCommandReply) return json(route, this.aiCommandReply(body));
        return json(route, { error: 'not_configured', message: 'AI commands are not set up in tests.' }, 503);
      }
      if (path.startsWith('/rest/v1/rpc/ai_credit_balance')) return json(route, 100);
      if (path === '/rest/v1/price_lists') {
        if (req.method() === 'POST') {
          const body = req.postDataJSON() as { rates: unknown };
          this.priceList = body.rates;
          return json(route, null, 201);
        }
        const row = this.priceList ? { rates: this.priceList, updated_at: new Date().toISOString() } : null;
        return json(route, single ? row : row ? [row] : []);
      }
      if (path === '/rest/v1/quotes') {
        if (req.method() === 'POST') {
          const body = req.postDataJSON() as Record<string, unknown>;
          this.quotes.push({ ...body, id: `q-${this.quotes.length + 1}`, status: 'draft', created_at: new Date().toISOString() });
          return json(route, null, 201);
        }
        return json(route, [...this.quotes].reverse());
      }
      // Lists the editor reads but these tests don't exercise (comments, renders, models…).
      return json(route, single ? null : []);
    });
  }
}

export function seedProject(mutate?: (p: Project) => void): Project {
  const p = sampleProject();
  p.name = 'E2E Kitchen';
  if (mutate) mutate(p);
  return p;
}
