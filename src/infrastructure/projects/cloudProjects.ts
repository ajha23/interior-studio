/**
 * Studio projects in the database (spec 043, FR-015): the only module that reads or writes
 * `projects` and `project_versions`. Every function takes the signed-in supabase-js client; there is
 * no module-level instance. Row-level security and the two database functions decide every read
 * and write (contracts/project-rpc.md); this module only turns their answers into typed results.
 *
 * A scene is stored as the domain document itself (a kitchen project or a home). Loading rebuilds
 * the file envelope and goes through the normal parsers, so migrations, Zod and invariants apply.
 */
import {
  FILE_FORMAT,
  HOME_FORMAT,
  HOME_SCHEMA_VERSION,
  SCHEMA_VERSION,
  parseHomeFile,
  parseProjectFile,
  type Home,
  type KitchenProject,
} from '@/domain';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';

export type DocType = 'kitchen' | 'home';

/** A cloud document: one kitchen, or one home with its rooms inside it (FR-014). */
export type CloudDoc = { type: 'kitchen'; project: KitchenProject } | { type: 'home'; home: Home };

export type CloudErrorKind =
  | 'conflict'
  | 'too_large'
  | 'archived'
  | 'not_found'
  | 'forbidden'
  | 'signed_out'
  | 'invalid'
  | 'legacy'
  | 'offline'
  | 'server';

export interface CloudError {
  kind: CloudErrorKind;
  message: string;
  /** The head the database has now; set on a conflict. */
  currentVersionNo?: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CloudError };

export interface ProjectRow {
  id: string;
  name: string;
  clientName: string;
  status: string;
  headVersionNo: number;
  /** The head's document type; `legacy_v1` heads open after spec 044. */
  docType: DocType | 'legacy_v1' | null;
  archivedAt: string | null;
  updatedAt: string;
  ownerId: string | null;
  ownerName: string;
}

export interface OpenedDoc {
  versionNo: number;
  doc: CloudDoc;
}

export interface SavedVersion {
  id: string;
  versionNo: number;
}

export type VersionKind = 'autosave' | 'manual' | 'restore';

const MESSAGES: Record<Exclude<CloudErrorKind, 'conflict' | 'server' | 'invalid'>, string> = {
  too_large: "This design is larger than 2 MB and can't be saved to the studio.",
  archived: 'This project was archived. Your changes are kept on this device.',
  not_found: "This project isn't in this studio.",
  forbidden: 'View only: ask a studio owner for edit access.',
  signed_out: 'Your session ended. Sign in again to save.',
  legacy: 'Older format: opens after the import update.',
  offline: "You're offline — this needs a connection.",
};

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** Maps a PostgREST or network error to what the app does next (research R5). */
export function toCloudError(e: DbError): CloudError {
  const code = e.code ?? '';
  if (code === 'PT409') {
    let currentVersionNo: number | undefined;
    try {
      const n = (JSON.parse(e.details ?? '{}') as { current_version_no?: unknown }).current_version_no;
      if (typeof n === 'number') currentVersionNo = n;
    } catch {
      // A conflict without detail is still a conflict; the dialog re-reads the head.
    }
    return { kind: 'conflict', message: 'Someone else saved this project.', currentVersionNo };
  }
  if (code === 'PT413') return { kind: 'too_large', message: MESSAGES.too_large };
  if (code === 'PT423') return { kind: 'archived', message: MESSAGES.archived };
  if (code === 'PT404') return { kind: 'not_found', message: MESSAGES.not_found };
  if (code === '42501') return { kind: 'forbidden', message: MESSAGES.forbidden };
  if (code === 'PT401') return { kind: 'signed_out', message: MESSAGES.signed_out };
  if (code === '22023' || code === '23514') return { kind: 'invalid', message: e.message ?? 'The design could not be saved.' };
  // supabase-js reports a failed fetch as an error without a database code.
  if (!code && /fetch|network|load failed/i.test(e.message ?? '')) return { kind: 'offline', message: MESSAGES.offline };
  return { kind: 'server', message: e.message ? `The studio could not save: ${e.message}` : 'The studio could not save. Try again.' };
}

