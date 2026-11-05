# Archived migrations from Features 034 to 034.2.2

**Do not apply these files.** They were written for Features 034, 034.1, 034.2, 034.2.1 and 034.2.2
and were **never applied to any database**. On 2026-11-05, `supabase migration list --remote`
showed none of them in the live project's history, which holds 17 different migrations from
2026-10-24. They were moved here from `supabase/migrations/` by spec 041 so `supabase db reset` builds
only the schema production actually runs.

| File | Intended for |
| --- | --- |
| `00001_security_hardening.sql` | 034: base security |
| `00002_rbac_and_entitlements.sql` | 034: roles and entitlements |
| `00003_dpdp_clients_and_consents.sql` | 034: clients and DPDP consents |
| `00004_append_only_audit_log.sql` | 034: append-only audit log |
| `00005_immutable_production_packages.sql` | 034: immutable production packages |
| `00006_dynamic_custom_roles.sql` | 034: custom roles |
| `00007_saas_subscriptions_and_entitlements.sql` | 034: subscriptions |
| `00008_canonical_projects_and_spaces.sql` | 034: projects, spaces, design revisions |
| `00009_cloud_persistence_hardening.sql` | 034.1 |
| `00010_security_and_transactional_remediation.sql` | 034.2 |
| `00011_final_security_and_persistence_closure.sql` | 034.2.1 |
| `00012_runtime_integration_and_security_verification.sql` | 034.2.2 |

## Ideas worth porting

The database patterns were sound even though the files never ran. Port them as **new** migrations
on the live baseline (`supabase migration new`), each with pgTAP tests. Don't copy these files.

- **Revision compare-and-swap.** Reject a save when the project's current version is not the one the
  editor started from. Planned in spec 043 (`p_expected_version_no` on `save_project_version`).
- **Idempotency keys.** A retried save returns the original result instead of creating a duplicate.
  Hash inside the database, never from the client; unique on `(org_id, actor_id, op, key)`.
  Planned in spec 043.
- **One append-only audit table.** Inserts only; updates and deletes rejected. Planned in spec 043.

## Not worth porting

- `spaces` and `design_revisions` tables: the live schema uses `projects` and `project_versions`.
- `outbox_events`: nothing ever consumed it. Long jobs use the job queue planned in spec 051.
- Service-role branches inside user-facing functions: forbidden by constitution principle XI.

See `docs/DECISIONS.md` (D-034) and `specs/041-supabase-baseline/spec.md`.
