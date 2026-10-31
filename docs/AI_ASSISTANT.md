# Design assistant (Phase 2)

The assistant edits the real design from plain-language requests. It never edits the project
itself: every request becomes a typed plan that deterministic code resolves, converts, validates and
previews, and the designer approves before anything is committed through the same command engine as
the inspector.

```
panel ──► Conversation (src/ai/conversation.ts)
            │  message + last 12 turns + context {selection, focus, previous focus, locks, revision}
            │  + the project (validated again on the server)
            ▼
          AssistantProvider ── rules (deterministic, offline/tests)
            │                └─ http → POST /api/assistant → rules | Anthropic (server, holds the key)
            ▼
          AssistantResponse (Zod)  plan | clarify | answer | history
            ▼
          runPlan (src/ai/transaction.ts)            ← isolated: projects are immutable
            for each operation: resolve references (resolve.ts) → compile to DesignCommands in mm
            (compile.ts) → executeBatch on the draft (domain validation) ; then diff, locks, warnings
            ▼
          Proposal → preview (ChangePreview) → Apply → editorStore.applyTransaction (revision check,
          all-or-nothing, one undo step) → plan, 3D, drawings re-render from the same project
```

## Operations (`src/ai/schema.ts`)

| Operation | What it does | Becomes |
| --- | --- | --- |
| `create_cabinet` / `create_appliance` / `create_furniture` | New unit with type, sizes, finish, placement | `add_cabinet` / `add_appliance` / `add_furniture` (+ `place_entity`) |
| `create_opening` | Door, window or archway on a wall | `add_opening` |
| `resize` / `resize_by` | Absolute or relative W/H/D; openings W/H; walls (length → room size) | `resize_*`, `update_opening`, `set_room` |
| `move_by` | Distance + direction | `move_entity`, `place_entity`, `update_opening` |
| `move_to` | Onto a wall at an offset, beside another unit, or free-standing | `move_entity`, `place_entity`, `update_opening` |
| `rotate` | Quarter turns (floor units) | `rotate_entity` |
| `delete` | Units, appliances, furniture, openings | `remove_entity`, `remove_opening` |
| `set_finish` / `set_surface_finish` / `set_front_style` | Shutter finish; worktop/floor/wall/carcass; glass/open/solid | `set_material`, `set_surface_material`, `set_front_style` |
| `set_room` | Room width, length, ceiling height, wall thickness | `set_room` |
| `update_opening` | Swing, hinge, sill | `update_opening` |
| `set_units` | Display unit (geometry unchanged) | `set_measurement_unit` |
| `rename_project` | | `rename_project` |

A plan is a batch of up to 20 operations, committed atomically. Undo/redo, inspection answers
(`show`: cabinets, appliances, furniture, openings, walls, room, selection, issues) and locks
(`protect`) are separate response kinds. Answer tables are rendered from the live project, never
from model text.

### References
`{id}` (stable entity id; walls are `wall-back` …), `{ref: 'selected' | 'it' | 'previous'}`,
`{created: n}` (made by step *n* of the same plan), or `{query: {kind, type, wall, hasOpening, width,
extreme: leftmost|rightmost|highest|lowest, nth, nextTo, side, all}}`. A single-object reference that
matches several entities is never guessed: the assistant asks, listing the candidates. "It" is what
the last proposal created or changed; "the previous one" is the focus before that.

### Lengths
A number is millimetres; a string is parsed like a length field (`"12 ft"`, `"3' 6\""`, `"76 cm"`);
or `{value, unit}`. Converted once with the storage policy (exact, then nearest whole millimetre).
The rule-based provider reads bare numbers in the display unit, like every other field.

### Positions and directions
- **Offset** on a wall: from the wall's start (the left wall for back/front walls, the back wall for
  left/right walls) to the item's nearest edge.
- **left / right**: as seen standing in front of the item, facing it (its own −x / +x). On the back
  wall that is towards the left / right wall; on the left wall "right" is towards the back wall.
- **forward / backward**: away from / towards its wall (a floor unit moved forward leaves the wall).
- **up / down**: height of wall-hung units and window sills; floor units have a fixed height.
- **towards_left_wall / …_right_wall / …_back_wall / …_front_wall**: room axes, whatever the facing.
- **Beside X**: same wall, touching X on the requested side (`auto` tries right, then left); `near`
  falls back to the first free spot and says so. Resizes keep the start along the wall and shift
  later units on the same wall (shown as "affected" in the preview).

