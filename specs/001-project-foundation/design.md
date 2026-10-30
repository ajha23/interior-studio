# 001 — Design

- Single Vite app at the repo root (the blueprint layout), not a monorepo.
- `tsconfig.app.json` (src, strict, `noUncheckedIndexedAccess`) and `tsconfig.node.json`
  (config files, e2e) referenced from `tsconfig.json`; `npm run build` runs `tsc -b` first.
- Vitest config lives in `vite.config.ts` (`test` block); setup in `src/test/setup.ts`.
- Three.js and R3F are split into their own chunk (`advancedChunks`).
- Playwright starts the dev server on port 5174 and launches Chromium with SwiftShader so WebGL
  works without a GPU.
