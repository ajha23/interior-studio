# 026 Specification — Razorpay Subscriptions & Feature Entitlement Gates

## 1. Context & Motivation
Interior Studio supports multi-tier tenant plans (`trial`, `starter`, `pro`, `enterprise`) as required by PRD v2 Section J (`ENT-01` to `ENT-09`) and Section K (`BIL-01` to `BIL-10`).
Studios in India subscribe via Razorpay Subscriptions with automatic monthly/annual recurring debits, GST tax invoice generation, and real-time webhook status updates.
Within the application, premium capabilities (e.g. CNC DXF export, OptiCut CSV, Tally/Zoho accounting CSV, AI layout solver, unlimited projects) must be gated cleanly through a data-driven entitlement system (`useEntitlement`) that prevents unauthorized usage without degrading user experience or corrupting project data.

## 2. Requirements & User Stories

### User Stories
- **As a Studio Owner**, I want to see our active subscription plan, billing cycle, renewal date, and past GST invoices in a Billing Settings view so I can manage studio operational costs.
- **As a Studio Owner**, I want to upgrade our plan from Starter to Pro using Razorpay Subscriptions so our workshop can export CNC DXFs and OptiCut CSVs.
- **As a Designer on a Starter plan**, when I attempt to access a Pro feature (e.g. DXF CAD Plan or Accounting CSV), I should see an informative Upgrade Dialog rather than an unhandled error.
- **As a Platform Developer / CI Pipeline**, I want billing integration to rely on a decoupled `BillingProvider` interface with an `InMemoryBillingAdapter` so that unit and end-to-end tests run reliably offline with deterministic fixture data.

### Functional Requirements
- **ENT-01**: Tier Plan Definitions: `trial`, `starter`, `pro`, `enterprise` with bounded feature flags and numerical limits (`projects.max_active`, `seats.designers`, `drawings.dxf`, `cutlist.export`, `accounting.export`, `ai.layout`).
- **ENT-02**: Entitlement Evaluation: Pure domain function `checkEntitlement(plan, usage, featureKey)` returning `{ allowed: boolean; reason?: string; limit?: number; current?: number }`.
- **ENT-07**: React Hook `useEntitlement(featureKey)` and UI Upgrade Modal triggering when a gated action is attempted.
- **BIL-01**: `BillingProvider` interface abstracting subscription creation, retrieval, cancellation, and webhook verification.
- **BIL-02**: `InMemoryBillingAdapter` providing deterministic testing and offline mock subscriptions.
- **BIL-03**: `RazorpayBillingAdapter` implementing HMAC-SHA256 webhook signature verification and checkout options generator.
- **BIL-07**: Studio Billing Settings UI with plan cards, active status badges, and invoice history list.

## 3. Non-Functional & Architecture Requirements
- Domain purity: `src/domain/platform/entitlements.ts` and `src/domain/platform/billing.ts` remain framework-free TypeScript (zero React/DOM/Node-only libs).
- Security: Webhook verification uses standard crypto primitives without leaking private webhook secrets to browser clients.
- Determinism: Integer paise used for all currency amounts (₹4,999/mo = 499900 paise; ₹12,999/mo = 1299900 paise).

