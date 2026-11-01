# 022 — Tasks

## 1. Domain & Validation
- [x] MEP Point schema and types (`src/domain/mep/schema.ts`)
- [x] Project schema extension with `mep` array (`src/domain/schema.ts`)
- [x] MEP safety and clearance checks (`src/engine/checks/mepChecks.ts`)
- [x] Unit tests for MEP schema and safety checks (`src/engine/checks/mepChecks.test.ts`)

## 2. DXF CAD Exporter
- [x] Pure ASCII DXF writer with layered CAD output (`src/engine/deliverables/dxf.ts`)
- [x] Plan projection to DXF entities (walls, cabinets, worktops, MEP points, labels)
- [x] Unit tests for DXF export syntax and layer structures (`src/engine/deliverables/dxf.test.ts`)

## 3. UI & Deliverables Integration
- [x] Add `'dxf-plan'` to `DeliverableKind` in `deliverablesStore.ts`
- [x] Wire DXF CAD export action button into `DeliverablesView.tsx` toolbar
- [x] Integrate MEP safety checks into `checkReadiness` (`src/engine/deliverables/readiness.ts`)
- [x] Browser E2E verification of DXF generation and download (`e2e/dxf-export.spec.ts`)
- [x] All 59 Vitest test suites (453 tests) and production build passing cleanly
