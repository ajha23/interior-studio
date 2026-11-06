# Feature Specification: 054 — Email Sign-in (Magic Link and 6-Digit Code)

**Feature Branch**: `054-email-sign-in`
**Created**: 2026-11-06
**Status**: Draft
**Phase**: 1b — Self-serve and plans (estimate 2–3 days)
**Depends on**: 042
**Blocks**: 056 (reuses the same email-sending account)
**Source**: Founder decision 2026-11-06 (spec 042 clarifications): people sign in with Google *or* their business email; a first sign-in without an invite gets a Free studio.

## Context

Since spec 042, production offers only "Continue with Google". Studios whose staff use Microsoft 365 or another business mail system cannot sign in. The founder decided that email sign-in is passwordless: one email carries both a sign-in link and a 6-digit code, so it works whether the person opens the email on the same computer or on a phone.

What 042 already guarantees and this spec relies on:
- After any sign-in the app calls `start_session()`. It accepts pending invites, creates the user's own Free studio if they have none, and records studio activity (042 FR-017).
- Only confirmed email addresses gain invites or a studio (042 FR-015). Completing an email sign-in confirms the address.
- The live project has the Email provider enabled with confirmation required. It uses Supabase's built-in mailer, which only delivers to the project team's own addresses and is limited to a few emails an hour. So real users cannot receive sign-in emails until an email-sending account is connected.
- Password sign-in exists only in local and CI builds (`VITE_AUTH_PASSWORD_SIGN_IN`) and never in production.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign in with a code from my email (Priority: P1)

A designer whose studio uses Outlook opens Interior Studio, types their work email and asks for a sign-in email. Within a minute an "Interior Studio" email arrives with a 6-digit code. They type the code and land in their studio: the inviting studio if they were invited, otherwise their own new Free studio.

**Why this priority**: The code works on any device and in any browser, so it is the path that never fails. It alone delivers the founder's goal.

**Independent Test**: On the local stack, enter a new address, read the code from the local mail catcher, enter it, and land on `#/s/<slug>/projects` with a Free badge.

**Acceptance Scenarios**:

1. **Given** I am signed out, **When** I enter my email and choose "Email me a sign-in code", **Then** the screen says a code was sent to that address and shows a 6-digit entry field, "Use a different email" and a resend option.
2. **Given** I received the email, **When** I enter the 6-digit code (typed or pasted), **Then** I am signed in and taken to the page I first asked for, or to my studio.
3. **Given** I am new and have no invite, **When** I complete sign-in, **Then** I get my own Free studio, exactly as with Google.
4. **Given** I was invited by email, **When** I complete sign-in with that address, **Then** I join the inviting studio with the invited role and no extra studio is created.
5. **Given** I enter a wrong code, **When** I submit, **Then** I see "That code is not right or has expired" and can try again or request a new email.

---

### User Story 2 — Sign in by clicking the link (Priority: P1)

The same email contains a "Sign in to Interior Studio" button. Clicking it in the same browser signs the person in without typing anything.

**Why this priority**: Most people click links in emails; the code is the fallback.

**Independent Test**: On the local stack, request an email, open the link from the mail catcher in the same browser, and land in the studio.

**Acceptance Scenarios**:

1. **Given** I requested an email in this browser, **When** I click the link, **Then** I am signed in and land where I asked to go.
2. **Given** I open the link in a different browser or on another device, **When** the page loads, **Then** I see a clear message: the link only works in the browser where it was requested, so enter the 6-digit code from the same email there instead. I am not signed in on that device.
3. **Given** the link has expired or was already used, **When** I open it, **Then** I see "This sign-in link has expired" with a way back to the sign-in screen.

---

### User Story 3 — Emails reach real inboxes (Priority: P1)

The founder connects an email-sending account to the live project so sign-in emails come from the studio's own domain, reach Gmail and Outlook inboxes rather than spam, and are not capped at the built-in mailer's few emails an hour.

**Why this priority**: Without it no real user receives the email. The founder must do it before the gate.

**Independent Test**: The founder requests a sign-in email on the preview for a Gmail and an Outlook address. Both arrive in the inbox within 1 minute, the sender is "Interior Studio <…@founder's domain>", and the domain checks (SPF, DKIM, DMARC) pass in the message headers.

**Acceptance Scenarios**:

