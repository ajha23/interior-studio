# 034 — Project Foundation and Cloud Persistence: Revised Acceptance Tests

All tests use synthetic users, tenants and design files. Never use production client PII. Tests marked P0 are release blockers.

## A. Identity and tenant context

1. [P0] Valid Supabase session resolves actor from verified auth context.
2. [P0] Missing/invalid/expired token returns 401.
3. [P0] Forged x-user-id, x-org-id, x-user-roles, x-team-id and x-client-id do not change actor, membership or scope.
4. [P0] User without active org_members row cannot read or mutate tenant data.
5. [P0] User in Organization A cannot enumerate/read Organization B projects, clients, spaces, revisions, mappings or assets.
6. [P0] Changing orgId in request body/query does not grant access.
7. [P0] Direct table query is tenant-isolated by RLS.
8. [P0] Direct RPC invocation cannot bypass actor/membership/resource checks.
9. [P0] Missing project context denies assigned/team/client/specific scoped permission.
10. [P0] Unsupported scope type is rejected, never interpreted as all_projects.

## B. Relational integrity

11. [P0] Projects table exists after migrations and project UUID is generated/validated.
12. [P0] Project client_id, when non-null, must reference a client in the same org.
13. [P0] Space must reference a project in the same org.
14. [P0] DesignRevision must reference the exact project/space/org tuple.
15. [P0] Parent revision must belong to the same space.
16. [P0] Space current_revision_id must point to a revision in that same space.
17. [P0] project_members cannot reference a nonexistent or cross-org project/member.
18. [P0] Duplicate legacy mapping key is rejected unless explicit import-as-copy creates a distinct source mapping.
19. [P0] Deleting/archiving an organization does not cascade-delete retained audit history.

## C. Client and consent

20. [P0] Project can be created with/without client according to approved policy.
21. [P0] Cross-org client association is rejected.
22. [P0] Consent event belongs to same org and client.
23. [P1] Multiple consent events for one client preserve history.
24. [P0] Consent withdrawal does not erase the original capture event.
25. [P0] User lacking PII permission cannot read unmasked client contact/site fields through base table, view, API or export.
26. [P0] Client PII does not appear in design snapshots, revision hashes or generic audit metadata.

## D. Kitchen and Home import compatibility

27. [P0] Valid `interior-studio/kitchen` file is parsed using existing migration and Zod validation.
28. [P0] Kitchen import creates one SaaS Project, one Kitchen Space and one initial revision.
29. [P0] Original KitchenProject.id and all scene element IDs remain unchanged inside the snapshot.
30. [P0] Invalid kitchen file creates no partial project/space/revision.
31. [P0] Unsupported future schema version is rejected and original local file remains available.
32. [P0] Valid `interior-studio/home` file creates one Project and one Space per HomeRoom.
33. [P0] Home kind, BHK, plot, levels, floorHeight and style are preserved.
34. [P0] Each room's name, type, level, x/z plan position and embedded design are preserved.
35. [P0] Original home ID, room IDs, derived roomProjectId and embedded editor IDs are preserved as provenance.
36. [P0] Every imported room design passes existing KitchenProjectSchema and domain validation.
37. [P0] Import retry with same idempotency identity does not create duplicate project/spaces/revisions.
38. [P1] Explicit import-as-copy creates a separate target project/mapping without overwriting the original mapping.
39. [P0] Exported imported kitchen file round-trips through existing parser with equivalent scene semantics.
40. [P0] Home import/export round-trip retains multi-room ordering and plan positions.

## E. Revision immutability and concurrency

41. [P0] First commit with expectedRevisionId NULL succeeds only if space has no current revision.
42. [P0] Revision stores immutable snapshot, format/schema/canonicalizer versions, actor/time and parent.
43. [P0] Commit updates current_revision_id and inserts revision atomically.
44. [P0] Two concurrent commits with the same expected revision: exactly one succeeds; the other receives 409 conflict.
45. [P0] Stale commit creates no revision, audit or outbox residue.
46. [P0] Previous revision snapshot cannot be updated/deleted by authenticated application role.
47. [P0] Revision parent from another space is rejected.
48. [P0] Revision ID from another tenant cannot be attached to a space.
49. [P0] Same idempotency key + same request hash returns original revision/result.
50. [P0] Same idempotency key + different request hash returns idempotency conflict.
51. [P0] Network failure after successful commit followed by retry returns original result.
52. [P0] Audit or outbox insertion failure rolls back revision and current pointer.

## F. Canonical hash

53. [P0] Same semantic snapshot produces same hash in supported browser and server runtimes.
54. [P0] Object key order does not change canonical hash.
55. [P0] Export savedAt timestamp does not change canonical scene hash.
56. [P0] Non-ASCII material/client-independent labels hash using UTF-8 correctly.
57. [P0] Half-millimetre centre coordinates serialize deterministically.
58. [P0] Canonicalizer version change is explicit and produces versioned behavior.
59. [P0] Golden vectors match independently verified SHA-256 values.

## G. Local cache and user experience

60. [P0] Existing IndexedDB project/home records remain readable.
61. [P0] Local record is not considered cloud-synced until server commit succeeds.
62. [P0] Import failure preserves local source record.
63. [P0] Local draft records base server revision and sync status.
64. [P0] Stale draft is preserved and user sees current server revision.
65. [P0] No silent last-write-wins.
66. [P0] Authorized second session can reopen the committed revision and see equivalent design.
67. [P0] Unauthorized second session cannot open project or revision.
68. [P1] Project/space rename does not change stable UUIDs or scene element IDs.

## H. RLS, storage and operations

69. [P0] RLS enabled for every new tenant-owned table.
70. [P0] SELECT, INSERT, UPDATE and DELETE behavior tested for each table/policy.
71. [P0] Direct authenticated writes to immutable revision tables are denied if writes are RPC-only.
72. [P0] SECURITY DEFINER functions pin search_path, revoke PUBLIC execute and validate auth.uid.
73. [P0] Storage object path cannot be guessed to bypass tenant/project authorization.
74. [P0] Audit partitions/default partition reject ordinary UPDATE/DELETE/TRUNCATE paths.
75. [P0] App logs contain no JWT, secrets or unmasked client PII.
76. [P0] Migration succeeds on clean DB.
77. [P0] Migration succeeds on representative restored DB without orphan/collision loss.
78. [P0] Backup restore and forward-recovery procedure is exercised.

## I. End-to-end pilot journeys

79. [P0] Designer creates/selects org → creates client (if required) → creates project → adds Kitchen Space → opens existing editor → edits cabinet via existing command → commits → reopens in second authorized session.
80. [P0] Designer imports an existing standalone kitchen file → validates → commits → reopens → exports equivalent file.
81. [P0] Designer imports whole-home file → reviews rooms → creates one Project and N Spaces → opens a room design → commits → reloads whole-home structure without losing floor positions.
82. [P0] Two designers open same space revision; first commits; second receives conflict and can preserve local draft.
83. [P0] User with wrong role/scope cannot create, edit, assign or commit.
84. [P0] CI runs lint, typecheck, unit tests, build, migration tests, RLS tests and E2E for the feature.

## Release gate

Do not enable cloud writes until all P0 tests pass, a security reviewer verifies the deployed auth/RLS boundary, and clean plus representative database migration suites pass. A green UI-only test is not evidence of tenant isolation.
