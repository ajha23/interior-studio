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
            │                └─ http → POST /api/assistant {ai: provider + model}
            │                          → Gemini | Claude | OpenAI (server, holds the keys) | rules
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

The designer picks the **AI provider** and **model** in the panel settings (remembered in this
browser). Each provider offers its five strongest current models with tool calling, best first
(catalog as of 31 Oct 2026, `src/ai/providers/catalog.ts`); the server accepts only listed models.

| Provider | Models (default in bold) | Server key |
| --- | --- | --- |
| Google Gemini (default) | Gemini 4 Argon, **Gemini 3.8 Flash**, Gemini 3.1 Pro (preview), Gemini 3.6 Flash, Gemini 3.5 Flash-Lite | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| Anthropic Claude | Claude Fable 5.1, **Claude Opus 5.5**, Claude Sonnet 5.5, Claude Opus 5, Claude Haiku 5.5 | `ANTHROPIC_API_KEY` |
| OpenAI | GPT-6 Astra, **GPT-6.1 Sol**, GPT-6 Sol, GPT-6.1 Terra, GPT-6 Luna | `OPENAI_API_KEY` |
| Built-in rules | Deterministic rules (runs in the browser, no key) | — |

If the chosen provider has no key on the server, the built-in rules answer and the panel shows a
notice naming the missing variable (`ASSISTANT_FALLBACK_TO_RULES=off` turns this into an error).
`GET /api/assistant` reports which providers are configured (never the keys); the settings mark the
others "not set up".

| Variable (server only) | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | — | Enables Gemini. Never `VITE_`-prefixed, never sent to the browser |
| `ANTHROPIC_API_KEY` | — | Enables Claude |
| `OPENAI_API_KEY` | — | Enables OpenAI |
| `ASSISTANT_PROVIDER` | `gemini` | Provider for requests that name none: `gemini`, `anthropic`, `openai` or `rules` |
| `ASSISTANT_MODEL` | provider default | Default model; ignored unless it is one of that provider's listed models |
| `ASSISTANT_FALLBACK_TO_RULES` | on | `off` returns 503 instead of answering with the rules when a key is missing |
| `ASSISTANT_EFFORT` | `medium` | Reasoning effort for Claude and OpenAI: `low`, `medium` or `high` |
| `ASSISTANT_TIMEOUT_MS` | `45000` | Whole tool loop (5–120 s) |
| `ASSISTANT_FALLBACKS` | on | Claude only: `off` disables server-side refusal fallback (`fallbacks: "default"`) |
| `ASSISTANT_RATE_LIMIT` | `30` | Requests per client per minute (per server instance) |

- **Local development:** `npm run dev` serves `/api/assistant` from the dev server. Put the keys in
  `.env.local` (git-ignored) or the shell, e.g. `GEMINI_API_KEY=…`.
- **Vercel:** `npm run build:vercel` writes `.vercel/output` (static app + a self-contained
  `/api/assistant` Node function with the SDKs bundled). Set the keys in Project Settings →
  Environment Variables.
- **Offline:** choosing "Built-in rules (no AI)" runs the deterministic provider in the browser
  (useful on static hosting).
- **Updating the model list:** edit `PROVIDER_CATALOG`; the pickers, server allowlist and tests read it.
- **Another provider:** implement a `ModelAdapter` (one model turn: text, tool calls, stop reason)
  and wrap it in `ToolLoopProvider`, add it to the catalog and to `providerFor` in
  `src/server/assistantHandler.ts`. Everything downstream (validation, preview, commit) is
  provider-independent.

All three AI providers share one tool loop (`src/ai/providers/toolLoop.ts`): a fixed system prompt,
the compact project summary, and read-only tools (`list_objects`, `get_object`, `get_walls`,
`get_issues`). The model must end with `propose_changes`, `ask_clarification`, `reply`,
`plan_layout`, `deliverables`, `client_package` or `undo_redo`; inputs are validated with Zod, and invalid ones and
unknown ids are sent back once for repair. Adapters, each through the vendor's official SDK:

- **Claude** (`anthropic.ts`, `@anthropic-ai/sdk`): Messages API, adaptive thinking, prompt caching of
  the system prompt, server-side refusal fallback for models that support it.
- **Gemini** (`gemini.ts`, `@google/genai`): `generateContent` with JSON-Schema function
  declarations; the model's turns are replayed unchanged so thought signatures go back with the tool
  results; safety finish reasons are reported as refusals; 429 retry delays are passed on.
- **OpenAI** (`openai.ts`, `openai`): Responses API, stateless (`store: false`) with encrypted
  reasoning items passed back each turn; refusals and truncated output are detected.

## Client package edits
The `client_package` tool (`PackageRequestSchema`) edits the client package, never the design: notes,
page names, headings, paper and orientation, dimension label positions (a dimension is named by its
measured value; the value can't be changed here), hardware image size, title block fields, adding,
deleting, reordering and regenerating pages, and "which pages are outdated?". `src/ai/packagePlan.ts`
resolves pages ("this page" = the page open in the studio, "elevation B", "the layout", "every page",
"stale pages") and runs every edit through `executePackageCommand` on a copy; anything ambiguous
becomes a question. Edits to one page apply at once (package undo reverts them); edits to several
pages, deletions and regenerating from the approved revision wait for **Apply**, and an approval
planned against an older package is refused rather than applied over newer edits
(`state/packageAssistant.ts`). The rule-based provider understands the same requests.

## Acting in the space, references and renders
See `docs/REALISM.md`: the `interact` tool (open/close, walk, look, views — no approval needed, no
undo step), `create_finish` for new finishes, reference photos/video (`/api/reference`) and the
photoreal render deliverable (`/api/render`).

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
  kitchen") need an AI provider. Responses are not streamed.
- Domain error messages quote millimetres regardless of the display unit.
- The AI providers are covered by tests against fake Gemini, Messages and Responses APIs; they
  have not been exercised against the live APIs in this environment (no keys configured). The model
  catalog is a snapshot and needs updating as vendors release and retire models.

## Voice
Phase 3 adds spoken input on top of this pipeline; see `docs/VOICE.md`. Spoken requests call the
same `Conversation.send` with `source: 'voice'`.