1. **Given** the sending account is connected, **When** a sign-in email is sent, **Then** it comes from the founder's domain, not Supabase's.
2. **Given** the email templates in the repo, **When** the founder copies them into the live project, **Then** new-user and returning-user emails look the same: brand name, the button, the 6-digit code, how long they stay valid, and "If you didn't ask for this, ignore this email."

---

### User Story 4 — Abuse cannot run up cost or flood someone's inbox (Priority: P2)

Anyone can type any address, so someone could try to send many emails to a stranger or guess codes.

**Why this priority**: Open sign-up (042) makes this reachable; limits protect the sending account's reputation and cost.

**Independent Test**: On the local stack, request two emails for the same address within the cooldown and see the "wait" message; submit wrong codes repeatedly and see the limit message.

**Acceptance Scenarios**:

1. **Given** I just asked for an email, **When** I ask again within 60 seconds, **Then** no email is sent and I see how many seconds to wait. The resend button counts down.
2. **Given** the project-wide hourly email limit is reached, **When** anyone asks for an email, **Then** they see "Too many sign-in emails right now. Try again in a few minutes or continue with Google."
3. **Given** I enter an address with no account, **When** I ask for an email, **Then** the screen looks exactly as it does for an existing account (nobody can learn who has an account).

### Edge Cases

- The same address used with Google earlier: the email sign-in reaches the same account and the same studios (one person, one account).
- Email typed with capitals or spaces: it is trimmed and lower-cased before sending.
- A second email requested: only the newest email's link and code work.
- An invalid address format: the screen refuses it before sending.
- The user closes the tab after requesting: on returning, the sign-in screen asks for the email again; the code from the earlier email still works if it is still valid.
- An email client that pre-opens links (security scanners): the link must not be used up by a scan. If it is, the code in the same email still works.
- Signed in already and opening an old link: they stay signed in and land in their studio.
- The sending account fails (bad credentials, provider outage): the user sees "We couldn't send the email. Try again or continue with Google." The founder sees the failure in the Supabase Auth logs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sign-in screen MUST offer "Continue with Google" and an email field with "Email me a sign-in code" in every environment, including production. Copy changes from "Use the Google account your studio invited" to wording that covers both.
- **FR-002**: Email sign-in MUST be passwordless. One email MUST contain both a sign-in link and a 6-digit code, for new and returning users alike. Both the "magic link" and "confirm sign-up" email templates carry both.
- **FR-003**: After sending, the screen MUST show the address, a 6-digit field (numeric keypad on phones, paste accepted, browser one-time-code autofill), "Use a different email" and "Resend". Resend is disabled for 60 seconds with a visible countdown.
- **FR-004**: The link MUST sign the user in when opened in the browser that requested it, and MUST restore the page they first asked for (same return-to behaviour as Google, 042). Opened elsewhere, it MUST explain that the code works on any device and MUST NOT sign in.
- **FR-005**: Links and codes MUST expire 15 minutes after sending and work once. A newer email for the same address MUST make earlier ones stop working.
- **FR-006**: The response to "send me an email" MUST NOT reveal whether an account exists for the address.
- **FR-007**: A completed email sign-in MUST run the same `start_session()` step as Google, with the same results: invites accepted, a Free studio if none, activity recorded. Completing the sign-in confirms the email address; an address that never completes it gains nothing.
- **FR-008**: One address MUST map to one account whichever way the person signs in (Google or email).
- **FR-009**: Limits MUST be enforced by the sign-in service, not the browser: one email per address per 60 seconds; a project-wide hourly cap on sign-in emails (starting at 30 an hour, adjustable by the founder); a limit on code attempts. Each limit MUST show its own friendly message, and the hourly-cap message MUST offer Google.
- **FR-010**: An email-sending account (SMTP) MUST be connected to the live project before this PR merges: sender name "Interior Studio", from an address on a domain the founder controls, with SPF, DKIM and DMARC verified. Only the founder handles its credentials; they never enter the repo, Vercel, or an agent's session. Spec 056 reuses this account.
- **FR-011**: The email templates MUST live in the repo as the single source. The local stack uses them; the founder copies them into the live project; `docs/auth.md` records the settings (no secrets).
- **FR-012**: Password sign-in MUST remain local and CI only; production builds never show a password field.
- **FR-013**: Errors MUST be specific and recoverable: wrong or expired code, expired or used link, link opened in another browser, rate limited, and could not send. Each offers the next step, and all are announced to screen readers.
- **FR-014**: Automated tests MUST cover the code path and the link path end to end against the local stack, reading the email from the local mail catcher. The password-based test sign-in may remain for other suites.

