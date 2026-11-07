# Foundation Plan — Spec Index (Phases 0–6)

Created 2026-11-05 from *Interior Studio — Architecture Review & Foundation Plan* and *Interior Studio — Spec Kit Implementation Playbook*.

Each phase of the review's refactor plan has a detailed `spec.md` below. Run each one through the playbook loop (clarify → plan → tasks → analyze → implement → gate → converge) on its own branch. Since `spec.md` already exists, skip `/speckit-specify`: create the branch, point `.specify/feature.json` at the folder, then start at `/speckit-clarify`. The playbook's **Clarify answers** and **Plan constraints** are folded into each spec's Assumptions and Requirements.

| Phase | Spec | Depends on | Estimate | Gate |
| --- | --- | --- | --- | --- |
| 0 — Freeze and decide | [040-freeze-and-decide](040-freeze-and-decide/spec.md) — **done 2026-11-05** (PR #11) | — | 2 days | One branch, backup files, spend cap, constitution 2.3.0 merged |
| 1 — Identity and one database | [041-supabase-baseline](041-supabase-baseline/spec.md) — **done 2026-11-05** (PR #12) | 040 | 2–3 days | `db diff --linked` empty; pgTAP cross-tenant tests pass |
| 1 | [042-auth-and-studio-shell](042-auth-and-studio-shell/spec.md) — **done 2026-11-06** (PR #14) | 041 | 4–5 days | Google sign-in on preview; colleague joins studio |
| 1b — Self-serve and plans | [054-email-sign-in](054-email-sign-in/spec.md) — **merged 2026-11-06** (PR #15); gate pending the founder's Resend/SMTP setup | 042 | 2–3 days | Email magic link or 6-digit code signs a new user in; an email-sending account is connected in Supabase |
| 1b | 055-free-pro-plans *(to specify)* | 042 | 3–4 days | Free = design only; Pro modules (AI assistant and voice, AI renders, client packages, manufacturing exports, MEP/DXF) show as locked and the server refuses them on Free studios |
| 1b | 056-studio-retention *(to specify)* | 042, 054 | 2–3 days | Studios with no member sign-in for 90 days are deleted after a day-76 warning email; accounts are kept; Pro and in-house exempt |
| 1 | [043-cloud-projects](043-cloud-projects/spec.md) — 043a database **merged** (PR #18, pushed to production 2026-11-07); 043b studio projects **merged** (PR #19, preview gate passed); 043c conflicts/offline/history **in review** | 042 | 5–6 days | Same project on two devices; conflict and offline behave |
| 1 | [044-project-import](044-project-import/spec.md) | 043 | 2–3 days | Local projects moved; 8 earlier projects badged |
| 2 — Lock down | [045-ai-auth-and-credits](045-ai-auth-and-credits/spec.md) — **merged 2026-11-07** (PR #17); production migration and firewall rule verified; paid-call check on production | 042 | 3 days | Anonymous `curl` → 401; credits drop per call |
| 2 | [046-db-privilege-hardening](046-db-privilege-hardening/spec.md) | 043, 045, staging (048) | 2 days | Advisor zero findings on production |
| 2 | [047-headers-and-storage](047-headers-and-storage/spec.md) | 043 | 2 days | No CSP violations in a full session |
| 3 — CI/CD gate | [048-ci-db-gate](048-ci-db-gate/spec.md) | 041 | 4–5 days | Five throwaway PRs fail as designed; freeze lifted |
| 4 — Shell and performance | [049-routes-and-server-state](049-routes-and-server-state/spec.md) | 048 | 5 days | LCP < 2.5 s; first screen < 250 KB gz |
| 4 | [050-studio-shell-ux](050-studio-shell-ux/spec.md) | 049 | 5–6 days | Designer works a day without asking |
| 5 — Scale readiness | [051-render-jobs](051-render-jobs/spec.md) | 045, 047, 048 | 5 days | 4K render in background; worker scales to zero |
| 5 | [052-ops-readiness](052-ops-readiness/spec.md) | 048 | 5 days | Load test p95 < 500 ms; restore drill timed |
| 6 — Resume features | [053-feature-reentry-gate](053-feature-reentry-gate/spec.md) | 048, 052 | ongoing | 035 lifecycle merged with complete re-entry checklist |

Phase 1 is done only when the 041–044 gates pass on the **production** URL. The feature freeze lifts when 048 merges.

**Freeze exception (2026-11-06, founder):** specs 054–056 are product features that run inside the foundation queue rather than after 048. With open sign-up (every login gets a Free studio), Free/Pro limits and studio retention protect cost and security, so they cannot wait for the 048 freeze to lift.

**Execution order (review of 043–053, 2026-11-06, founder approved):** 042 ✅ → 054 (merged; gate pending) → **045** → 043 → 055 → 044 → 056 → 048 → 046 → 047 → 049 → 050 → 051 → 052 → 053. The review found:
- the five AI endpoints accept anonymous calls, so 045 comes first, and 055's server-side Pro gating for AI depends on 045's signed-in, studio-scoped AI path;
- projects are still saved only in the browser, so 056's retention has nothing in the database to delete until 043 ships;
- Vercel previews use the production database until 048 adds staging, so preview tests create real users there.

The table above keeps its phase grouping; this line is the order of work.

## Known issues (tracked, not yet specified)

- **Flaky e2e: `e2e/package.spec.ts` client-package 3D capture** (found 2026-11-06). "Standard 3D views are captured, go stale and are captured again" waits 20 s for "Captured 3 3D views", which a loaded runner sometimes misses. It failed on `main` CI at d1249cf and passed on PR #15's CI. Locally it fails 2/2 in a full run both before and after the catalog commit 83f4e4e, and passes 3/3 alone. Proposed fix (fits 048, the CI gate): wait on a "capture finished" signal instead of a fixed timeout, and run the 3D-capture specs in their own CI shard.
- **Flaky e2e: `e2e/package.spec.ts:15` "pages, notes, label edits … reopening"** (found 2026-11-07, during 043b). After the reload, clicking Deliverables waits 60 s for the button to be "stable". A diagnostic run found no render or save loop (header mutations 0, about 15 fps software WebGL). It failed 2 of 3 local full runs on 043b and passed on 043b's CI. Same family as the 3D flakes: render-settle timing on a loaded runner. Same proposed fix in 048.
- **Flaky e2e under load: `e2e/assistant.spec.ts` (Phase 2 acceptance) and `e2e/ai-layout-and-video-walkthrough.spec.ts`** (found 2026-11-07, during 043a). They failed in a local full run and passed 4/4 when run alone.
- **No offline app shell** (found 2026-11-07, 043c). Studio projects open offline in an open tab (cached copy, FR-011a), but a reload while offline cannot load the app, because there is no service worker. Candidate for 050 (shell UX) or 049.
- **Sign-out with unsent saves** (043b). Sign-out clears the device copy and the save queue (FR-011a), so saves still waiting offline are lost. Proposed: warn before signing out when saves are queued (050).
- **Client PII at rest** (043 analysis N2). `projects.client_name` is now in real use; constitution VII asks for encryption at rest and masking. Not specified yet.
- **Flaky e2e: `e2e/placement-and-interiors.spec.ts` "the height grip resizes in 3D in 10 mm steps within range"** (found 2026-11-06). Failed on PR #16's CI at f079206 (88 passed, 1 failed); the identical content passed on `main` at bda5761. Same family as the 3D-capture flake: 3D interaction timing on a loaded runner. Same proposed fix in 048: wait on explicit render/settle signals and shard the 3D specs.
