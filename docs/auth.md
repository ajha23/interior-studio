# Sign-in configuration (specs 042, 054)

Values only; no secrets. The Google OAuth client secret and the Resend API key live in Supabase and
nowhere else: not in the repo, not in Vercel, never pasted to an agent.

## Supabase (project `pkbctmaiawztzmwqkpgw`) → Authentication

| Setting | Value |
| --- | --- |
| Google provider | Enabled. Google OAuth redirect URI: `https://pkbctmaiawztzmwqkpgw.supabase.co/auth/v1/callback` |
| Email provider | Enabled with **Confirm email** on. Passwordless: one email carries a link and a 6-digit code (spec 054). Unconfirmed sign-ups get no studio and accept no invite (042 FR-015, FR-017) |
| Site URL | `https://interior-studio-two.vercel.app` |
| Redirect URLs | `http://localhost:5173/**`, `http://localhost:5174/**`, `https://interior-studio-*-akhileshs-projects-91333371.vercel.app/**`, `https://interior-studio-two.vercel.app/**` |

## Email sign-in (spec 054)

### Sending account: Resend over SMTP (Authentication → SMTP Settings)

| Field | Value |
| --- | --- |
| Enable custom SMTP | On |
| Sender email | `noreply@<your domain>` (the domain verified in Resend: SPF, DKIM and DMARC) |
| Sender name | `Interior Studio` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your Resend API key (sending access, that domain only). **Paste it here only** |

Spec 056 (the day-76 retention email) reuses this account.

### Limits

| Where | Setting | Value |
| --- | --- | --- |
| Authentication → Rate Limits | Emails sent per hour | **10** (Resend's free plan allows 100 a day; raise this or move to Resend Pro as use grows) |
| Authentication → Rate Limits | Token verifications | default (30 per 5 minutes per IP) |
| Authentication → Sign In / Providers → Email | Email OTP expiration | **900** seconds (15 minutes) |
| Authentication → Sign In / Providers → Email | Email OTP length | **6** |
| Authentication → Sign In / Providers → Email | Minimum interval between emails | 60 seconds (default) |

### Templates (Authentication → Email Templates)

Both templates use the same subject and body, so new and returning users get the same email.

| Template | Subject | Body (paste the whole file) |
| --- | --- | --- |
| Confirm signup | `Your Interior Studio sign-in code: {{ .Token }}` | `supabase/templates/confirmation.html` |
| Magic Link | `Your Interior Studio sign-in code: {{ .Token }}` | `supabase/templates/magic_link.html` |

The link in the email is `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. It opens the app's
`/auth/confirm` page, where only the "Sign in" button uses it, so mail scanners that open links do
not use it up. Locally, `supabase/config.toml` points at the same files.

### Checking it works

Request a sign-in email on the preview. It should come from "Interior Studio <noreply@…>", land in the
inbox, and Gmail's "Show original" should show `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`. Failures
to send appear in Supabase → Logs → Auth.

## Vercel (project `interior-studio`) → Environment Variables, Production and Preview

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://pkbctmaiawztzmwqkpgw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The project's publishable key (public by design; RLS is the boundary) |
| `VITE_AUTH_PASSWORD_SIGN_IN` | **Never set.** Local and CI e2e only |

A missing URL or key shows the configuration-error screen instead of the app (`ConfigErrorScreen`).

## What happens at sign-in

Google and email sign-in end the same way. The app calls `public.start_session()` after every
sign-in. For a confirmed email it accepts pending invites, creates a Free studio when the user has
none, and updates `last_active_at` for the user's studios (used by spec 056). AI credits default to 0;
only the operator grants them (`docs/operations/ai-credits.md`).
