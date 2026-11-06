# Sign-in configuration (spec 042)

Values only; no secrets. The Google OAuth client secret lives in Supabase and nowhere else.

## Supabase (project `pkbctmaiawztzmwqkpgw`) → Authentication

| Setting | Value |
| --- | --- |
| Google provider | Enabled. Google OAuth redirect URI: `https://pkbctmaiawztzmwqkpgw.supabase.co/auth/v1/callback` |
| Email provider | Enabled with **Confirm email** on (unconfirmed sign-ups get no studio and accept no invite: FR-015, FR-017). Spec 054 adds magic link / 6-digit code |
| Site URL | `https://interior-studio-two.vercel.app` |
| Redirect URLs | `http://localhost:5173/**`, `http://localhost:5174/**`, `https://interior-studio-*-akhileshs-projects-91333371.vercel.app/**`, `https://interior-studio-two.vercel.app/**` |

## Vercel (project `interior-studio`) → Environment Variables, Production and Preview

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://pkbctmaiawztzmwqkpgw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The project's publishable key (public by design; RLS is the boundary) |
| `VITE_AUTH_PASSWORD_SIGN_IN` | **Never set.** Local and CI e2e only |

A missing URL or key shows the configuration-error screen instead of the app (`ConfigErrorScreen`).

## What happens at sign-in

The app calls `public.start_session()` after every sign-in. For a confirmed email it accepts pending
invites, creates a Free studio when the user has none, and updates `last_active_at` for the user's
studios (used by spec 056). AI credits default to 0; only the operator grants them
(`docs/operations/ai-credits.md`).
