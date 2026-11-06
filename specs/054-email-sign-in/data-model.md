# Data Model: 054 — Email Sign-in

No database change. Supabase Auth owns the sign-in tokens; 042 owns accounts, studios and invites.

## Sign-in email (Supabase Auth, not ours)

| Field | Rule |
| --- | --- |
| address | trimmed and lower-cased by the app before sending |
| code | 6 digits (`otp_length = 6`) |
| link token | `token_hash`; with the PKCE client it starts `pkce_` (R2) |
| valid for | 15 minutes (`otp_expiry = 900`) |
| use | once; using the code uses up the link and vice versa (R1) |
| superseded | a newer email for the same address makes older ones `otp_expired` (R5) |
| send interval | one per address per 60 s (`max_frequency = "60s"`) |
| project cap | 10 an hour (production Rate Limits; local `email_sent`) |

Completing either path sets `auth.users.email_confirmed_at`, which `start_session()` requires (042 FR-015, FR-017).

## Sign-in screen states (browser)

```text
choose ──send ok──▶ code-sent ──verify ok──▶ (session) → 042 enter(): start_session → studio
  ▲  │                 │  │
  │  └─send error──▶ choose + message (R5)
  │                    │  └─verify error──▶ code-sent + message
  └──"use a different email"──┘
code-sent: resend disabled for 60 s from the last send (countdown)
```

```text
/auth/confirm?token_hash=…&type=email
  ready ──click "Sign in"──▶ verifying ──ok──▶ clean URL → return-to hint or #/ (042 routes)
                                        └─error──▶ expired (message + "Back to sign-in")
  already signed in ──▶ clean URL, stay signed in, go to #/
  missing/invalid params ──▶ expired
```

## Browser storage

| Key | Store | Value | Lifetime |
| --- | --- | --- | --- |
| `interior-studio:return-to` (042) | sessionStorage | route hash | until used (same tab) |
| `interior-studio:email-return-to` (new) | localStorage | `{ hash, at }` | ignored after 15 min; removed on use and on sign-out |
| `interior-studio:email-pending` (new) | sessionStorage | the address in the code step | removed on sign-in, "use a different email" and sign-out |

No tokens, codes or sessions are stored by app code; supabase-js keeps its own session as in 042.
