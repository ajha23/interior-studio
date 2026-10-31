# Decision records

## D-001 — Rewrite on the blueprint stack (2026-10-30)

**Context.** The previous app (a Vite monorepo with a µm-based core package, Supabase auth, cloud
saves, AI edge functions, quotes and a Blender render worker) had grown well past the blueprint's
Phase 1, but it didn't follow the blueprint's stack, structure or spec-driven workflow.

**Decision.** Rebuild from the blueprint's first vertical slice (M0–M5) on a branch:
React + TypeScript + Vite, R3F + Drei, Tailwind + shadcn/ui, Zustand + Immer, Zod, IndexedDB,
Vitest + RTL + Playwright, with `AGENTS.md`, `docs/` and `specs/`.

**Consequences.** Cloud persistence, sign-in, AI, quotes, elevations and cut lists are gone from this
branch until rebuilt in later phases. The previous app is still on `main` at commit `eaf7d0f`
(plus the uncommitted open sign-up work in that checkout); use it as a reference when porting
features. Do not merge this branch over `main` without deciding how to handle existing Supabase
users and data.

## D-002 — Integer millimetres in the domain

Store every length as an integer number of millimetres; convert to metres only in
`src/rendering/units.ts`. This keeps construction measurements exact and makes "never silently
change a measurement" enforceable: non-integers are rejected by the schema. (The previous app used
micrometres; millimetres match how designers and workshops quote sizes.)

## D-003 — Commands with validation, history as snapshots

All edits are `DesignCommand`s run by `executeCommand`, which validates with Zod and the project
invariants. Undo/redo stores immutable project snapshots rather than inverse commands: with Immer's
structural sharing they are cheap, and they cannot drift out of sync with complex commands such as
resize ripple or layout presets.

## D-004 — Derived data is never stored

Worktops, geometry, labels and the BOM are recomputed from the project. That way resizing a
cabinet automatically updates its worktop and BOM, and saved files can't contain stale derived
data.

## D-005 — Explicit module sizes in Phase 1 (superseded by D-008)

Units accept only listed widths and bounded heights/depths. Unsupported sizes are rejected with the
supported list, so nobody gets a configuration the workshop can't build. Custom sizes are a later
decision.

## D-006 — DOM label overlay instead of drei `<Html>`

drei's `<Html>` creates a separate React root per label, which raced with React 19 StrictMode
(labels went missing, unmount errors appeared). Labels are now plain DOM nodes positioned each frame
by projecting domain anchors (`rendering/selection/LabelProjector.tsx`).

## D-007 — Local-first persistence

Phase 1 stores projects in IndexedDB and exports versioned JSON files. A backend (Node + PostgreSQL
per the blueprint, or the existing Supabase project) is a Phase 4 decision. It should reuse the
same file envelope and migrations.

## D-008 — Custom widths with standard snap sizes (2026-10-30)

Supersedes D-005 for cabinets. Designers asked to size units freely, so cabinets accept any
whole-millimetre width inside their type's range (`widthRange`), and the old list becomes the
standard sizes that grips and the catalogue snap to. Appliances keep fixed widths because real
appliances come in fixed sizes. Heights and depths were already ranges.

## D-009 — Footprint centres on half millimetres

Positions are footprint centres. With odd widths (e.g. 651 mm) a unit whose edges sit on whole
millimetres has its centre on a half millimetre, so `x`/`z` are validated as multiples of 0.5 mm.
Edges, dimensions and every value shown to users remain whole millimetres.

## D-010 — Interiors as sections and fittings, never auto-moved

A cabinet interior is a list of vertical sections (fixed or auto width) holding fittings positioned
by height above the inside floor. Like Blum's configurator, a resize that would cut through a
fitting is blocked rather than moving the fitting silently; the message names the fitting. Presets
generate an interior for the current size. Schema 2 added `interior` and `frontStyle`; the 1→2
migration is self-contained so later changes to defaults cannot change how old files load.

## D-011 — Free-standing units

Units without `wallId` stand free (islands) with rotation 0/90/180/270 and get their own worktop.
Dragging captures a unit onto a wall when its back comes within 250 mm of it; wall-hung units must
always be on a wall.

## D-012 — Opening doors and drawers is view state

How open each door or drawer is lives in the editor store (`state/openings.ts`), like the camera:
it is not part of the project, not saved, not undoable and never marks the project dirty. Moving
parts are described by the geometry builder (`movers`), so the same hinge/slide maths drives the
animation, drag-to-pull and tests. Real-life ordering (doors before inner drawers) is enforced there.

## D-013 — Walk mode and saved viewpoints