const fail = <T>(e: DbError): Result<T> => ({ ok: false, error: toCloudError(e) });
const thrown = <T>(e: unknown): Result<T> => fail({ message: e instanceof Error ? e.message : String(e) });

/** The scene and its schema version, as stored. */
export function sceneOf(doc: CloudDoc): { docType: DocType; scene: KitchenProject | Home; schemaVersion: number } {
  return doc.type === 'kitchen'
    ? { docType: 'kitchen', scene: doc.project, schemaVersion: SCHEMA_VERSION }
    : { docType: 'home', scene: doc.home, schemaVersion: HOME_SCHEMA_VERSION };
}

/** The document's id, which for a cloud document is its project's id. */
export const docId = (doc: CloudDoc) => (doc.type === 'kitchen' ? doc.project.id : doc.home.id);

/** Parses a stored scene through the file parsers (migrations, Zod, invariants). */
export function parseScene(docType: string, schemaVersion: number, scene: unknown): Result<CloudDoc> {
  if (docType === 'kitchen') {
    const parsed = parseProjectFile(JSON.stringify({ format: FILE_FORMAT, schemaVersion, savedAt: new Date(0).toISOString(), project: scene }));
    return parsed.ok ? { ok: true, value: { type: 'kitchen', project: parsed.project } } : { ok: false, error: { kind: 'invalid', message: `This project could not be opened: ${parsed.errors.join(' ')}` } };
  }
  if (docType === 'home') {
    const parsed = parseHomeFile(JSON.stringify({ format: HOME_FORMAT, schemaVersion, savedAt: new Date(0).toISOString(), home: scene }));
    return parsed.ok ? { ok: true, value: { type: 'home', home: parsed.home } } : { ok: false, error: { kind: 'invalid', message: `This home could not be opened: ${parsed.errors.join(' ')}` } };
  }
  return { ok: false, error: { kind: 'legacy', message: MESSAGES.legacy } };
}

const LIST_COLUMNS =
  'id, name, client_name, status, current_version_no, archived_at, updated_at, created_by, owner:profiles!projects_created_by_fkey(full_name, email), head:project_versions!projects_current_version_fk(doc_type)';

interface ListRow {
  id: string;
  name: string;
  client_name: string;
  status: string;
  current_version_no: number;
  archived_at: string | null;
  updated_at: string;
  created_by: string | null;
  owner: { full_name: string | null; email: string } | null;
  head: { doc_type: string } | null;
}

/** The studio's projects, newest first; archived ones too (the page filters them). */
export async function listProjects(client: AppSupabaseClient, orgId: string): Promise<Result<ProjectRow[]>> {
  try {
    const { data, error } = await client.from('projects').select(LIST_COLUMNS).eq('org_id', orgId).order('updated_at', { ascending: false });
    if (error) return fail(error);
    const rows = (data ?? []) as unknown as ListRow[];
    return {
      ok: true,
      value: rows.map((r) => ({
        id: r.id,
        name: r.name,
        clientName: r.client_name,
        status: r.status,
        headVersionNo: r.current_version_no,
        docType: (r.head?.doc_type as ProjectRow['docType']) ?? null,
        archivedAt: r.archived_at,
        updatedAt: r.updated_at,
        ownerId: r.created_by,
        ownerName: r.owner?.full_name || r.owner?.email || 'Former member',
      })),
    };
  } catch (e) {
    return thrown(e);
  }
}

/** The head version of a project, parsed. Missing and not-in-this-studio look the same. */
export async function openHead(client: AppSupabaseClient, projectId: string): Promise<Result<OpenedDoc>> {
  try {
    const { data, error } = await client
      .from('projects')
      .select('current_version_no, head:project_versions!projects_current_version_fk(version_no, doc_type, schema_version, scene)')
      .eq('id', projectId)
      .maybeSingle();
    if (error) return fail(error);
    const row = data as unknown as { current_version_no: number; head: { version_no: number; doc_type: string; schema_version: number; scene: unknown } | null } | null;
    if (!row?.head) return { ok: false, error: { kind: 'not_found', message: MESSAGES.not_found } };
    const doc = parseScene(row.head.doc_type, row.head.schema_version, row.head.scene);
    return doc.ok ? { ok: true, value: { versionNo: row.head.version_no, doc: doc.value } } : doc;
  } catch (e) {
    return thrown(e);
  }
}

