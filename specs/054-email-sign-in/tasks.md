---
description: "Task list for 054 — Email Sign-in (Magic Link and 6-Digit Code)"
---

# Tasks: 054 — Email Sign-in (Magic Link and 6-Digit Code)

**Input**: Design documents from `specs/054-email-sign-in/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/email-sign-in.md](contracts/email-sign-in.md), [quickstart.md](quickstart.md)

**Tests**: Requested (FR-014, SaaS §8). Unit tests and Playwright come before each story's implementation, as in 042. No migration, so no new pgTAP; the existing suites must stay green.

**Organization**: US1 (code), US2 (link) and US3 (real inboxes) are P1; US4 (limits and abuse) is P2. US3 is founder setup and runs in parallel with all the code work.

**Evidence rule (constitution 2.3.0)**: a task is checked only when its command was run and its output recorded. **Founder-only**: anything that touches the Resend account, DNS or the live Supabase project's Auth settings. Agents never see, store or type the SMTP password or the Resend API key.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

- [X] T001 Verify the starting point from `/Users/akhil/WorkSpace/interior-studio-054`: `npm run db:start && npm run db:reset && npm run db:test` and `npm test` pass on branch `054-email-sign-in`; record the counts (expected pgTAP 452, unit 864) — **Done 2026-11-06**: `db:reset` ok; `db:test` → `Files=7, Tests=452 … Result: PASS`; `npm test` → 155 files, **874** passed (864 at 042 merge + 10 from the catalog commit on `main`).
- [X] T002 [P] Create `supabase/templates/magic_link.html` and `supabase/templates/confirmation.html` with the same body per `contracts/email-sign-in.md`: — **Done 2026-11-06**: both files created; `diff` of the bodies (after the 2-line header comment) is empty.
  - button "Sign in to Interior Studio" linking to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`;
  - the code `{{ .Token }}` in large type;
  - "The link and code work once, for 15 minutes.";
  - "If you didn't ask for this, ignore this email.";
  - inline styles only, no images, no tracking.
- [X] T003 Update `supabase/config.toml`: — **Done 2026-11-06**: settings applied; `npx supabase stop` then `db:start`, `db:reset` ok. (The package has no `db:stop` script; used `npx supabase stop`.)
  - `[auth.email]`: `enable_confirmations = true`, `max_frequency = "60s"`, `otp_expiry = 900`, `otp_length = 6`;
  - add `[auth.email.template.magic_link]` and `[auth.email.template.confirmation]`, each with subject `"Your Interior Studio sign-in code: {{ .Token }}"` and `content_path` pointing at the T002 files;
  - `[auth.rate_limit]` `email_sent = 1000`, with a comment: local only so repeated e2e runs never hit it; production is 10 an hour (T027, `docs/auth.md`);
  - `[auth]` `additional_redirect_urls` gains `"http://localhost:5173/**"` and `"http://localhost:5174/**"`.

  Then `npm run db:stop && npm run db:start && npm run db:reset`, and confirm the stack starts.
- [X] T004 Re-run the spike checks (research R1, R2) against the restarted stack with a throwaway script in the scratchpad (not committed): — **Done 2026-11-06**: a new address was unconfirmed before verification (so it got the confirmation template); subject `Your Interior Studio sign-in code: ######`, code also in the body; link `http://localhost:5174/auth/confirm?token_hash=…&type=email` with a `pkce_` prefix; fresh-client `verifyOtp(token_hash)` → signed in, `email_confirmed_at` set; the code after the link was used → `otp_expired`; a second send within 60 s → `over_email_send_rate_limit` "after 59 seconds" for new and confirmed users alike. `spike-*` users deleted.
  - a new address gets the **confirmation** template with a 6-digit code and a `pkce_` token hash;
  - `verifyOtp({ token_hash, type: 'email' })` signs in from a fresh client.

  Delete the `spike-*` users afterwards and record the output.

---

## Phase 2: Foundational (blocking prerequisites)

- [X] T005 [P] Write `src/features/auth/emailAuthErrors.test.ts` first. It covers every row of research R5: — **Done**: 10 cases.
  - `over_email_send_rate_limit` with "after 42 seconds" → wait message with `retryAfterSeconds: 42`;
  - the same code with "email rate limit exceeded" → hourly-cap message that mentions Google;
  - `otp_expired` → "That code is not right or has expired." (code context) and "This sign-in link has expired." (link context);
  - `over_request_rate_limit` → too-many-attempts message;
  - `email_address_invalid` and `validation_failed` → "Enter a valid email address.";
  - a 500 or unknown error → "We couldn't send the email. Try again or continue with Google." (send context).
