# 001 — Project foundation

**Status:** Done (M0)

## User story
As a developer (or coding agent), I can install, run, lint, typecheck, test and build the app with
one command each, so every later feature starts from a green baseline.

## Requirements
- Vite + React 19 + strict TypeScript, path alias `@/` → `src/`.
- Tailwind CSS v4 with shadcn/ui design tokens; shared primitives in `src/components/ui`.
- ESLint (typescript-eslint, react-hooks) with a rule that keeps `src/domain` and `src/engine`
  free of React/Three/Zustand imports.
- Vitest (jsdom, RTL, fake-indexeddb) and Playwright (Chromium with software WebGL).
- npm scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, `check`.
- CI runs lint, typecheck, unit tests, build and e2e on every push and pull request.

## Acceptance criteria
- `npm install && npm run check && npm run e2e` passes on a clean checkout.
- Importing `react` from `src/domain/**` fails lint.
