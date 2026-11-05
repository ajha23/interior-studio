# Claude Code notes

**All engineering rules live in [AGENTS.md](AGENTS.md). Read it first; this file only adds
Claude-specific workflow.**

- For anything larger than a one-file change, use plan mode first: read the relevant spec in
  `specs/`, propose the task breakdown, then implement one task at a time.
- GitHub Spec Kit skills are available via `/speckit-*` (defined in `.claude/skills/`).
- Useful entry points: `src/domain/index.ts` (public domain API), `src/domain/commands/execute.ts`
  (all edits), `src/state/editorStore.ts` (undo/redo, selection), `src/features/kitchen-layout/Workspace.tsx` (UI shell).
- To see the app, run `npm run dev` (port 5173) and drive it with Playwright; the 3D canvas sets
  `data-rendered` once it has drawn.
- Finish with the full check from AGENTS.md and report its real output.
- Constitution 2.3.0 applies: the database is the security boundary (XI) and only official clients
  are used, with no hand-written security code (XII). In `/speckit-plan`, reject any plan that adds a
  server, a new package, a hand-rolled Supabase client or hand-written auth/JWT code.
- Done means a merged PR with green CI and a Vercel preview someone signed into. Never mark a task
  complete without the exact command and its output.
- Start every session with: "Read AGENTS.md, the constitution and specs/NNN-name/ before anything
  else." Branch from `main`; branches live at most 3 days.
- Feature freeze: until spec 048 merges, work only on foundation specs 040–052
  (`specs/FOUNDATION-PLAN.md`). Decline out-of-scope work and note it in the tracker instead.

