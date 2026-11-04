# 021 — Tasks

## Step A: Foundation, Security Hardening, Data-Driven RBAC & DPDP Core
- [x] Database hardening migration (`00001_security_hardening.sql`)
- [x] Data-driven RBAC schema & `authorize()` function (`00002_rbac_and_entitlements.sql`)
- [x] DPDP Act 2023 `clients`, `consents`, and `clients_safe` migration (`00003_dpdp_clients_and_consents.sql`)
- [x] Append-only `audit_log` migration with security triggers (`00004_append_only_audit_log.sql`)
- [x] TypeScript Domain Platform: RBAC types and evaluation engine (`src/domain/platform/rbac.ts`)
- [x] TypeScript Domain Platform: DPDP masking & consent verification (`src/domain/platform/dpdp.ts`)
- [x] TypeScript Domain Platform: Audit log structures and formatters (`src/domain/platform/audit.ts`)
- [x] Vitest unit tests for Step A domain modules (`src/domain/platform/*.test.ts`)

## Step B: Parametric Module Library & Manufacturing Engine
- [x] `RulePack` schema and `seed-v1` standard factory rules (`src/domain/manufacturing/rulePack.ts`)
- [x] Parametric `ModuleDefinition` library schema (`src/domain/manufacturing/moduleDefinition.ts`)
- [x] Pure deterministic `explode()` engine (`src/engine/manufacturing/explode.ts`)
- [x] 32mm system drilling & edge-band deduction calculators
- [x] Factory-ready 16-column OptiCut CSV exporter (`src/engine/manufacturing/opticutCsv.ts`)
- [x] Vitest unit tests for manufacturing engine and CSV export (`src/domain/manufacturing/`, `src/engine/manufacturing/`)

## Step C: Commercials, Shop Drawings & Deliverables
- [x] Bottom-up costing and HSN 9403 / SAC 9954 GST split engine (`src/engine/commercial/gst.ts`)
- [x] Quotation & Indian GST interactive panel in Deliverables Studio (`src/features/deliverables/QuotationPanel.tsx`)
- [x] Direct export integration in `deliverablesStore.ts` for `opticut-csv` and `quotation-csv`
- [x] Component test suite for `QuotationPanel` (`src/features/deliverables/QuotationPanel.test.tsx`)
- [x] E2E integration tests passing (`e2e/drawings.spec.ts`, `e2e/deliverables.spec.ts`)
- [x] Full lint, typecheck, unit test suite (57 test files, 448 tests), and production build passing
