# Quickstart — validating 043

## Prerequisites

Docker running; `npm ci`; the local stack: `npm run db:start && npm run db:reset` (it applies the
migrations and seed). The app runs with `npm run dev` (port 5173) against local Supabase. Sign in
with `designer.a@example.test` / `password123` (studio `alpha`). The viewer is
`viewer.a@example.test`, and studio B's designer is `designer.b@example.test`.

## Database (PR 043a)

```bash
npm run db:test                      # all pgTAP files incl. 08_cloud_projects (contracts/project-rpc.md)
npm run db:test:project-concurrency  # 2 same-head saves → 1 ok + 1 PT409; 2 same-key saves → 1 version
npm run db:types && npm run db:types:check
```

Expected: every test passes. The concurrency script prints `OK` and exits 0. It refuses to run
against a non-local URL.

## App (PRs 043b, 043c)

| # | Scenario | How | Expected |
| --- | --- | --- | --- |
| 1 | US1 | Browser A creates "Kitchen 1" and adds a cabinet. Browser B (another profile, same user) opens Projects | It is listed with owner and time, and opens with the same cabinet |
| 2 | US2 | Change a width and wait | Saving… then Saved within about 2 s; History shows a new `autosave` |
| 3 | US2 | Ctrl+S with the message "client review" | History shows `manual · client review` |
| 4 | US2-4 | Sign in as the viewer and open the project | "View only"; edits refused; no request to `save_project_version` |
| 5 | US3 | Two tabs, edit both, tab 2 saves second | Tab 2 shows Conflict. "Save mine on top" makes N+2; History lists N+1 and N+2 |
| 6 | US4 | DevTools offline, 3 edits 3 s apart, online | Offline (queued 3), then Saved; 3 new versions in order |
| 7 | FR-011a | Offline, reload, open the project | The banner "Offline — showing the copy on this device" and the last design |
| 8 | US5 | History, then Open v1, then Restore | A read-only banner, then a new `restore` version on top; nothing deleted |
| 9 | FR-001 | Archive, Show archived, Unarchive; as admin, archive then Delete (typing the name) | Each step persists after reload; delete only on archived |
| 10 | FR-001a | An old browser-only kitchen | Listed under "On this device", opens and saves locally |

Automated: `e2e/cloud-projects.spec.ts` (scenarios 1–6 and 8–10 with Playwright `setOffline`).
Run the full check from AGENTS.md:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

## Gate (spec)

On the Vercel preview, with a person signed in: open one project on a laptop and on a phone
browser, force a conflict between two tabs, then go offline and come back. Record the preview URL
and the CI run link in the PR. Archive and delete the gate projects afterwards (previews share the
production database until 048).