- [X] T006 Implement `src/features/auth/emailAuthErrors.ts`: `emailAuthError(error, context: 'send' | 'code' | 'link'): { message: string; retryAfterSeconds?: number }`. Pure, no Supabase import beyond types. T005 passes. — **Done**: `npx vitest run src/features/auth/emailAuthErrors.test.ts` → 10 passed.
- [X] T007 [P] Write tests in `src/features/auth/returnTo.test.ts` for the email return-to hint (data-model "Browser storage"): — **Done**: 6 new cases, seen failing (`saveEmailReturnTo is not a function`).
  - `saveEmailReturnTo(hash)` stores `{ hash, at }` under `interior-studio:email-return-to` in localStorage;
  - `takeEmailReturnTo(now)` returns the hash once and removes it;
  - it ignores and removes values older than 15 minutes;
  - `clearEmailReturnTo()` runs on sign-out;
  - the hash passes the same validation as 042's return-to.
- [X] T008 Implement the hint in `src/features/auth/returnTo.ts` (`saveEmailReturnTo`, `takeEmailReturnTo`, `clearEmailReturnTo`), wrapping every storage access in try/catch. T007 passes. — **Done**: `returnTo.test.ts` → 10 passed. Also added the `savePendingEmail`/`readPendingEmail`/`clearPendingEmail` helpers (data-model key `interior-studio:email-pending`).
- [X] T009 Extend `src/features/auth/sessionContext.ts` with `sendEmailCode(email)`, `verifyEmailCode(email, code)` and `confirmEmailLink(tokenHash)`, all returning `EmailResult = { ok: true } | { ok: false; message: string; retryAfterSeconds?: number }` (contract). Add them to `src/features/auth/testClient.ts` fakes. — **Done**.
- [X] T010 Write tests in `src/features/auth/SessionProvider.test.tsx` using the fake client: — **Done**: 7 new cases, seen failing (7 failed | 5 passed).
  - `sendEmailCode` trims and lower-cases the address, then calls `signInWithOtp({ email, options: { emailRedirectTo: origin + '/auth/confirm', shouldCreateUser: true } })`, saves the email return-to hint, and maps errors through `emailAuthError(…, 'send')`;
  - `verifyEmailCode` calls `verifyOtp({ email, token, type: 'email' })` with spaces stripped from the code;
  - `confirmEmailLink` calls `verifyOtp({ token_hash, type: 'email' })`;
  - on `SIGNED_IN` the existing `enter()` runs `start_session` (unchanged 042 behaviour);
  - `signOut` also clears the email hint and `interior-studio:email-pending`.
- [X] T011 Implement T009–T010 in `src/features/auth/SessionProvider.tsx` and add the three functions to the context value. T010 passes and the existing 042 SessionProvider tests still pass. — **Done**: `npx vitest run src/features/auth` → 38 passed; `npm test` → 156 files, 897 passed. **Correction**: the first `npm run typecheck` failed (two test fakes of `SessionState` lacked the new functions; the exit code was hidden by a pipe and commit f87ebb1 went in anyway). Fixed with a shared `src/features/auth/testSessionState.ts`; re-run `npm run typecheck` → exit 0, `eslint src/features/auth src/features/studio` → exit 0, auth + studio tests → 60 passed.
- [X] T012 [P] Create `e2e/support/mailpit.ts`: — **Done**: lint clean.
  - `latestEmail(address, { after?: Date, timeoutMs = 10000 })` polls `GET {MAILPIT_URL}/api/v1/search?query=to:<address>` and then reads `GET /api/v1/message/<ID>`;
  - returns `{ subject, text, html, code, link }`. The code comes from `/\b\d{6}\b/` in the subject or body; the link is the first `href` containing `token_hash=`;
  - refuses any URL that is not `127.0.0.1` or `localhost` (same guard as `e2e/support/localAdmin.ts`);
  - `MAILPIT_URL` defaults to `http://127.0.0.1:54324`.

**Checkpoint**: `npm test` green; the context exposes the three email functions.

---

