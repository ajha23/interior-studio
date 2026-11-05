# Contract: routes and session

## Routes (hash router, until spec 049)

| Route | Needs session | Studio-scoped | Shows |
| --- | --- | --- | --- |
| any route, signed out | — | — | Sign-in screen; the requested hash is restored after sign-in |
| `#/` | yes | — | Redirect: single studio → its projects; else last-used studio; else studio picker |
| `#/s/<slug>/projects` | yes | yes | App shell + the existing projects home |
| `#/s/<slug>/settings/members` | yes | yes | App shell + members and invites |
| `#/s/<slug>/…` for a slug the user is not a member of | yes | — | "You don't have access to this studio" + link to `#/`; nothing fetched |
| `#/project/<id>`, `#/home/<id>`, `#/home/<id>/room/<roomId>` | yes | not yet (043/049) | The editor, unchanged |
| signed in, no studio, no invite | yes | — | "Ask a studio owner to invite <email>" + sign out |

The OAuth callback (`/?code=…`) is handled by the Supabase client before the router reads the hash
(research R2); routes never see `code`.

## Session context (`useSession()`)

| Member | Meaning |
| --- | --- |
| `status` | `'loading' \| 'signed-out' \| 'signed-in'` |
| `user` | `{ id, email, name, avatarUrl } \| null` |
| `memberships` | `{ orgId, orgName, orgSlug, role }[]` |
| `error` | message for the last failed auth or membership load, else `null` |
| `signInWithGoogle()` | starts the PKCE redirect; stores the current hash for the return |
| `signInWithPassword(email, password)` | present only when `VITE_AUTH_PASSWORD_SIGN_IN === 'true'` |
| `signOut()` | ends the session, clears memberships and the last-studio key, goes to `#/` |
| `refreshMemberships()` | re-runs `accept_pending_invites` then reloads memberships |

`useStudio()` (inside studio routes) returns the membership matching the URL slug and the role-to-
visible-actions map from [data-model.md](../data-model.md).

## Environment variables (browser build)

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | missing → configuration error screen naming it |
| `VITE_SUPABASE_ANON_KEY` | yes | renamed to the publishable key in spec 046 |
| `VITE_AUTH_PASSWORD_SIGN_IN` | no | `'true'` only for local development and the Playwright web server |

## Playwright

- Project `setup` signs in as `designer.a@example.test` with the local password and writes
  `playwright/.auth/designer.json` (gitignored).
- Project `chromium` depends on `setup` and uses that storage state.
- Tests that need a different user (owner, viewer, a user in two studios, a signed-out visitor) create
  their own context.
