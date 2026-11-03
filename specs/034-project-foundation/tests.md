# 034 — Project Foundation and Cloud Persistence: Acceptance Tests

Tests below are normative. Use synthetic tenant/user data and never production PII.

## A. Tenant and identity

1. Authenticated user with active organization membership can list that organization's projects.
2. User without membership cannot read or create projects in that organization.
3. Caller-supplied `x-user-id`, `x-org-id` and `x-user-roles` cannot change verified identity or grant access.
4. User belonging to Organization A cannot read Client, Project, Space or Revision belonging to Organization B.
5. A project cannot reference a client from another organization.
6. A space cannot reference a project from another organization.
7. Direct database queries and RPCs enforce the same tenant boundary as application APIs.

## B. Project and space

8. Authorized member creates a client and project in one organization.
9. Unauthorized member cannot create a project.
10. Project supports multiple spaces with stable IDs.
11. A Kitchen space opens the existing editor model without changing its geometry semantics.
12. Renaming a space does not recreate its design elements.
13. Project-member assignment affects only the configured resource scope.

## C. Revision persistence

14. First commit creates an immutable revision and sets current revision pointer.
15. Editing the design creates a new revision; the prior snapshot remains unchanged.
16. Commit with matching expected revision succeeds.
17. Commit with stale expected revision returns a conflict and does not overwrite the current revision.
18. Retrying the same idempotency key returns the original result without duplicate revision.
19. Invalid scene snapshot creates no revision.
20. Cross-tenant revision ID cannot be attached to another project's current pointer.
21. Revision hash is stable for identical canonical content.
22. Revision metadata includes schema version, actor, timestamp and parent revision.

## D. Local cache and import

23. Existing IndexedDB export can be imported through an authorized project/space selection.
24. Imported snapshot passes schema and domain invariant validation.
25. Import records provenance and creates a cloud revision.
26. A local draft is labelled unsynced and is not shown as server-approved.
27. Offline draft based on an old revision produces a conflict after another user commits a newer revision.
28. Conflict handling preserves the local draft and never silently applies last-write-wins.

## E. UI and E2E

29. Designer creates client, project and kitchen space.
30. Designer opens kitchen space in the existing 2D/3D editor.
31. Designer changes a cabinet through the existing command pipeline.
32. Save commits a cloud revision and displays the resulting revision.
33. Authorized second session reopens the same project and sees the committed design.
34. Unauthorized second session receives an access-denied result.
35. Project overview shows the current revision and space list.

## F. Security and reliability

36. RLS is enabled on all tenant-owned tables introduced by this feature.
37. RLS policy tests cover SELECT, INSERT, UPDATE and DELETE.
38. Same-tenant foreign-key constraints reject mismatched organization relationships.
39. Audit/outbox failure prevents a mutation when the event is mandatory.
40. Repository transaction failure leaves project current revision unchanged.
41. Object-storage references cannot be used to bypass tenant authorization.
42. Logs do not contain access tokens, secrets or unmasked client PII.

## Release gate

Feature 034 is not complete until all P0 tests pass, migrations are tested against a clean and representative database, the existing editor remains functional, and the complete client → project → space → edit → cloud commit → reopen E2E journey passes.