## Phase 3: User Story 1 — Sign in with a code from my email (Priority: P1) 🎯 MVP

**Goal**: an address (new or invited) gets an email, types the 6-digit code and lands in its studio.

**Independent Test**: local stack → enter a new address → read the code from Mailpit → enter it → `#/s/<slug>/projects` with the Free badge.

### Tests for User Story 1

- [X] T013 [P] [US1] Write `src/features/auth/SignInScreen.test.tsx` cases: — **Done**: 5 new cases plus the updated password-form case; seen failing (5 failed).
  - shows "Continue with Google", the "Work email" field and "Email me a sign-in code" without the password flag;
  - the password form appears only with `VITE_AUTH_PASSWORD_SIGN_IN=true`;
  - an invalid address is refused before calling `sendEmailCode`;
  - a successful send switches to the code step and stores the address in `sessionStorage['interior-studio:email-pending']`;
  - a send error shows its `role=alert` message on the email step.
- [X] T014 [P] [US1] Write `src/features/auth/EmailCodeForm.test.tsx`: — **Done**: 8 cases; seen failing (import missing).
  - status "We sent a code to <address>. It works for 15 minutes.";
  - the field is labelled "6-digit code" with `inputmode=numeric`, `autocomplete=one-time-code` and `maxlength=6`;
  - pasting "123 456" submits "123456";
  - a wrong code shows "That code is not right or has expired." and keeps the field;
  - "Use a different email" returns to the email step and clears the pending address;
  - "Resend email" is disabled with a countdown "Resend in N s" for 60 s after a send (fake timers), then resends.
- [X] T015 [US1] Write `e2e/email-sign-in.spec.ts` tests (no `storageState`, unique address per test, `Date.now()` in the address): — **Done**: 3 tests; seen failing (`locator.fill` timeout on "Work email", 3 failed / setup passed). Added `createLocalInvite` to `e2e/support/localAdmin.ts` (local-only guard).
  - **"a new address signs in with the emailed code and gets its own Free studio"**: send → `latestEmail` → type the code → `#/s/<slug>/projects`, `studio-plan` is "Free";
  - **"an invited address joins the inviting studio by code"**: create an invite for a new address in Alpha via `localAdmin`, then sign in by code → lands in Alpha, no switcher;
  - **"a wrong code shows the error and the right one still works"**.

  Confirm all three fail before implementation.

### Implementation for User Story 1

- [X] T016 [US1] Create `src/features/auth/EmailCodeForm.tsx` per the contract's code-step table, using the existing `Button`, `Input` and `Label` UI components. Errors use `role=alert`, the status uses `role=status`, and focus moves to the code field when the step opens. T014 passes. — **Done**: `EmailCodeForm.test.tsx` → 8 passed. `src/components/ui/input.tsx` now types props as `ComponentProps<'input'>` so it accepts `ref` (React 19).
- [X] T017 [US1] Rework `src/features/auth/SignInScreen.tsx`: — **Done**: `npx vitest run src/features/auth` → 51 passed; `npm run typecheck` exit 0; `npx eslint src e2e` exit 0; `npm test` → 157 files, 910 passed. The four e2e helpers that typed into the password form's "Email" now use `getByLabel('Email', { exact: true })`, since "Work email" also matches.
  - intro "Continue with Google, or get a sign-in code by email.";
  - Google first, then the email form;
  - steps `choose` → `code-sent` per data-model;
  - restore `code-sent` from `sessionStorage['interior-studio:email-pending']` on reload;
  - keep the password form behind the flag, labelled "Local test accounts only".

  T013 passes.
- [X] T018 [US1] Run `npx playwright test e2e/email-sign-in.spec.ts -g "code"` and `e2e/auth.spec.ts`. Update `e2e/auth.spec.ts` for the new copy and record the output. The US1 tests from T015 pass. — **Done**: `npx playwright test e2e/email-sign-in.spec.ts e2e/auth.spec.ts` → exit 0, **9 passed** (setup + 3 code tests + 5 auth). "A wrong code … the right one still works" passing confirms a wrong guess does not use up the code. `auth.spec.ts` also asserts the email option on every signed-out route (re-run: passed).

**Checkpoint**: code sign-in works end to end locally (quickstart step 5).

---

## Phase 4: User Story 2 — Sign in by clicking the link (Priority: P1)

