# 001 — Tests

- CI pipeline itself (`.github/workflows/ci.yml`) is the test: lint, typecheck, unit, build, e2e.
- Manual check: add `import 'react'` to a file in `src/domain` → `npm run lint` must fail.
