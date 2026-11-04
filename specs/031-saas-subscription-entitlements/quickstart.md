# Feature 031 Quickstart & Validation Guide

This quickstart guides developers and reviewers through exercising the **Multi-Tenant SaaS Subscription, Entitlement & Unified Policy Evaluation Platform**.

---

## 1. Unit & Domain Integration Validation

Run the dedicated domain test suites:

```bash
# 1. Test Subscription Catalog & Versioning
npx vitest run src/domain/platform/saas/subscriptionCatalog.test.ts

# 2. Test Layered Effective Entitlements (Base + Add-ons + Overrides)
npx vitest run src/domain/platform/saas/effectiveEntitlements.test.ts

# 3. Test Usage Quota Manager & Concurrency Safety
npx vitest run src/domain/platform/saas/quotaManager.test.ts

# 4. Test Unified Policy Evaluation Engine (6-Term Formula)
npx vitest run src/domain/platform/saas/policyEngine.test.ts

# 5. Test Non-Destructive Downgrade Retention
npx vitest run src/domain/platform/saas/downgradeRetention.test.ts
```

---

## 2. In-App Interactive Validation (Studio Table Editor)

1. **Launch Dev Server**:
   ```bash
   npm run dev
   ```
2. **Open Table Editor & Subscription Tab**:
   - Create or open a project.
   - Click the `Studio Tables` button in the top navigation bar.
   - Click the new **Subscription & Entitlements** tab.
3. **Verify Plan & Entitlement Inspector**:
   - Inspect the current tenant plan tier (e.g. `Pro Studio v1`).
   - Observe the live commercial quota meters:
     - `Active Projects: 4 / Unlimited`
     - `Designer Seats: 2 / 5`
     - `Rendering Credits: 85 / 100`
4. **Test Quota Guard**:
   - Switch tenant plan to `Starter Studio` (Limit: 15 active projects).
   - If project count > 15, observe the non-destructive **Project Roster Selection** dialog.
   - Verify that non-selected projects display the `READ-ONLY ARCHIVE` badge.
5. **Test Commercial Upgrade Modal**:
   - Attempt an action restricted to Enterprise (e.g. `Custom Manufacturing RulePack`).
   - Verify the `PlanUpgradeModal` appears, detailing the missing capability and upgrade path.

---

## 3. Playwright End-to-End Test Execution

```bash
npx playwright test e2e/saas-subscription-lifecycle.spec.ts
```
- Verifies plan upgrades, quota enforcement, downgrade roster retention, and UI button adaptation.