/** Creates a project with its first version; the returned document carries the new project id. */
export async function createProject(
  client: AppSupabaseClient,
  input: { orgId: string; name: string; clientName?: string; doc: CloudDoc; idempotencyKey: string },
): Promise<Result<OpenedDoc & { id: string }>> {
  const { docType, scene, schemaVersion } = sceneOf(input.doc);
  try {
    const { data, error } = await client.rpc('create_project', {
      p_org: input.orgId,
      p_name: input.name,
      p_client_name: input.clientName ?? '',
      p_doc_type: docType,
      p_scene: scene as never,
      p_schema_version: schemaVersion,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) return fail(error);
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; name: string } | undefined;
    if (!row) return { ok: false, error: { kind: 'server', message: 'The studio did not return the new project.' } };
    const doc: CloudDoc =
      input.doc.type === 'kitchen' ? { type: 'kitchen', project: { ...input.doc.project, id: row.id, name: row.name } } : { type: 'home', home: { ...input.doc.home, id: row.id, name: row.name } };
    return { ok: true, value: { id: row.id, versionNo: 1, doc } };
  } catch (e) {
    return thrown(e);
  }
}

/** Saves the document as the next version, only if the head is still `expectedVersionNo`. */
export async function saveVersion(
  client: AppSupabaseClient,
  input: { projectId: string; expectedVersionNo: number; idempotencyKey: string; doc: CloudDoc; kind: VersionKind; message?: string },
): Promise<Result<SavedVersion>> {
  const { docType, scene, schemaVersion } = sceneOf(input.doc);
  try {
    const { data, error } = await client.rpc('save_project_version', {
      p_project: input.projectId,
      p_expected_version_no: input.expectedVersionNo,
      p_idempotency_key: input.idempotencyKey,
      p_doc_type: docType,
      p_scene: scene as never,
      p_schema_version: schemaVersion,
      p_kind: input.kind,
      p_message: input.message ?? '',
    });
    if (error) return fail(error);
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; version_no: number } | undefined;
    if (!row) return { ok: false, error: { kind: 'server', message: 'The studio did not confirm the save.' } };
    return { ok: true, value: { id: row.id, versionNo: row.version_no } };
  } catch (e) {
    return thrown(e);
  }
}

/** Zero rows back from an update or delete means row-level security said no. */
async function changeOne(run: () => PromiseLike<{ data: unknown[] | null; error: DbError | null }>): Promise<Result<null>> {
  try {
    const { data, error } = await run();
    if (error) return fail(error);
    if (!data?.length) return { ok: false, error: { kind: 'forbidden', message: 'You cannot change this project.' } };
    return { ok: true, value: null };
  } catch (e) {
    return thrown(e);
  }
}

export function renameProject(client: AppSupabaseClient, projectId: string, name: string): Promise<Result<null>> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 160) return Promise.resolve({ ok: false, error: { kind: 'invalid', message: 'Give the project a name of 1 to 160 characters.' } });
  return changeOne(() => client.from('projects').update({ name: trimmed }).eq('id', projectId).select('id'));
}

/** Archives (the database stamps the time) or unarchives a project. */
export function setArchived(client: AppSupabaseClient, projectId: string, archived: boolean): Promise<Result<null>> {
  return changeOne(() =>
    client
      .from('projects')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', projectId)
      .select('id'),
  );
}

/** Deletes an archived project and its versions (owners and admins only; RLS decides). */
export function deleteProject(client: AppSupabaseClient, projectId: string): Promise<Result<null>> {
  return changeOne(() => client.from('projects').delete().eq('id', projectId).select('id'));
}