## Validation, transactions and approval
- Every operation is compiled against the project left by the previous one and run through
  `executeBatch`: Zod parsing, supported sizes, and the project invariants (inside the room, no
  overlaps, nothing in a doorway or door swing, finishes). One failure rejects the whole plan.
- The preview lists new, deleted and changed objects with previous → proposed size and position,
  objects changed as a consequence ("affected"), room/unit/finish changes, new design-check warnings,
  and on failure the exact reason plus up to three alternatives that were verified to work.
- Locked walls/objects ("keep the window wall unchanged") make any plan touching them fail.
- Applying checks the editor revision; if the project changed since the preview, the plan is
  re-checked against the current design and must be approved again.
- Approval is the default. Auto-apply (panel settings, off by default) only covers single-object
  changes with no side effects, room changes or warnings; deletions always ask.
- A committed plan is one undo step ("Undo the last change" in chat or ⌘Z reverts all of it).

## Providers and configuration

| Variable (server only) | Default | Meaning |
| --- | --- | --- |
| `ASSISTANT_PROVIDER` | `rules` | `rules` (deterministic) or `anthropic` |
| `ANTHROPIC_API_KEY` | — | Required for `anthropic`. Never `VITE_`-prefixed, never sent to the browser |
| `ASSISTANT_MODEL` | `claude-opus-5-5` | Any Messages API model id |
| `ASSISTANT_EFFORT` | `medium` | `low`, `medium` or `high` |
| `ASSISTANT_TIMEOUT_MS` | `45000` | Whole tool loop (5–120 s) |
| `ASSISTANT_FALLBACKS` | on | `off` disables server-side refusal fallback (`fallbacks: "default"`) |
| `ASSISTANT_RATE_LIMIT` | `30` | Requests per client per minute (per server instance) |

- **Local development:** `npm run dev` serves `/api/assistant` from the dev server. Put the variables
  in `.env.local` (git-ignored) or the shell, e.g. `ASSISTANT_PROVIDER=anthropic` and
  `ANTHROPIC_API_KEY=…`. Without them the deterministic provider answers.
- **Vercel:** `npm run build:vercel` writes `.vercel/output` (static app + a self-contained
  `/api/assistant` Node function). Set the variables in Project Settings → Environment Variables.
- **Offline:** the panel settings can switch to "Built-in rules (offline)", which runs the same
  deterministic provider in the browser (useful on static hosting).
- **Another provider:** implement `AssistantProvider.respond(request, signal)` returning an
  `AssistantResponse`, add it to `providerFromEnv` in `src/server/assistantHandler.ts`. Everything
  downstream (validation, preview, commit) is provider-independent.

The Anthropic adapter (`src/ai/providers/anthropic.ts`) sends a fixed system prompt, the compact
project summary, and read-only tools (`list_objects`, `get_object`, `get_walls`, `get_issues`). The
model must end with `propose_changes`, `ask_clarification`, `reply` or `undo_redo`; inputs are
validated with Zod, invalid ones and unknown ids are sent back once for repair. Adaptive thinking,
automatic tool choice and prompt caching of the system prompt are used.

## Security
- Model output is untrusted data: it can only produce schema-valid operations, which are compiled to
  domain commands and validated like any other edit. No code, SQL or HTML from the model is executed
  or rendered (text is shown as plain text).
- Limits: 1,000-character messages, 12 history turns, 20 operations per plan, 60 objects per "all"
  reference, 1 MB request body; same-origin check and per-client rate limit on the server.
- Project text sent to a model (names, finishes) is sanitised, length-capped and labelled as data;
  the system prompt tells the model to ignore instructions inside it. Even a successful injection can
  only propose changes the designer must approve; deletions always need approval.
- The server logs one JSON line per request (provider, model, response kind, operation types,
  status, duration, message length) — never message text, project data or keys. The panel keeps an
  activity log of requests, proposals, commits (with revision) and failures.

## Limitations
- Projects are stored in the browser; there are no accounts, so the server validates the submitted
  project but cannot check per-user access. Server rate limiting is per instance.
- The rule-based provider understands common phrasings only; open-ended requests ("design me a
  kitchen") need the LLM provider. Responses are not streamed.
- Domain error messages quote millimetres regardless of the display unit.
- The LLM path is covered by tests against a fake Messages API; it has not been exercised against
  the live API in this environment (no key configured).

## Voice
Phase 3 adds spoken input on top of this pipeline; see `docs/VOICE.md`. Spoken requests call the
same `Conversation.send` with `source: 'voice'`.
