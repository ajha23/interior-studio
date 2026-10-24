# ADR 0002 — Validated scene tools as the single edit path for AI commands

**Status:** accepted · 2026-10-25 · scene schema v6

## Context

Sprint 1 adds natural-language editing ("Change the selected base cabinet width to 900 mm"). An LLM must never write scene JSON directly: a bad answer would corrupt designs, skip construction rules and break undo. The editor already had typed, invertible `Command`s, undo/redo and autosave.

## Decision

- **Scene tools** (`packages/core/src/tools/sceneTools.ts`) are the only way a request becomes a change. Each tool (`set_dimension`, `set_parameter`, `set_material`, `rotate`, `move`, `rename`, `delete`, `select`, `add_base_cabinet`) takes plain JSON, resolves its target (selection, id or unique name, optional `expectKind`), validates it, and returns an ordinary `Command`. Tools never mutate state.
- **Validation is the template's own.** Limits live in one table per template (`BASE_CABINET_LIMITS`); a parametric edit is also resolved and rejected if it introduces construction errors the piece did not already have. Dependent parameters are adjusted by template rules (`adjustBaseCabinet`, e.g. 1 → 2 doors past 600 mm) and reported to the designer.
- **All-or-nothing batches.** `planTools` validates a multi-step request against the scene as each step leaves it; the first rejection rejects the request. Accepted requests apply as one `batch` command = one undo step, then autosave persists them like any edit.
- **Two planners, one contract.** A deterministic parser (`tools/nl.ts`) handles common phrasing instantly, offline and free. Anything it can't parse with certainty goes to the `ai-command` edge function, which asks Gemini (function calling) for the same `ToolCall[]`. Tool declarations are generated from the core registry and sent by the client; the function only forwards allow-listed names and never touches the database scene.
- **The inspector uses the same tools** for base cabinets, so a value rejected by AI is rejected identically in the field, with the same message.
- **Base cabinet** (`kind: 'basecabinet'`) is the first kitchen family on the existing parametric engine: parts with real boards, rails, plinth, worktop, doors/shelves or a drawer stack; it feeds 3D, plan, elevations and the cut list with no special cases beyond colours.

## Consequences

- New AI capabilities are added by adding a tool, not by trusting model output.
- Any client (inspector, command bar, future server-side agents) gets identical rules.
- The parser is intentionally narrow; when it returns null the model decides, and the model's calls are still validated.
- Schema v6 is additive (new furniture kind), migrated by an identity step.