**Goal**: the emailed link opens `/auth/confirm` on any device; only the "Sign in" click signs in.

**Independent Test**: request an email, open its link in a fresh browser context, click "Sign in", land in the studio.

### Tests for User Story 2

- [X] T019 [P] [US2] Write `src/features/auth/EmailLinkConfirm.test.tsx`: — **Done**: 6 cases + 1 for `readEmailLinkToken`; seen failing (import missing).
  - renders "Sign in to Interior Studio" and one "Sign in" button, and does **not** call `confirmEmailLink` on render;
  - the click calls `confirmEmailLink(tokenHash)`; on success it calls `history.replaceState` to `/` plus the email return-to hint or `#/`;
  - on error it shows "This sign-in link has expired." and a "Back to sign-in" link to `/`;
  - when already signed in it cleans the URL and goes to `#/` without a click;
  - missing `token_hash` shows the expired state.
- [X] T020 [P] [US2] Write tests in `src/app/App.test.tsx`: a `location.search` containing `token_hash` renders `EmailLinkConfirm` at any path (`/auth/confirm`, `/`) before the sign-in gate; without it, 042 routing is unchanged. — **Done, moved**: `App.tsx` has no unit test file and imports the whole editor, so the routing check lives in `EmailLinkGate` (`src/features/auth/EmailLinkConfirm.tsx`), tested in `EmailLinkConfirm.test.tsx` (2 cases: token → link page, then the app after sign-in; no token → app unchanged). `App.tsx` only wraps `SessionGate` in it.
- [X] T021 [US2] Add these tests to `e2e/email-sign-in.spec.ts`: — **Done**: 4 tests; seen failing (4 failed / setup passed). The "same browser" test uses a fresh address invited to Alpha (not seeded `designer.a`) so re-runs never hit the 60 s interval.
  - **"the link signs in on another device after one click"**: send in context A, open the link from `latestEmail` in a **new browser context** B, assert no session before the click, click "Sign in", land in the studio in B;
  - **"opening the link without clicking does not use it up"**: `page.request.get(link)` first (a scanner), then open and click → signs in;
  - **"a used link shows expired"**: sign in by code, then open the same email's link → "This sign-in link has expired.";
  - **"the link in the same browser restores the page asked for"**: as seeded `designer.a@example.test`, open `#/s/alpha/settings/members` signed out, send, open the link in a new tab of the **same** context, click "Sign in", and assert `#/s/alpha/settings/members`.

  Confirm they fail first.

### Implementation for User Story 2

- [X] T022 [US2] Create `src/features/auth/EmailLinkConfirm.tsx` per the contract's link-page section and the data-model state machine (`ready → verifying → done | expired`; `already signed in`). It reads `token_hash` with `new URLSearchParams(location.search)`; no other parsing. T019 passes. — **Done**: `EmailLinkConfirm.test.tsx` → 9 passed. `src/components/ui/button.tsx` now types props as `ComponentProps<'button'>` so it accepts `ref` (focus on "Sign in").
- [X] T023 [US2] Wire it into `src/app/App.tsx`: inside `SessionProvider`, if `location.search` has `token_hash`, render `EmailLinkConfirm` instead of `SessionGate`. T020 passes, and the existing App tests pass. — **Done**: `npx vitest run src/features/auth` → 60 passed; `npm run typecheck` exit 0; `npx eslint src e2e` exit 0; `npm test` → 158 files, 919 passed.
- [X] T024 [US2] Run `npx playwright test e2e/email-sign-in.spec.ts` and record the output; all US1 and US2 tests pass. — **Done**: `npx playwright test e2e/email-sign-in.spec.ts` → exit 0, **8 passed** (setup + 3 code + 4 link): another device after one click (token gone from the address bar), a scanner GET and a scanner that renders the page do not use the link, a used link shows expired and "Back to sign-in" works, and the same browser restores `#/s/alpha/settings/members` while the waiting tab signs in too.

**Checkpoint**: link sign-in works on a second browser context and survives a scanner GET.

---

## Phase 5: User Story 3 — Emails reach real inboxes (Priority: P1) — founder setup, runs in parallel

**Goal**: production sends from `noreply@<founder's domain>` via Resend with SPF/DKIM/DMARC passing.

**Independent Test**: from the preview, Gmail and Outlook addresses get the email in the inbox within 1 minute, and the headers show `spf=pass`, `dkim=pass`, `dmarc=pass`.

