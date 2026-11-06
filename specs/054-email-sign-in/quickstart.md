# Quickstart: 054 — Email Sign-in

## Locally

1. `npm run db:start && npm run db:reset`. This applies `supabase/config.toml`: the templates, 15-minute expiry, 60-second interval and confirmations on.
2. `npm run dev` and open http://localhost:5173.
3. Enter a new address (e.g. `try-1@example.test`), choose **Email me a sign-in code**.
4. Open Mailpit at http://127.0.0.1:54324. The email "Your Interior Studio sign-in code: 123456" shows a button and the code.
5. **Code path**: type the code and you land in "Try-1's studio" with a Free badge.
6. **Link path**: sign out, request again (after 60 s), open the button's link in a private window, click **Sign in** and land in the same studio.
7. **Expected failures**: a wrong code shows "That code is not right or has expired."; a second request within 60 s shows the wait message; the used link shows "This sign-in link has expired."

## Automated

```sh
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
npm run db:test   # existing suites; no new migration
```

`e2e/email-sign-in.spec.ts` covers the code path, the link path in a fresh browser context, the cooldown and "unknown address looks the same as a known one".

## Production setup (founder, once)

Follow `docs/auth.md`: connect the Resend SMTP account, set the limits (10 emails an hour, 900 s expiry, 6 digits) and paste the two templates. No secret goes to the repo, Vercel or an agent.

## Gate (preview)

On the PR's Vercel preview, a brand-new address:
1. receives the email in its inbox from "Interior Studio <noreply@…>";
2. signs in with the code;
3. signs in again on a phone or in a private window with the link;
4. lands in its own Free studio.

Record in the PR the preview URL, the sender shown and the time from "Email me a sign-in code" to the project list (SC-001 < 2 min).
