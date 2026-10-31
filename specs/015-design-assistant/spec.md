# 015 — Chat-driven design editing (Phase 2)

**Status:** Done (vertical slice). Guide: [docs/AI_ASSISTANT.md](../../docs/AI_ASSISTANT.md)

A persistent assistant panel that inspects, creates, updates, moves, resizes and deletes real design
entities from natural language, through the existing command engine.

## Requirements
1. **Panel**: conversation history, project and selection context (chips), loading, cancel, errors with
   retry, example requests, and explicit states for proposed (validated), applied, failed, rejected.
2. **Typed contract** (`src/ai/schema.ts`): Zod `AssistantOperation`s for rooms, walls, doors/windows,
   cabinets, appliances, furniture, finishes, units, batches (a plan is a batch), undo/redo and
   inspection. References by stable id, selection, conversation focus, earlier plan step, or query.
3. **Deterministic compilation**: references resolved against the actual project, lengths converted
   once to whole millimetres, documented relative-direction semantics, then ordinary `DesignCommand`s.
4. **Provider abstraction**: `AssistantProvider` with a deterministic rule-based provider (local
   development, tests, offline) and an Anthropic adapter on the server; key never in the browser;
   timeouts, malformed output, rate limits and provider errors handled.
5. **Read-only inspection tools** and a compact project summary for the model.
6. **Lifecycle**: request → intent → inspect → plan → validate → isolated dry run → geometry
   validation → preview → approval → atomic commit → views refresh → undoable revision.
   Ambiguity → one question; violations → exact reason + verified alternatives; nothing unrelated
   changes silently.
7. **Preview**: affected, new and deleted objects; previous/proposed sizes and positions; validation
   results and warnings; dependencies; explanation; approve/reject; optional auto-apply (off).
8. **Transactions**: all-or-nothing batches, revision check, re-check of stale previews, one undo step.
9. **Context**: "it", "that cabinet", "the selected object", "the previous one", "the left cabinet",
   "the cabinet next to the refrigerator"; follow-ups on a pending proposal are merged.
10. **Security**: untrusted model output, limits, server-side validation, injection hygiene, approval
    policy for destructive edits, logs without message text or secrets.
11. **Tests** for all of the above plus Scenario A–F end to end.
