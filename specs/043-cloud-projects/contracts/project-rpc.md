# Contract — project database functions and table access

Every function is a `public` **security invoker** wrapper (granted to `authenticated` only) over a
`private` **security definer** body. The bodies have `search_path = ''`, use schema-qualified names,
and take the user from `auth.uid()`. No function takes an actor id. `EXECUTE` is revoked from
`public` and `anon` on both levels (XI, FR-005). Callers use `supabase.rpc(...)` (XII).

## `public.create_project`

```
create_project(
  p_org uuid, p_name text, p_client_name text default '',
  p_doc_type public.doc_type,            -- 'kitchen' | 'home' ('legacy_v1' rejected)
  p_scene jsonb, p_schema_version int,
  p_idempotency_key uuid
) returns table (id uuid, org_id uuid, name text, client_name text, current_version_no int,
                 created_by uuid, created_at timestamptz, updated_at timestamptz)
```

1. If `auth.uid()` is null → `42501`. If not `private.can_edit_org(p_org)` → `42501`.
2. Idempotency `(p_org, uid, 'create_project', key)`. If the key exists, return the same project.
3. If the size is over 2 MB → `PT413`. `legacy_v1` → `22023`.
4. Insert the project with a new id. The scene's `id` is set to that id (`jsonb_set`). Insert
   version 1 (kind `manual`, message `Created`), with the hash computed in the database. Set the
   head. Write audit `project.create`.

## `public.save_project_version`

```
save_project_version(
  p_project uuid, p_expected_version_no int, p_idempotency_key uuid,
  p_doc_type public.doc_type, p_scene jsonb, p_schema_version int,
  p_kind public.version_kind default 'autosave', p_message text default ''
) returns table (id uuid, project_id uuid, version_no int, kind public.version_kind,
                 message text, scene_hash text, size_bytes int, created_by uuid, created_at timestamptz)
```

1. If the project is missing or the caller is not a member → `PT404`. If the caller is not an
   editor → `42501`. The studio is taken from the project row, never from an argument.
2. Idempotency `(org, uid, 'save_version', key)`. If the key exists, return the original version,
   even if the head has moved since.
3. `select … for update` on the project.
   - Archived → `PT423`.
   - Size over 2 MB → `PT413`.
   - `p_scene->>'id' <> p_project::text` → `22023` ("scene belongs to another project").
   - `legacy_v1` → `22023`.
   - `current_version_no <> p_expected_version_no` → `PT409`, with detail
     `{"current_version_no": n}`.
4. Insert version `n + 1` with the hash computed in the database, move the head, set
   `updated_at`/`updated_by`, record the result on the key, and write audit `version.save` with
   `{version_no, kind}`.

The `message` is trimmed to 500 characters. `kind = 'revision'` is not accepted from callers
(`22023`).

## Table access (supabase-js `.from`)

| Operation | Call | Decided by |
| --- | --- | --- |
| List | `from('projects').select('id,name,client_name,status,current_version_no,archived_at,updated_at,created_by, owner:profiles!projects_created_by_fkey(full_name,email), head:project_versions!projects_current_version_fk(doc_type)').eq('org_id', org).order('updated_at', {ascending:false})` | `projects_select` |
| Open head | `from('project_versions').select('version_no,doc_type,schema_version,scene').eq('project_id', id).eq('version_no', head)` | `versions_select` |
| History | `from('project_versions').select('version_no,kind,message,doc_type,size_bytes,created_at, author:profiles(full_name,email)').eq('project_id', id).order('version_no', {ascending:false}).range(0, 49)` | `versions_select` |
| Rename | `from('projects').update({name}).eq('id', id).select()` | `projects_update` + column grant; trigger audits |
| Archive / unarchive | `update({archived_at: 'now'})` / `update({archived_at: null})` | same; the trigger stamps `now()` |
| Delete | `from('projects').delete().eq('id', id).select('id')`, after typing the name to confirm | `projects_delete` (admin, archived) |

Zero rows from an update or delete means it was denied (RLS), and the client says so. It never
reports success.

## pgTAP coverage (`supabase/tests/08_cloud_projects.test.sql`)

- Grants: the functions are executable by `authenticated` and not by `anon` or `public`; the
  private bodies have `search_path = ''`.
- Anonymous: create and save are refused, and no project can be selected.
- Own studio: a designer creates and saves (positive control); a viewer save gets `42501`; a viewer
  rename affects 0 rows.
- Other studio: create into studio B, save to B's project, and rename/archive/delete B's project
  are all refused, and B's rows are intact.
- CAS: expected head N−1 gets `PT409` with detail; expected N succeeds and becomes N+1.
- Idempotency: the same key twice gives one version and identical rows, even after another save
  moved the head.
- Size: 2 MB + 1 byte gets `PT413`, with no version and no audit row.
- Hash: the stored hash equals `sha256(scene::text)`. A hash argument does not exist.
- Archived: a save gets `PT423`. Unarchive by a designer works. A designer delete affects 0 rows.
  An admin delete of an active project affects 0 rows. An admin delete of an archived project
  affects 1 row and its audit row survives.
- Audit: one row each for create, save, rename, archive, unarchive and delete. `update`,
  `delete` and `truncate` on `private.audit_log` raise, even as `postgres`.
- Column grants: a designer `update projects set current_version_no = 99` raises `42501`.
- Backfill: every pre-existing version is `legacy_v1`, and `doc_type` has no default.

The existing `01_anon`, `02_cross_tenant` and `03_roles` tests are updated where direct
`insert into projects` is now revoked. "Designer can create a project" moves to `create_project`.
