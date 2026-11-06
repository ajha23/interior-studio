# Implementation Plan: 054 — Email Sign-in (Magic Link and 6-Digit Code)

**Branch**: `054-email-sign-in` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/054-email-sign-in/spec.md`

## Summary

Add passwordless email sign-in next to Google. The sign-in screen gets an email step that calls `signInWithOtp`. A second step takes the 6-digit code (`verifyOtp` with `token`). A new `/auth/confirm` page takes the emailed link and signs in only when its "Sign in" button is clicked (`verifyOtp` with `token_hash`), so the link works on any device and survives mail scanners. Everything after sign-in (invites, the Free studio, activity) is 042's `start_session()`, unchanged. Two email templates live in `supabase/templates/`; the local stack uses them and the founder pastes them into production with the Resend SMTP settings. No migration, no package, no server.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite
**Primary Dependencies**: `@supabase/supabase-js@2.118.0` (existing; `signInWithOtp`, `verifyOtp`). No new package
**Storage**: none new. `localStorage` holds a 15-minute return-to hint (R7); `sessionStorage` holds the address being signed in, for this tab only
**Testing**: Vitest + Testing Library (screens, error mapping); Playwright against the local stack, reading mail from Mailpit (R8); existing pgTAP suites stay green (the unconfirmed-user cases in `06_self_serve` already cover "requested but never completed")
**Target Platform**: browser SPA on Vercel; Supabase Auth (hosted and local)
**Project Type**: web app (single Vite project)
**Performance Goals**: email arrives within 1 minute (SC-002); new user reaches their studio in under 2 minutes (SC-001)
**Constraints**: link and code valid 15 minutes, one email per address per 60 s, 10 emails an hour project-wide, 6 digits (R5). Password sign-in stays local/CI only (FR-012)
**Scale/Scope**: about 6 source files touched or added, 2 templates, 1 config file, 2 e2e specs, 1 doc

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | Check | Result |
| --- | --- | --- |
| XI — the database is the security boundary | No table, policy or function changes. Who gets a studio is still decided by `start_session()` (confirmed emails only). The browser only shows forms | ✅ |
| XII — official clients, no hand-written security code | Only `supabase.auth.signInWithOtp` / `verifyOtp`. No token parsing beyond reading `token_hash` from the URL and handing it to the client. No new package, no server | ✅ |
| No default ids | None added | ✅ |
| Evidence-based Done | Gate on the Vercel preview with a brand-new address (spec Gate); CI runs both e2e paths | ✅ |
| Branches ≤ 3 days | Estimate 2–3 days; the founder's Resend/DNS setup runs in parallel | ✅ |
| Feature freeze | 054 is covered by the founder's freeze exception in `specs/FOUNDATION-PLAN.md` (2026-11-06) | ✅ |
| SaaS section (X) | Present; items 2, 4 and 6 "Not applicable: foundation spec" with reasons; item 8 filled | ✅ |

Post-design re-check (after `research.md`, `data-model.md`, `contracts/`): unchanged, all ✅. The only new browser storage is a non-secret return-to hint.

## Project Structure

### Documentation (this feature)

```text
specs/054-email-sign-in/
├── plan.md              # this file
├── research.md          # R1–R9, from the local-stack spike
├── data-model.md        # states and storage keys (no schema change)
├── quickstart.md        # how to see it work locally and on the preview
├── contracts/
│   └── email-sign-in.md # screens, URL, client calls, error texts
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/features/auth/
├── SessionProvider.tsx        # + sendEmailCode, verifyEmailCode, confirmEmailLink (context API)
├── sessionContext.ts          # + the three functions on the context type
├── SignInScreen.tsx           # email step + code step; Google stays first; password form local only
├── EmailCodeForm.tsx          # NEW: 6-digit field, resend countdown, "use a different email"
├── EmailLinkConfirm.tsx       # NEW: /auth/confirm page with the one "Sign in" button
├── emailAuthErrors.ts         # NEW: Supabase error → message (R5), pure
├── returnTo.ts                # + email return-to hint in localStorage (R7)
└── *.test.ts(x)               # unit tests for each of the above
src/app/App.tsx                # route `token_hash` in location.search to EmailLinkConfirm before the gate

supabase/
├── config.toml                # templates, otp_expiry 900, max_frequency 60s, enable_confirmations true, redirect URLs /**
└── templates/
    ├── magic_link.html        # NEW: button link + 6-digit code, 15-minute note
    └── confirmation.html      # NEW: same body (new users when confirmations are on)

e2e/
├── support/mailpit.ts         # NEW: read the latest email for an address (local only)
├── email-sign-in.spec.ts      # NEW: code path, link path in a fresh context, cooldown, unknown = known
└── auth.spec.ts               # sign-in screen shows both options; no password field without the flag

docs/auth.md                   # email provider, SMTP fields (no secrets), limits, templates
```

**Structure Decision**: everything stays in `src/features/auth`, next to the 042 session code it extends. The confirmation page lives there too, because it is part of signing in and runs before the studio shell.

## Complexity Tracking

No constitution violations to justify.