- [X] T025 [P] [US3] Write `docs/auth.md`, extending 042's file: — **Done**: `docs/auth.md` has an "Email sign-in (spec 054)" section: Resend SMTP fields (password = API key, pasted only in Supabase), limits (10 an hour, 900 s, 6 digits, 60 s), the template mapping and subject, and how to check SPF/DKIM/DMARC. No secrets.
  - add an "Email sign-in" section listing the Resend SMTP fields (host `smtp.resend.com`, port `465`, username `resend`, password "your Resend API key: paste it only in Supabase"), the sender `noreply@<domain>` and the name "Interior Studio";
  - the limits: emails 10 an hour, OTP expiry 900 s, OTP length 6, minimum interval 60 s;
  - the template mapping: "Confirm signup" ← `supabase/templates/confirmation.html`, "Magic Link" ← `supabase/templates/magic_link.html`, plus the subject;
  - change the Email provider row from "spec 054 adds magic link" to the live state. No secrets.
- [ ] T026 [US3] **Founder**:
  1. Create a Resend account and add the domain.
  2. Add the DNS records Resend shows (SPF `TXT`, DKIM `TXT`/`CNAME`, and a DMARC `TXT` such as `v=DMARC1; p=none; rua=mailto:<you>`) at the domain's DNS host.
  3. Wait until Resend shows the domain **Verified**.
  4. Create an API key with "Sending access" only for that domain.

  Report "verified" and the sender address. The key is never pasted to the agent.
- [ ] T027 [US3] **Founder**: in Supabase → Authentication → **SMTP Settings**, enable custom SMTP with the T025 values (paste the Resend API key as the password, there only). In **Rate Limits**, set emails sent per hour to **10**. In **Email** (provider settings), set OTP expiry **900** and length **6**, and keep "Confirm email" on. Report "done".
- [ ] T028 [US3] **Founder**: in Supabase → Authentication → **Email Templates**, paste the subject and HTML of `confirmation.html` into "Confirm signup" and of `magic_link.html` into "Magic Link"; save both. Report "done".
- [ ] T029 [US3] After T027–T028 and a preview (T035): the founder requests a sign-in email on the preview for a Gmail and an Outlook address and shares Gmail's "Show original" summary (or the raw headers) for each. The agent records the sender, `spf=pass`, `dkim=pass`, `dmarc=pass`, inbox not spam, and the arrival time (SC-002). The agent reads no Auth settings and holds no secret.

---

## Phase 6: User Story 4 — Abuse cannot run up cost or flood an inbox (Priority: P2)

**Goal**: cooldown, cap and attempt limits come from Supabase Auth and each shows its own message; unknown and known addresses look the same.

**Independent Test**: two sends within 60 s show the wait message; unknown and known addresses produce the same screen and response shape.

- [X] T030 [P] [US4] Add these tests to `e2e/email-sign-in.spec.ts`: — **Done**: 2 tests (`e2e/email-sign-in.spec.ts`, "User Story 4"). They passed on the first run, since US1 already built the behaviour; to show they test something, `emailAuthError`'s wait text was broken on purpose → the cooldown test failed ("1 failed"), and the file was restored (no diff).
  - **"asking again within 60 seconds shows the wait message and no second email"**: send, go back with "Use a different email", re-enter the same address and send → wait message; Mailpit still has exactly one email for the address;
  - **"an unknown address and a known one look the same"**: send for a new address and for seeded `viewer.b@example.test`; both show the same status text, and the `signInWithOtp` responses captured with `page.waitForResponse('**/auth/v1/otp')` have the same status and body shape (SC-004).

  Confirm they fail if the messages are missing.
- [X] T031 [US4] Make T030 pass. The wait message and countdown use `retryAfterSeconds` from `emailAuthError`, and `EmailCodeForm` starts its countdown from it. Run `npx playwright test e2e/email-sign-in.spec.ts` and record the output. — **Done**: `npx playwright test e2e/email-sign-in.spec.ts -g "User Story 4"` → 3 passed (setup + 2). The "known" address is a fresh confirmed user (`ensureLocalUser`), so re-runs never meet the 60 s interval.

---

## Phase 7: Polish & Gate

