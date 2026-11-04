# 026 Tasks — Razorpay Subscriptions & Feature Entitlement Gates

## Task List

- [x] Task 1: Domain Entitlements Catalog & Checking Engine
  - File: `src/domain/platform/entitlements.ts`
  - Define `PLANS` catalog (`trial`, `starter`, `pro`, `enterprise`), feature keys, and pure `checkEntitlement` evaluation function.
  - Unit tests: `src/domain/platform/entitlements.test.ts`.

- [x] Task 2: Domain Billing Provider Interface & In-Memory / Razorpay Adapters
  - File: `src/domain/platform/billing.ts`
  - Define `BillingProvider` interface, `InMemoryBillingAdapter`, and `RazorpayBillingAdapter` (with HMAC-SHA256 signature verification).
  - Unit tests: `src/domain/platform/billing.test.ts`.

- [x] Task 3: Billing & Entitlements State Store
  - File: `src/state/billingStore.ts`
  - Manage active subscription, plan, usage counters, and `useEntitlement` hook.
  - Unit tests: `src/state/billingStore.test.ts`.

- [x] Task 4: Upgrade Modal & Deliverables Feature Gating
  - File: `src/features/billing/UpgradeModal.tsx`
  - File: `src/features/deliverables/DeliverablesView.tsx`
  - Gate DXF export (`drawings.dxf`) and Accounting CSV (`accounting.export`) behind entitlements, presenting Upgrade Modal when locked.
  - Unit tests: `src/features/billing/UpgradeModal.test.tsx`.

- [x] Task 5: Studio Billing Settings UI
  - File: `src/features/billing/BillingSettingsView.tsx`
  - File: `src/components/layout/TopBar.tsx` (or studio modal integration)
  - Display current plan status, upgrade/downgrade selection, and invoice history.
  - Unit tests: `src/features/billing/BillingSettingsView.test.tsx`.

- [x] Task 6: Playwright E2E Test & Full DoD Verification
  - File: `e2e/billing-and-entitlements.spec.ts`
  - Test entitlement gating: attempt gated export on starter plan, trigger upgrade modal, upgrade to pro, verify gated export succeeds.
  - Run full suite: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/billing-and-entitlements.spec.ts`.

