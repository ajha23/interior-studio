# 026 Tests — Razorpay Subscriptions & Feature Entitlement Gates

## Unit Tests
1. `src/domain/platform/entitlements.test.ts`:
   - Validates that `trial` plan blocks `drawings.dxf`, `accounting.export`, and caps active projects at 5.
   - Validates that `starter` plan allows `cutlist.export` but blocks `drawings.dxf` and caps active projects at 15.
   - Validates that `pro` plan allows `drawings.dxf`, `accounting.export`, `cutlist.export`, and unlimited active projects (-1).
   - Validates usage counter checking against numeric limits.
2. `src/domain/platform/billing.test.ts`:
   - `InMemoryBillingAdapter` creates subscriptions, changes status, and cancels subscriptions deterministically.
   - `RazorpayBillingAdapter` verifies valid HMAC-SHA256 signatures and rejects forged or tampered webhooks.
3. `src/state/billingStore.test.ts`:
   - Initial plan defaults to `inhouse` / `pro`.
   - Upgrading/downgrading updates entitlements dynamically.
4. `src/features/billing/UpgradeModal.test.tsx`:
   - Renders upgrade dialog explaining the locked feature and target tier.
   - Clicking "Upgrade Now" initiates subscription change and closes dialog.
5. `src/features/billing/BillingSettingsView.test.tsx`:
   - Renders plan cards, renewal date, and billing history list.

## End-to-End Tests
`e2e/billing-and-entitlements.spec.ts`:
- Loads app in Starter tier mode.
- Navigates to Deliverables and attempts to download 2D CAD Plan (DXF) or Tally Accounting CSV.
- Verifies Upgrade Modal appears with message that Pro is required.
- Clicks "Upgrade to Pro" in the dialog.
- Verifies subscription becomes Pro and DXF / Accounting CSV downloads successfully.

