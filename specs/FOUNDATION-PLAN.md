# Foundation Plan — Spec Index (Phases 0–6)

Created 2026-11-05 from *Interior Studio — Architecture Review & Foundation Plan* and *Interior Studio — Spec Kit Implementation Playbook*.

Each phase of the review's refactor plan has a detailed `spec.md` below. Run each one through the playbook loop (clarify → plan → tasks → analyze → implement → gate → converge) on its own branch. Since `spec.md` already exists, skip `/speckit-specify`: create the branch, point `.specify/feature.json` at the folder, then start at `/speckit-clarify`. The playbook's **Clarify answers** and **Plan constraints** are folded into each spec's Assumptions and Requirements.

| Phase | Spec | Depends on | Estimate | Gate |
| --- | --- | --- | --- | --- |
| 0 — Freeze and decide | [040-freeze-and-decide](040-freeze-and-decide/spec.md) — **done 2026-11-05** (PR #11) | — | 2 days | One branch, backup files, spend cap, constitution 2.3.0 merged |
| 1 — Identity and one database | [041-supabase-baseline](041-supabase-baseline/spec.md) — **done 2026-11-05** (PR #12) | 040 | 2–3 days | `db diff --linked` empty; pgTAP cross-tenant tests pass |
| 1 | [042-auth-and-studio-shell](042-auth-and-studio-shell/spec.md) — **done 2026-11-06** (PR #14) | 041 | 4–5 days | Google sign-in on preview; colleague joins studio |
| 1b — Self-serve and plans | [054-email-sign-in](054-email-sign-in/spec.md) | 042 | 2–3 days | Email magic link or 6-digit code signs a new user in; an email-sending account is connected in Supabase |
| 1b | 055-free-pro-plans *(to specify)* | 042 | 3–4 days | Free = design only; Pro modules (AI assistant and voice, AI renders, client packages, manufacturing exports, MEP/DXF) show as locked and the server refuses them on Free studios |
| 1b | 056-studio-retention *(to specify)* | 042, 054 | 2–3 days | Studios with no member sign-in for 90 days are deleted after a day-76 warning email; accounts are kept; Pro and in-house exempt |
| 1 | [043-cloud-projects](043-cloud-projects/spec.md) | 042 | 5–6 days | Same project on two devices; conflict and offline behave |
| 1 | [044-project-import](044-project-import/spec.md) | 043 | 2–3 days | Local projects moved; 8 earlier projects badged |
| 2 — Lock down | [045-ai-auth-and-credits](045-ai-auth-and-credits/spec.md) | 042 | 3 days | Anonymous `curl` → 401; credits drop per call |
| 2 | [046-db-privilege-hardening](046-db-privilege-hardening/spec.md) | 043, 045, staging (048) | 2 days | Advisor zero findings on production |
| 2 | [047-headers-and-storage](047-headers-and-storage/spec.md) | 043 | 2 days | No CSP violations in a full session |
| 3 — CI/CD gate | [048-ci-db-gate](048-ci-db-gate/spec.md) | 041 | 4–5 days | Five throwaway PRs fail as designed; freeze lifted |
| 4 — Shell and performance | [049-routes-and-server-state](049-routes-and-server-state/spec.md) | 048 | 5 days | LCP < 2.5 s; first screen < 250 KB gz |
| 4 | [050-studio-shell-ux](050-studio-shell-ux/spec.md) | 049 | 5–6 days | Designer works a day without asking |
| 5 — Scale readiness | [051-render-jobs](051-render-jobs/spec.md) | 045, 047, 048 | 5 days | 4K render in background; worker scales to zero |
| 5 | [052-ops-readiness](052-ops-readiness/spec.md) | 048 | 5 days | Load test p95 < 500 ms; restore drill timed |
| 6 — Resume features | [053-feature-reentry-gate](053-feature-reentry-gate/spec.md) | 048, 052 | ongoing | 035 lifecycle merged with complete re-entry checklist |

Phase 1 is done only when the 041–044 gates pass on the **production** URL. The feature freeze lifts when 048 merges.

**Freeze exception (2026-11-06, founder):** specs 054–056 are product features but run right after 042 and before 043. With open sign-up (every login gets a Free studio), Free/Pro limits and studio retention protect cost and security, so they cannot wait for the 048 freeze to lift.
