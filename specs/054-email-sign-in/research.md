# Research: 054 — Email Sign-in

All findings below were checked on the local Supabase stack (CLI 3.0.0, `@supabase/supabase-js@2.118.0`, PKCE client) on 2026-11-06 with throwaway `spike-*@example.test` users, deleted afterwards. Nothing is left open.

## R1. One email, two ways in: `{{ .Token }}` and `{{ .TokenHash }}`

- **Decision**: `signInWithOtp({ email, options: { emailRedirectTo } })` sends one email. The template shows the 6-digit `{{ .Token }}` and a link built from `{{ .TokenHash }}`. The code is verified with `verifyOtp({ email, token, type: 'email' })`, the link with `verifyOtp({ token_hash, type: 'email' })`.
- **Evidence**: `generateLink` returned a 6-digit `email_otp` and a `hashed_token` for the same email. Verifying the code signed in, after which the hash returned `otp_expired`: **using one uses up both**. The code also set `email_confirmed_at`, so `start_session()` (042 FR-017) treats the user as confirmed.
- **Alternatives**: Supabase's default `{{ .ConfirmationURL }}` (`/auth/v1/verify?…`) signs in on a plain GET, so mail scanners use it up (spec FR-004 rejects it). The PKCE `?code=` exchange only works in the browser that holds the code verifier (spec clarification 2 rejects it).

## R2. The link works on any device, even with PKCE

- **Decision**: keep `flowType: 'pkce'` (Google still needs it). The link's `token_hash` is verified with `verifyOtp`, which needs no code verifier.
- **Evidence**: with a PKCE client, the emailed hash carries a `pkce_` prefix. `verifyOtp({ token_hash, type: 'email' })` from a **fresh client with empty storage** (another device) returned a session.
- **Consequence**: the link opens `<origin>/auth/confirm?token_hash=…&type=email`. The app shows one "Sign in" button and calls `verifyOtp` only on click (FR-004). Opening the page changes nothing.

## R3. Link target and the redirect allow-list

- **Decision**: `emailRedirectTo = ${location.origin}/auth/confirm`. Template link: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`.
- **Rationale**: `{{ .RedirectTo }}` is the requesting origin (preview, production or localhost) when it is on the allow-list; otherwise Supabase falls back to the site URL, and `…/?token_hash=` still lands on a valid page. The app reads `token_hash` from `location.search` on **any** path. Vercel already rewrites every non-asset path to `index.html` (`vercel.json`); Vite dev does the same.
- **Allow-list**: production already has the preview wildcard and the production URL with `/**` (042 T039). Locally, `additional_redirect_urls` lists exact origins only, so add `http://localhost:5173/**` and `http://localhost:5174/**` (the e2e server).
- **URL clean-up**: after the click, `history.replaceState` removes the token from the address bar before routing to `#/…`.

## R4. New users get the "Confirm signup" template when confirmations are on

- **Decision**: ship two templates with the same body: `magic_link.html` (returning users) and `confirmation.html` (new users when "Confirm email" is on, as in production). Set `enable_confirmations = true` locally so the local stack and CI behave like production and the e2e covers the new-user template.
- **Evidence**: locally, with confirmations off, a new address got the magic-link email. Production has `mailer_autoconfirm = false` (042 T038), so new users get the confirmation template there. `type: 'email'` verifies both kinds of token.
- **Impact on other suites**: seed and `localAdmin` users are created already confirmed (`email_confirm: true`), so password sign-in in the other e2e suites is unaffected. Checked in implementation by the full e2e run.

## R5. Limits and their errors

| Situation | Supabase result | Message (FR-009, FR-013) |
| --- | --- | --- |
| Same address within the cooldown | `over_email_send_rate_limit`, message "For security purposes, you can only request this after N seconds." | "Please wait N seconds before asking for another email." Resend counts down |
| Project-wide hourly cap | `over_email_send_rate_limit`, message "email rate limit exceeded" | "Too many sign-in emails right now. Try again in a few minutes or continue with Google." |
| Wrong **or** expired code | `otp_expired` (403); both are the same | "That code is not right or has expired." |
| Link already used, expired or superseded | `otp_expired` | "This sign-in link has expired." + back to sign-in |
| Too many verify attempts | `over_request_rate_limit` (429) | "Too many attempts. Wait a minute and try again." |
| Bad address | `email_address_invalid` / `validation_failed` | "Enter a valid email address." |
| Sending failed (SMTP) | 500 `unexpected_failure` / "Error sending … email" | "We couldn't send the email. Try again or continue with Google." |

- **Decision**: one pure function `emailAuthError(error)` maps code plus message to these texts, unit-tested from fixtures copied from the spike. Both rate-limit cases share a code, so the per-address case is recognised by the "after N seconds" pattern; anything else with that code is the hourly cap.
- **Settings**: per-address interval 60 s (`max_frequency`), expiry 900 s (`otp_expiry`), 6 digits, email cap 10 an hour, token verifications at the default of 30 per 5 minutes per IP. Locally these go in `supabase/config.toml`; in production the founder sets them under Authentication → Rate Limits and → Email.
- **Evidence**: a newer email made the older code return `otp_expired` (spec "only the newest email works"). A second send for the same address inside the interval returned `over_email_send_rate_limit`.

## R6. No account enumeration

- **Decision**: always `shouldCreateUser: true` (the default). The screen shows the same "We sent a code to …" for every successful send.
- **Evidence**: for an unknown address, `signInWithOtp` returned `{ user: null, session: null }` with no error, the same shape as for a known address outside its cooldown. The cooldown error can appear for a known address that just got an email; it says nothing a second request from the same person wouldn't, and Supabase applies it to new addresses the same way.

## R7. Return-to across tabs

- **Decision**: the email link usually opens in a **new tab**, which cannot see 042's `sessionStorage` return-to. When an email is requested, the return-to hash is also saved in `localStorage` (`interior-studio:email-return-to`, with a timestamp, ignored after 15 minutes, removed after use). The link page uses it if present; on another device it is absent and the user lands in their studio (FR-004).
- **Bonus**: supabase-js shares the session across tabs of the same origin, so the original tab waiting on the code screen signs in too.

## R8. Reading emails in tests

- **Decision**: e2e reads mail from Mailpit (`MAILPIT_URL`, `http://127.0.0.1:54324`, already started by `db:start` in CI): `GET /api/v1/search?query=to:<address>`, then `GET /api/v1/message/<ID>` for `Text`/`HTML`. The helper lives in `e2e/support/mailpit.ts` and, like `localAdmin.ts`, refuses non-local URLs. Each test uses a unique address, so the 60-second interval never collides.

## R9. Production settings are the founder's (no secrets in agents)

The founder sets, in Supabase → Authentication:
- **SMTP**: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender `noreply@<domain>`, name "Interior Studio".
- **Rate limits**: emails 10 an hour.
- **Email**: OTP expiry 900 s, length 6.
- **Templates**: paste the subject and body of `supabase/templates/confirmation.html` into "Confirm signup" and of `magic_link.html` into "Magic Link".

`docs/auth.md` lists all of this without secrets. The agent verifies the non-secret parts through the gate (the email arrives from the right sender, the code is 6 digits, the link works on a second device).
