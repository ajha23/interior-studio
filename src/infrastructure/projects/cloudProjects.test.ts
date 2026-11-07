import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProject as newKitchen, DEFAULT_ROOM, SCHEMA_VERSION } from '@/domain';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';
import * as api from './cloudProjects';

type Response = { data: unknown; error: { code?: string; message?: string; details?: string | null } | null };

/** A fake supabase-js client: records every call in order and answers from a queue of responses. */
function fakeClient(...responses: Array<Response | Error>) {
  const calls: string[] = [];
  const next = (): Promise<Response> => {
    const r = responses.shift() ?? { data: null, error: null };
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (ok: (v: Response) => unknown, ko: (e: unknown) => unknown) => next().then(ok, ko);
          return (...args: unknown[]) => {
            calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
            return chain();
          };
        },
      },
    );
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`);
      return chain();
    },
    rpc: (fn: string, args: unknown) => {
      calls.push(`rpc(${fn}, ${JSON.stringify(args)})`);
      return next();
    },
  };
  return { client: client as unknown as AppSupabaseClient, calls };
}

const kitchen = (id = 'b1f0c0de-0000-4000-8000-000000000001') => ({ ...newKitchen({ name: 'Rao kitchen', room: DEFAULT_ROOM, layout: 'straight' }), id });

describe('errors from the database', () => {
  it('maps each code the functions raise to what the app does next (research R5)', () => {
    expect(api.toCloudError({ code: 'PT409', details: '{"current_version_no": 7}' })).toMatchObject({ kind: 'conflict', currentVersionNo: 7 });
    expect(api.toCloudError({ code: 'PT409', details: 'not json' })).toMatchObject({ kind: 'conflict', currentVersionNo: undefined });
    expect(api.toCloudError({ code: 'PT413' })).toMatchObject({ kind: 'too_large', message: "This design is larger than 2 MB and can't be saved to the studio." });
    expect(api.toCloudError({ code: 'PT423' })).toMatchObject({ kind: 'archived', message: 'This project was archived. Your changes are kept on this device.' });
    expect(api.toCloudError({ code: 'PT404' }).kind).toBe('not_found');
    expect(api.toCloudError({ code: '42501' }).kind).toBe('forbidden');
    expect(api.toCloudError({ code: 'PT401' }).kind).toBe('signed_out');
    expect(api.toCloudError({ code: '22023', message: 'This design belongs to another project.' })).toEqual({ kind: 'invalid', message: 'This design belongs to another project.' });
    expect(api.toCloudError({ code: '', message: 'TypeError: Failed to fetch' }).kind).toBe('offline');
    expect(api.toCloudError({ code: '57014', message: 'canceling statement' }).kind).toBe('server');
  });
});

describe('studio projects', () => {
  it('lists one studio’s projects, newest first, with owner and head type', async () => {
    const { client, calls } = fakeClient({
      data: [
        { id: 'p1', name: 'Rao kitchen', client_name: 'Mrs Rao', status: 'design', current_version_no: 3, archived_at: null, updated_at: '2026-11-07T10:00:00Z', created_by: 'u1', owner: { full_name: 'Alpha Designer', email: 'd@x' }, head: { doc_type: 'kitchen' } },
        { id: 'p2', name: 'Old', client_name: '', status: 'lead', current_version_no: 2, archived_at: null, updated_at: '2026-11-06T10:00:00Z', created_by: null, owner: null, head: { doc_type: 'legacy_v1' } },
      ],
      error: null,
    });
    const result = await api.listProjects(client, 'org-a');
    expect(calls[0]).toBe('from(projects)');
    expect(calls).toContain('eq("org_id", "org-a")');
    expect(calls).toContain('order("updated_at", {"ascending":false})');
    expect(result).toMatchObject({ ok: true, value: [{ id: 'p1', ownerName: 'Alpha Designer', docType: 'kitchen', headVersionNo: 3, clientName: 'Mrs Rao' }, { id: 'p2', ownerName: 'Former member', docType: 'legacy_v1' }] });
  });

  it('opens the head through the file parser, and treats a legacy head as not openable', async () => {
    const project = kitchen();
    const ok = fakeClient({ data: { current_version_no: 4, head: { version_no: 4, doc_type: 'kitchen', schema_version: SCHEMA_VERSION, scene: project } }, error: null });
    const opened = await api.openHead(ok.client, project.id);
    expect(opened).toMatchObject({ ok: true, value: { versionNo: 4, doc: { type: 'kitchen', project: { id: project.id, name: 'Rao kitchen' } } } });
    expect(ok.calls).toContain(`eq("id", "${project.id}")`);

    const legacy = fakeClient({ data: { current_version_no: 2, head: { version_no: 2, doc_type: 'legacy_v1', schema_version: 2, scene: { seed: true } } }, error: null });
    expect(await api.openHead(legacy.client, 'p2')).toMatchObject({ ok: false, error: { kind: 'legacy', message: 'Older format: opens after the import update.' } });

    const missing = fakeClient({ data: null, error: null });
    expect(await api.openHead(missing.client, 'p3')).toMatchObject({ ok: false, error: { kind: 'not_found' } });

    const broken = fakeClient({ data: { current_version_no: 1, head: { version_no: 1, doc_type: 'kitchen', schema_version: SCHEMA_VERSION, scene: { id: 'x' } } }, error: null });
    expect(await api.openHead(broken.client, 'x')).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('creates a project with its document, and adopts the id and name the database chose', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'new-id', name: 'Rao kitchen' }], error: null });
    const result = await api.createProject(client, { orgId: 'org-a', name: 'Rao kitchen', doc: { type: 'kitchen', project: kitchen('prj_local') }, idempotencyKey: 'k1' });
    expect(calls[0]).toMatch(/^rpc\(create_project, /);
    const args = JSON.parse(calls[0]!.slice('rpc(create_project, '.length, -1)) as Record<string, unknown>;
    expect(args).toMatchObject({ p_org: 'org-a', p_doc_type: 'kitchen', p_schema_version: SCHEMA_VERSION, p_idempotency_key: 'k1', p_client_name: '' });
    expect(args).not.toHaveProperty('p_scene_hash');
    expect(result).toMatchObject({ ok: true, value: { id: 'new-id', versionNo: 1, doc: { type: 'kitchen', project: { id: 'new-id' } } } });
  });

  it('saves with the expected head and key, and reports a conflict with the current head', async () => {
    const project = kitchen();
    const { client, calls } = fakeClient({ data: [{ id: 'v5', version_no: 5 }], error: null }, { data: null, error: { code: 'PT409', message: 'Someone else saved this project.', details: '{"current_version_no":6}' } });
    const doc = { type: 'kitchen' as const, project };
    expect(await api.saveVersion(client, { projectId: project.id, expectedVersionNo: 4, idempotencyKey: 'k2', doc, kind: 'manual', message: 'client review' })).toEqual({ ok: true, value: { id: 'v5', versionNo: 5 } });
    const args = JSON.parse(calls[0]!.slice('rpc(save_project_version, '.length, -1)) as Record<string, unknown>;
    expect(args).toMatchObject({ p_project: project.id, p_expected_version_no: 4, p_idempotency_key: 'k2', p_kind: 'manual', p_message: 'client review', p_doc_type: 'kitchen' });
    expect((args.p_scene as { id: string }).id).toBe(project.id);
    expect(await api.saveVersion(client, { projectId: project.id, expectedVersionNo: 4, idempotencyKey: 'k3', doc, kind: 'autosave' })).toMatchObject({ ok: false, error: { kind: 'conflict', currentVersionNo: 6 } });
  });

  it('reports a dropped connection as offline, never as success', async () => {
    const { client } = fakeClient(new TypeError('Failed to fetch'));
    expect(await api.saveVersion(client, { projectId: 'p', expectedVersionNo: 1, idempotencyKey: 'k', doc: { type: 'kitchen', project: kitchen('p') }, kind: 'autosave' })).toMatchObject({ ok: false, error: { kind: 'offline' } });
  });

  it('rename, archive, unarchive and delete: zero rows back means row-level security refused', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'p1' }], error: null }, { data: [], error: null }, { data: [{ id: 'p1' }], error: null }, { data: [{ id: 'p1' }], error: null }, { data: [], error: null });
    expect(await api.renameProject(client, 'p1', '  Rao kitchen v2 ')).toEqual({ ok: true, value: null });
    expect(calls).toContain('update({"name":"Rao kitchen v2"})');
    expect(await api.setArchived(client, 'p1', true)).toMatchObject({ ok: false, error: { kind: 'forbidden' } });
    expect(await api.setArchived(client, 'p1', false)).toEqual({ ok: true, value: null });
    expect(calls).toContain('update({"archived_at":null})');
    expect(await api.deleteProject(client, 'p1')).toEqual({ ok: true, value: null });
    expect(calls).toContain('delete()');
    expect(await api.deleteProject(client, 'p1')).toMatchObject({ ok: false, error: { kind: 'forbidden' } });
    expect(await api.renameProject(client, 'p1', '   ')).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('keeps no module-level client: every call uses the client it is given (FR-015)', () => {
    const source = readFileSync('src/infrastructure/projects/cloudProjects.ts', 'utf8');
    expect(source).toMatch(/import type \{ AppSupabaseClient \}/);
    expect(source).not.toMatch(/import \{[^}]*\bsupabase\b[^}]*\} from '@\/infrastructure\/supabase\/client'/);
    expect(source).not.toMatch(/createClient\(/);
  });
});
