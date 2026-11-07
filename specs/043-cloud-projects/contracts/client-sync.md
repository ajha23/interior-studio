# Contract — browser save status, conflicts, offline queue, routes

## Save status (FR-010): exactly one at a time

| State | Indicator text | When |
| --- | --- | --- |
| `saved` | Saved | queue empty, head known |
| `saving` | Saving… | a save is in flight, or the 2 s debounce is pending after a change |
| `offline` | Offline (queued N) | `navigator.onLine === false` or the last send failed with a network error; N > 0 entries are waiting |
| `conflict` | Conflict | a `PT409` stopped the queue; the dialog is open or can be reopened from the indicator |
| `error` | Couldn't save (+ Retry for 5xx and network errors only) | `PT413` or `PT423`: a fixed message, the entry leaves the queue, the scene stays in `cloud_docs`. `42501`/`PT404` after a role change: the queue stops and is kept. 5xx: Retry resends the same entry and key |

The indicator sits in the editor's top bar (kitchen, home plan and room editor) and has
`role="status"` and `aria-live="polite"`. Viewers don't see it. They see a "View only" badge
instead.

## Autosave and Save version (FR-009)

- After the last change (a new `editorStore.revision`, or `homeStore.dirty` becoming true), wait
  2 s, then enqueue an `autosave`.
- Ctrl+S, the TopBar Save, the command palette and the command line all call
  `saveVersion(message?)`. This sends a `manual` save at once. The TopBar's "Save version…" opens a
  small form with an optional message (max 500).
- A cloud room of a home saves the **whole home** document (FR-014).
- "On this device" documents keep today's `saveProject` / `saveHome` path, with no autosave and no
  change.

## Conflict dialog (FR-012, US3)

Title: "Someone else saved this project". The body names who saved version N+1, and when.
- **Load theirs**: asks "Discard your unsaved changes?" before loading. Once confirmed, it loads the
  head, clears this project's queue and resets undo.
- **Save mine on top**: saves the current scene with `expected = current_version_no` from the
  conflict detail. Waiting queue entries are re-based onto the result.
- Closing the dialog leaves the state at `conflict`. Nothing is sent and nothing is lost.

## Offline (FR-011, FR-011a)

- Every snapshot is written to `cloud_queue` before it is sent, so a reload or crash loses nothing.
  On start, the controller drains any entries for the signed-in user and studio.
- `create`, `rename`, `archive`, `unarchive`, `delete`, `New project`, `Import`, Restore and
  History are disabled offline with "You're offline — this needs a connection."
- `cloud_docs` is written on every open and every successful save; `cloud_lists` on every successful list load.
- Opening a cloud project offline uses `cloud_docs` and shows the banner "Offline — showing the
  copy on this device". The Projects page shows `cloud_lists` with the same banner.
- A `42501` or `PT404` on drain (membership revoked) stops the queue. The entries are kept, and the
  error reads "You no longer have edit access to this studio. Your changes are kept on this device."

## Projects page (FR-001, FR-001a)

- **Studio projects** (default): name, client, status (read-only in 043), a kitchen/home badge, last updated, owner, and a
  row menu (Rename, Archive or Unarchive, Delete for admins on archived projects). A "Show
  archived" toggle is off by default. A project whose head is `legacy_v1` shows "Older format:
  opens after the import update" and doesn't open (044).
- **On this device**: today's kitchens and homes list (open, export, delete), unchanged.
- New project, New home and Import create **studio** projects.
- Packages and photos: the editor's deliverables panel notes "Packages and photos are on this
  device only" for cloud projects.

## History (US5)

The editor's History panel lists versions newest first: number, kind, author, time and message, 50
at a time. **Open** shows that version read-only (`editorStore.readOnly`), with the banner "Viewing
version N (kind, author, time) · Back to latest · Restore". **Restore** saves that scene as kind
`restore`, message "Restored version N", with `expected = head`, then reopens the latest version.

## Routes

| Hash | Opens |
| --- | --- |
| `#/s/<slug>/projects` | Projects page |
| `#/s/<slug>/p/<uuid>` | cloud kitchen |
| `#/s/<slug>/h/<uuid>` | cloud home plan |
| `#/s/<slug>/h/<uuid>/room/<roomId>` | room of a cloud home |
| `#/project/<id>`, `#/home/<id>[/room/<roomId>]` | "On this device" (unchanged) |

A cloud route for a project in another studio, or one that doesn't exist, shows "This project
isn't in this studio" and a link back. This is the same screen whether the project is missing or
denied, so it reveals nothing.

## Read-only (FR-013)

The role comes from the session's membership for the studio. For a `viewer`:
- the editor opens with `readOnly = true`;
- `dispatch` and transactions return "View only: ask a studio owner for edit access.";
- undo and redo are disabled, and no autosave or queue entry is created.

This is presentation only. The database refuses the save anyway (pgTAP).
