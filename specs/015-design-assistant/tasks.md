# 015 — Tasks

- [x] `executeBatch` (all-or-nothing) in the domain; `revision` + `applyTransaction` in the editor store
- [x] Assistant schema (operations, references, lengths, responses, request, limits)
- [x] Entities, reference resolution (ambiguity → candidates), compiler (units, directions, placement)
- [x] Transaction runner: isolated dry run, change set, protected walls/objects, warnings, alternatives
- [x] Approval policy; conversation orchestrator (focus, merge follow-ups, stale re-check, clarifications, log)
- [x] Providers: rule-based, Anthropic (server, tool loop, validation + repair), HTTP client
- [x] `/api/assistant` handler (limits, origin check, rate limit, logging); Vite dev middleware; Vercel function bundle
- [x] Panel UI: messages, change preview, answer tables, clarifications, context chips, settings, activity log
- [x] Unit, integration (designer conversations), server/adapter and e2e tests; docs

## Not done (see docs/AI_ASSISTANT.md › Limitations)
- Accounts and server-side project storage (projects live in the browser), so "project access" means
  validating the submitted project, not per-user authorisation.
- Streaming of model output to the panel.