- [X] T032 [P] Accessibility pass on the new screens, run in `src/features/auth/*.test.tsx`: — **Done**: labels, `role=alert`/`role=status` and focus (code field, link-page button) were already asserted; added keyboard-only submit tests in `EmailCodeForm.test.tsx` and `SignInScreen.test.tsx`. `npx vitest run src/features/auth` → 62 passed.
  - every input has a label;
  - errors use `role=alert` and statuses use `role=status`;
  - focus moves to the code field and to the "Sign in" button on the link page;
  - keyboard only: Tab, Enter.
- [X] T033 Update `specs/FOUNDATION-PLAN.md` with 054 **in review** (PR number), as part of T035's push. "Done" is set by the next spec's branch after the merge, as in 042. — **Done**: PR #15 was merged by the founder on 2026-11-06 at 15:40 UTC, before T025 and T030–T034 were committed; that work ships in a follow-up PR. The plan row says "merged (PR #15); gate pending" until T037–T038.
- [X] T034 Run the five-stage gate plus pgTAP and record the output: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`, and `npm run db:reset && npm run db:test` (expect 452/452, unchanged). — **Done, with 2 failures not from 054**: lint, typecheck, test (158 files, **921** passed), build → exit 0; `db:reset` → exit 0; `db:test` → `Files=7, Tests=452`, PASS; `npm run e2e` → exit 1, **87 passed, 2 failed**, both in `e2e/package.spec.ts` (client-package 3D capture timing out under load). All 9 email sign-in tests passed. `npx playwright test e2e/package.spec.ts` alone → **3 passed**. The same 3D-views test has failed on `main` CI since d1249cf (the 042 merge, which also brought in the catalog commit 83f4e4e); PR #14's CI on 45932b1 was green. Tracked separately.
- [ ] T035 Push the branch and open a draft PR. Record the links for green `check`, `db` and `e2e` jobs.
- [ ] T036 Check the preview with a browser probe: the sign-in screen shows Google, the "Work email" field and "Email me a sign-in code"; **no password field** (SC-005, FR-012); no config error, no page errors.
- [ ] T037 **Founder gate** (spec Gate, after T026–T028) on the PR's Vercel preview with a brand-new address:
  1. "Email me a sign-in code" → the email arrives in the inbox from "Interior Studio <noreply@…>";
  2. sign in with the code;
  3. sign out, request again, open the link on a phone or in a private window, and click "Sign in";
  4. land in the address's own Free studio.

  Record the preview URL, the sender shown and the time from send to the project list (SC-001 < 2 min).
- [ ] T038 The agent verifies the gate in production read-only:
  - the new user exists with `email_confirmed_at` set and provider `email`, and exactly one Free studio with that user as owner;
  - **FR-008**: the founder also signs in **by email** with the address of their Google account. That user id now has both `google` and `email` identities, is still in Interior Studio, and has no new studio. Then complete the PR description (CI links, preview URL, gate evidence, the founder settings applied, no secrets) and mark it ready. The founder merges.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1 → US2.** US2 reuses the context functions (T011) and the Mailpit helper (T012).
- **US3 (T025–T029)** can start now; T026 waits on DNS propagation. T029 needs T027–T028 and a preview (T035).
- **US4** needs US1's screens (T016–T017).
- **Gate**: T036 after T035; T037 after T026–T028 and T036; T038 after T037.

### Within stories

Tests first and seen failing (T013–T015 before T016–T017; T019–T021 before T022–T023; T030 before T031).

### Accepted test gaps (analysis 2026-11-06)

- The project-wide hourly-cap message (US4 scenario 2) is unit-tested only (T005). Hitting the real cap locally would block the other e2e tests.
- The 15-minute expiry (FR-005) is set by configuration (T003, T027) and not waited out in a test. Single use and supersession are tested (T004, T021).

## Parallel Examples

- Phase 1: T002 alongside T001; T003 after T002.
- Phase 2: T005, T007 and T012 together; then T006, T008 and T009–T011.
- US1: T013 and T014 together, then T016 and T017.
- US2: T019 and T020 together.
- Founder track: T026 → T027 → T028 while the agent works on US1/US2.

## Implementation Strategy

### MVP (US1)

The code path alone meets the founder's goal on any device. Ship-ready once US3's setup is done.

### Incremental delivery

1. US1 (code)
2. US2 (link)
3. US4 (limits UI)
4. Gate

US3 is configuration and runs alongside.