### Key Entities

- **Sign-in email**: sent to an address; contains a link and a 6-digit code; valid for 15 minutes; single use; superseded by a newer one.
- **Account** (existing, 042): one per email address; can have a Google identity, an email identity, or both.
- **Email-sending account** (new, configuration only): the founder's SMTP provider, sender name and address, and the hourly cap.

## Success Criteria *(mandatory)*

- **SC-001**: On the Vercel preview, a brand-new address goes from entering the email to its own studio's project list in under 2 minutes (time recorded in the PR).
- **SC-002**: Sign-in emails sent to a Gmail and an Outlook address both arrive in the inbox, not spam, within 1 minute.
- **SC-003**: Both the code path and the link path pass end-to-end tests on CI.
- **SC-004**: For an address with an account and one without, the sign-in screen and the network response look identical.
- **SC-005**: No password field appears in the production build (checked on the preview).

## Assumptions

- **Any email address is accepted**, including personal ones like Gmail, because Google sign-in already admits personal Google accounts. "Business email" describes the intended users, not a filter.
- The email-sending provider is the founder's choice. Resend is the suggested default (free tier of 3,000 emails a month, simple domain setup); Postmark, Amazon SES and others work the same way.
- The founder controls a domain for the sender address. The production app domain `*.vercel.app` cannot be used to send email.
- Supabase Auth's built-in limits and email templates provide the cooldown, expiry, single use and attempt limits; no server is added.
- No CAPTCHA in this spec. If abuse appears in the Auth logs, a later spec adds one. The hourly cap bounds the damage until then.
- The local stack's mail catcher stands in for the sending account in development and CI.

## Out of Scope

Passwords, SMS codes, passkeys, SAML/SSO, restricting sign-up to certain domains, CAPTCHA, the day-76 retention email (056), and changing an account's email address.

## Gate

On the Vercel preview, using the live project with the founder's sending account connected, a brand-new email address receives the email in its inbox. It signs in with the 6-digit code and also, in a fresh browser session, with the link. It lands in its own Free studio. The PR records the preview URL, the time taken and the sender shown.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-platform-identity` (extends 042)
- **Parent Module**: none
- **Module Capabilities**: adds email sign-in (link and code).
- **Dependencies on Other Modules**: none.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec. Sign-in is available to everyone; what a studio can use is spec 055.

### 3. Usage and Commercial Limits
- **Applicable Quotas**: sign-in emails: per address one per 60 seconds; project-wide 30 an hour to start (FR-009). This is a cost and reputation limit, not a plan limit.
- **Usage Measurement**: Supabase Auth rate limits and Auth logs.
- **Behavior When Limits Are Reached**: no email is sent; a message offers waiting or Google.
- **Overage or Upgrade Behavior**: the founder raises the hourly cap in the Auth settings.

### 4. RBAC Requirements
Not applicable: foundation spec. Signing in grants no role by itself; roles come from invites or owning one's own Free studio (042).

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: none new.
- **Tenant Isolation Requirements**: unchanged from 042; a studio is reached only through `org_members`.
- **Storage and Cache Isolation**: the pending address and the sign-in-in-progress state are kept only for the current tab and cleared on sign-in or sign-out.
- **Background Worker Tenant Context**: none.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Frontend**: shows the email form, the countdown and the messages; never decides who may sign in.
- **Backend**: Supabase Auth issues, expires and rate-limits links and codes. `start_session()` (042) refuses unconfirmed addresses.
- **Audit**: Supabase Auth logs record each email sent and each sign-in.

### 8. Acceptance Criteria and Security Tests
- **RBAC Permission Tests**: a user who only *requested* an email (never completed it) has no studio and no accepted invite (pgTAP, reusing 042's unconfirmed-email cases).
- **Tenant Isolation Tests**: an email sign-in for an address invited to studio A joins A only and sees nothing of studio B (Playwright on the local stack).
- **Anonymous Tests**: signed-out requests still read nothing (existing 041/042 pgTAP suites stay green).
- **Flow Tests**: Playwright code path and link path (FR-014); same-screen response for unknown and known addresses (SC-004); cooldown message (US4).
