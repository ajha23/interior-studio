# Quickstart: validate spec 042

## Prerequisites

- The e2e CI fix (Chromium new headless, screenshot paths) is merged to `main`.
- Docker running; `npm ci`; `npm run db:start && npm run db:reset` (spec 041 stack and seed).
- `.env.local` (not committed):
  ```
  VITE_SUPABASE_URL=http://127.0.0.1:54321
  VITE_SUPABASE_ANON_KEY=<anon key from `npx supabase status`>
  VITE_AUTH_PASSWORD_SIGN_IN=true
  ```

## 1. Database

```bash
npm run db:reset && npm run db:test
```

Expected: every file passes, including `05_invites.test.sql` (admin cannot demote the owner through an
invite; existing members are never re-roled).

## 2. Local app

`npm run dev`, open `http://localhost:5173`.

- Signed out → sign-in screen. Sign in as `owner.a@example.test` / `password123`.
- Lands on `#/s/alpha/projects`; header shows "Alpha Studio", the switcher and the account menu.
- Settings → Members: four members; invite `new@example.test` as designer → listed as pending.
- Invite `designer.a@example.test` → "already a member".
- Sign out → sign-in screen; reload stays signed out.
- Sign in as `viewer.a@example.test` → Settings shows members read-only, no invite form.
- Open `#/s/beta/projects` as an Alpha user → "You don't have access to this studio".
- Sign in as `both@example.test` → switcher lists Alpha and Beta; switching changes the URL slug.

## 3. Automated

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e        # needs the local stack running
grep -rn "00000000-0000-4000-8000" src   # matches only in test fixtures
```

## 4. Preview gate (founder)

1. Confirm the Google provider (FR-016).
2. Vercel Production and Preview env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for the live project.
3. Supabase Auth URL configuration: redirect URLs for localhost, the preview wildcard and production.
4. On the PR's Vercel preview: sign in with Google, see your studio, invite a colleague; the colleague
   signs in with Google and lands in the same studio.
