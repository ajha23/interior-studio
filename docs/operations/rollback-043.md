# Rollback runbook: 043 cloud projects (`20261107043057_cloud_projects.sql`)

Constitution VIII: migrations are forward-only and are never edited or reverted once on `main`. A
rollback is a **new** migration (`npx supabase migration new rollback_cloud_projects`) that goes
through a PR and CI like any other change.

## Before choosing a rollback

Try a forward fix first. Most problems (a wrong error code, a check that is too strict) are one
`create or replace function private.save_project_version(...)` in a new migration. Roll back only
if the save path itself must return to how it was before 043.

Rolling back stops the app from saving to the studio. Merge the rollback PR only after the browser
code that calls `create_project` / `save_project_version` (PRs 043b and 043c) has been reverted or
switched off. Otherwise saves fail with "function does not exist", and the browser keeps them in
its offline queue.

## What the rollback migration does

1. **Restore the old save path**: recreate
   `public.save_project_version(p_project uuid, p_scene jsonb, p_schema_version int, p_scene_hash text, p_kind public.version_kind default 'autosave', p_message text default '')`
   with the body from `20261024082837_phase0_harden_functions.sql`. Add
   `doc_type` to its insert (`'legacy_v1'` is the only safe value, because the column is `not
   null`). Then `revoke all … from public, anon` and `grant execute … to authenticated`.
2. **Remove the new functions**: `drop function public.create_project(uuid, text, public.doc_type, jsonb, integer, uuid, text)`,
   `public.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text)`
   and their `private` bodies.
3. **Restore the table privileges**: `grant insert, update on public.projects to authenticated`.
4. **Restore the policies** as in `20261024082809_phase0_core_schema.sql` (with the `private.`
   helpers):
   - `projects_update`: `using (private.can_edit_org(org_id))`;
   - `projects_delete`: `using (private.can_admin_org(org_id))`.
5. **Drop the triggers**: `projects_stamp` and `projects_audit` on `public.projects`, and their
   functions.

## What stays, on purpose

- `project_versions.doc_type` and the `doc_type` type: dropping them would lose which versions are
  kitchens and which are homes. They're harmless to the old code once the old function writes
  `legacy_v1`.
- The `restore` value of `version_kind`: Postgres can't remove an enum value safely.
- `private.audit_log` (the audit trail is kept) and `private.idempotency_keys` (unreachable through
  the API; purge with `select private.purge_idempotency_keys()`).
- Every saved version. A rollback never deletes design data.

## Checks after the rollback

- Locally: `npm run db:reset && npm run db:test`. 08 is expected to fail and must be removed in the
  same PR; 01–07 pass. Then `npm run db:types && npm run db:types:check`.
- Production, before and after the push (Supabase SQL editor, read-only):
  `select count(*) from public.project_versions;`. The count must not change.
- Production, after the push:
  `select proname from pg_proc where proname in ('create_project', 'save_project_version');`.
  Only the old `save_project_version` remains.
