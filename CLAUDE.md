# Claude Code notes

**All engineering rules live in [AGENTS.md](AGENTS.md). Read it first; this file only adds
Claude-specific workflow.**

- For anything larger than a one-file change, use plan mode first: read the relevant spec in
  `specs/`, propose the task breakdown, then implement one task at a time.
- Useful entry points: `src/domain/index.ts` (public domain API), `src/domain/commands/execute.ts`
  (all edits), `src/state/editorStore.ts` (undo/redo, selection), `src/features/kitchen-layout/Workspace.tsx` (UI shell).
- To see the app, run `npm run dev` (port 5173) and drive it with Playwright; the 3D canvas sets
  `data-rendered` once it has drawn.
- Finish with the full check from AGENTS.md and report its real output.