Walking is a second camera rig (`WalkControls`) rather than a constrained orbit camera, so keyboard
movement, collisions and eye height behave like being in the room. The walker's position is view
state; named viewpoints are design data (`project.viewpoints`, optional with a default, so no schema
bump) changed through commands, because designers present them to clients.

## D-014 — Wall openings constrain the layout

Doors, windows and plain openings are design data (`project.openings`, optional with a default, so
older files load unchanged). They are validated like units, and units may not intersect an opening's
zone (700 mm into the room, over the opening's height) or an inward door's swing. That makes "a base
unit under a window" valid and "a wall cabinet over a window" invalid without special cases. Walls are
built as solid pieces around their openings; the front wall is now rendered and cut away like the others.

## D-015 — Design checks are warnings, computed from the same geometry

Kitchen-planning guidance (clearances, walkways, wall-cabinet and hood heights, landing space, work
triangle) is reported as warnings by `engine/checks/designChecks.ts` and never blocks an edit, unlike
the hard invariants. Door and drawer clearances sweep the same movers that animate in Interact mode,
so a warning always matches what the user sees when opening the door. Thresholds are typical guidance
and live as named constants in that file.

## D-016 — Drawings and cut lists come from the same parts as the 3D model

Elevations project each unit's procedural parts onto its wall; the cut list takes each part's two
largest dimensions as length × width and the smallest as thickness (plinths become 18 mm kickboards).
Hardware is counted from the movers (hinges by door height, runners per drawer). Nothing is typed in a
second time, so drawings, cut list and 3D always agree. The construction rules are illustrative and
the sheet says so; nested cutting layouts are left to the workshop's software (CSV export).

## D-017 — Display units never touch geometry

Storage stays integer millimetres. Units are a project preference used only to format and parse.
Parsing converts exactly and rounds once (nearest mm, halves away from zero), so a 12 ft room is
stored as 3658 mm and redisplays as 12' 0". Changing the unit is an ordinary command (undoable, saved)
that changes nothing else; a test asserts geometry is identical across every unit.

## D-018 — Walls are derived entities with stable ids

The room is a rectangle, so walls are derived (not stored) with stable ids `wall-back` etc. They can be
selected and inspected; editing a wall's length edits the room width or length. Free-form wall layouts
(non-rectangular rooms) remain a later decision.

## D-019 — Furniture is a third element category

Tables, chairs and sofas are `project.furniture` items with a finish. Cabinets are now identified by
their interior (not by having a material), and every spec lookup goes through `specOf(element)`.

## D-020 — The assistant proposes operations; deterministic code edits

Models return high-level, Zod-validated operations with references and lengths in any unit, not
`DesignCommand`s or code. `src/ai` resolves references against the project, converts lengths once to
millimetres, applies explicit direction semantics and compiles to ordinary commands, which run on an
isolated copy through `executeBatch` before anything is shown. So a chat edit and an inspector edit
are the same edit, a model cannot bypass validation, and the whole pipeline is testable with a
deterministic provider. Commits go through `applyTransaction` (revision check, one undo step).

## D-021 — The model key lives on a server function

The browser talks to `/api/assistant` (Vite middleware in development, a Vercel function in
production) which owns the system prompt, tools, limits and key. The function is bundled into
`.vercel/output` (Build Output API) so it shares the app's TypeScript without path-alias or ESM
resolution problems at runtime. Without configuration the endpoint uses the rule-based provider.

## D-022 — Voice is an input method, not an editing path

Speech recognition produces text and nothing else. A finished utterance is normalised (spoken numbers
and units only) and sent through `Conversation.send(text, { source: 'voice' })`, the same call as the
text box, so voice cannot bypass validation, previews, approval or undo. Recognition uses the
browser's Web Speech API behind `SpeechToTextProvider` (no new dependency, no keys); a cloud provider
can be added behind the same interface. One utterance per click, at most one submission per session,
and replies to requests from a previous project or conversation are discarded.

## D-023 — Layout planning is deterministic; the model only states the goal

Whole-layout requests become a Zod `DesignObjective`. Generation, measurement, constraint checks and
ranking are deterministic code in `src/ai/layout` that proposes ordinary `DesignCommand`s, evaluates
them on isolated copies and commits only the designer's choice through `applyTransaction`. Hard and
soft constraints are explicit with their sources; guidance figures are configurable and never
presented as building-code compliance. A small heuristic search is used first; the generator
interface leaves room for a constraint solver later. Candidate previews reuse the editor's transient
`preview` so the same renderers show uncommitted options.

## D-024 — One drawing model, written to SVG and PDF by the same renderer

Technical deliverables are built as a typed drawing model in model millimetres (with dimensions that
keep their measured value apart from their text) and drawn through a `Painter`; the SVG and PDF
writers implement the painter, so both formats contain the same geometry and text layout. The PDF
writer is our own (vector, Helvetica, ~200 lines) rather than a dependency. Screenshots are only used
for presentations and are captioned as not to scale.

## D-025 — Manufacturing outputs only from explicit, verified construction rules

A construction method must be chosen (saved in `project.production`, optional and defaulted, no schema
bump) before panels are listed, and only cabinet types the rule set marks as verified are cut; the
rest are excluded and reported. Quantities are labelled calculated or estimated, with formulas.
Readiness is reported per output and "manufacturing-ready" requires no blocking issue and no warning.

## D-026 — Revisions are content hashes

A design revision id is a hash of the project content, so deliverables can name the exact design they
came from across sessions without a server, and staleness is a comparison of ids. Approved revisions
are stored as snapshots so drawings can be regenerated for them later.

## D-027 — Several AI providers behind one tool loop, chosen per request

Designers choose Gemini (default), Claude or OpenAI and one of five listed models per provider in the
panel; the choice travels with each request and the server builds the provider from its own keys.
All three share the tool loop, prompts and validation (`toolLoop.ts`), so only a thin adapter per
vendor differs and a proposal means the same thing whichever model wrote it. The server accepts only
catalogued models (no arbitrary model ids, which would bypass cost control), and a provider without a
key answers with the built-in rules and says so instead of failing, so the panel works on any
deployment. Keys stay server-side (D-021).

## D-028 — Reply voices from the AI vendors, with the browser's voice as the fallback

Designers can have replies spoken by Gemini's or ChatGPT's voices instead of the browser's, which
vary in quality between systems. Synthesis runs on the server (`/api/speech`) with the same keys as
the assistant, so keys never reach the browser, and accepts only listed voices and short lines.
Speech is a convenience, never a dependency: any failure (no key, quota, blocked autoplay) speaks the
line with the browser's voice and says why. OpenAI's speech endpoint is being retired, so its voices
come from its current audio model instructed to read verbatim.

## D-029 — Hands-free conversation is a loop over single utterances

A voice conversation reuses the single-utterance pipeline (browser recognition → the same `send` →
preview → approval) and only adds a loop: listen again after each reply, listen during a reply for
barge-in, and end on a phrase, End, silence or a time limit. Realtime speech-to-speech models were
not used: they would bypass the typed operations, validation and approval that every edit goes
through (D-020), and would need audio streamed to the server. Barge-in filters echo by comparing what
was heard with the reply being spoken, because browser recognition gives no access to echo
cancellation for the page's own audio.

## D-030 — Realtime voice uses a speech-to-speech model through the same tools (revises D-029)

The listen → whole answer → whole TTS clip loop took 15 s or more per turn, and listening during a
reply made the assistant hear itself (Chrome's echo cancellation ignores page audio). Voice
conversations now default to Gemini Live: audio streams both ways, the model detects turns and
barge-in, and the browser connects to Google directly with a single-use token that locks the model,
instructions and tools (the key stays on the server). D-029's concern still holds and is met
differently: the realtime model does not edit anything itself — it calls the same typed tools, and
proposals go through `Conversation.send` (validation, preview, approval; approving needs the
designer's own words). Echo is removed at the source by routing playback through a WebRTC loopback so
it becomes the echo canceller's reference. The standard loop remains for other providers, now
half-duplex.

## D-031 — Realism from generated textures and an AI render, not downloaded assets or path tracing

Real-time realism comes from textures generated in the browser (no asset downloads, licences or
bundle growth), image-based light and ambient occlusion, with a Fast quality chosen automatically on
software GPUs. Photographic output comes from Gemini's image model restyling the captured 3D view;
it is labelled an AI visualisation because it can invent small details, so dimensions stay with the
drawings. A browser path tracer was evaluated and dropped: slower, and less convincing to clients.

## D-032 — The assistant can act in the space; acting is not editing

Opening doors, walking to a unit or changing the view are `act` replies carried out at once by the
editor: they never change the design, so they need no approval and add no undo step. Edits keep
the preview-and-approve path (D-020). Reference photos and video feed the same path: the vision
model only describes the reference; deterministic code turns that into operations.

## D-033 — A home is rooms on a plan, each a full room design

Whole homes reuse the single-room model instead of replacing it: every room of a home is a complete
room design in the existing format, placed on a plan with a use and a level. All room tools —
editing, validation, walk-through, deliverables, renders and the assistant — work on a room
unchanged, and existing projects are untouched. The generator is deterministic (zoned bands,
typical room sizes, furnishing rules) and builds every room through the domain's commands, so a
generated home is valid by construction; an AI model only fills in the brief.

