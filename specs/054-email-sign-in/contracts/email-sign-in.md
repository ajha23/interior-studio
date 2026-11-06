# Contract: Email Sign-in

## Session context (extends 042 `SessionContextValue`)

```ts
sendEmailCode(email: string): Promise<EmailResult>;              // signInWithOtp, emailRedirectTo = `${origin}/auth/confirm`
verifyEmailCode(email: string, code: string): Promise<EmailResult>; // verifyOtp({ email, token, type: 'email' })
confirmEmailLink(tokenHash: string): Promise<EmailResult>;       // verifyOtp({ token_hash, type: 'email' })

type EmailResult = { ok: true } | { ok: false; message: string; retryAfterSeconds?: number };
```

On success, supabase-js fires `SIGNED_IN` and 042's `enter()` runs `start_session()`; these functions add nothing after sign-in.

## Sign-in screen (`SignInScreen`)

| Element | Accessible name / text |
| --- | --- |
| Heading | "Sign in to Interior Studio" |
| Intro | "Continue with Google, or get a sign-in code by email." |
| Google button | "Continue with Google" |
| Email field | label "Work email", `type=email`, `autocomplete=email` |
| Send button | "Email me a sign-in code" |
| Password form | only when `VITE_AUTH_PASSWORD_SIGN_IN=true` (local/CI), labelled "Local test accounts only" |

## Code step (`EmailCodeForm`)

| Element | Accessible name / text |
| --- | --- |
| Status | "We sent a code to <address>. It works for 15 minutes." (`role=status`) |
| Code field | label "6-digit code", `inputmode=numeric`, `autocomplete=one-time-code`, `maxlength=6`, paste strips spaces |
| Submit | "Sign in" |
| Resend | "Resend email" (disabled with "Resend in N s" during the 60 s interval) |
| Change | "Use a different email" |
| Errors | `role=alert`, texts from `emailAuthError` (research R5) |

## Link page (`EmailLinkConfirm`)

- **URL**: `<origin>/auth/confirm?token_hash=<hash>&type=email`. The app matches on `token_hash` in `location.search` at any path (R3).
- **Shows**: heading "Sign in to Interior Studio" and a button "Sign in". Nothing runs before the click.
- **After the click**: success → `history.replaceState` to `/` + the return-to hint or `#/`. Error → "This sign-in link has expired." + link "Back to sign-in" (to `/`).
- **Already signed in**: clean the URL and go to `#/` with no click needed.

## Email templates (`supabase/templates/magic_link.html`, `confirmation.html`)

- **Subject**: "Your Interior Studio sign-in code: {{ .Token }}"
- **Body**:
  - a button "Sign in to Interior Studio" → `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`;
  - the code `{{ .Token }}` in large type;
  - "The link and code work once, for 15 minutes.";
  - "If you didn't ask for this, ignore this email.".
- No images or tracking. Inline styles only.

## Error texts

See research R5. Fixed strings, unit-tested in `emailAuthErrors.test.ts`.
