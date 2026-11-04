# 025 Tasks — Studio Table Editor, DPDP Data Erasure & Accounting Export

## Task List

- [x] Task 1: DPDP Client Data Export & Compliant Erasure Engine
  - File: `src/domain/platform/dpdp.ts`
  - Implement `exportClientData` and `eraseClientData` (anonymizes PII while preserving legal project & tax geometry).
  - Add unit tests in `src/domain/platform/dpdp.test.ts`.

- [x] Task 2: Accounting CSV Export for Tally / Zoho Books
  - File: `src/engine/commercial/accountingCsv.ts`
  - Implement `generateAccountingCsv(quote, meta)` producing standard voucher-based accounting CSV with HSN/SAC splits.
  - Add unit tests in `src/engine/commercial/accountingCsv.test.ts`.

- [x] Task 3: Deliverables Integration for Accounting Export
  - File: `src/state/deliverablesStore.ts`
  - File: `src/features/deliverables/DeliverablesView.tsx`
  - Add `'accounting-csv'` to `DeliverableKind` and export button in Quotation view.

- [x] Task 4: Owner Studio Table Editor UI Component
  - File: `src/features/table-editor/StudioTableEditor.tsx`
  - Implement owner-facing table editor modal with live search, role filtering, tabs for Clients, Projects, Team, and Audit Log.
  - Add unit test in `src/features/table-editor/StudioTableEditor.test.tsx`.

- [x] Task 5: App Shell Navigation for Studio Table Editor
  - File: `src/components/layout/TopBar.tsx`
  - Add "Studio Tables" button accessible for owners.

- [x] Task 6: Playwright E2E Test & Verification
  - File: `e2e/studio-table-editor.spec.ts`
  - Test opening Studio Table Editor, searching clients, triggering DPDP export, and downloading accounting CSV.
  - Run full suite: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/studio-table-editor.spec.ts`.
