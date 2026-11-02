# 025 — Studio Table Editor, DPDP Data Erasure & Accounting Export

**Status:** In Progress. Implements PRD v2 Phase 3 & Sprint 2 (SEC-08, DP-03, GST-06).

## 1. Background & Business Value
Studio owners need an executive command center to manage their studio's data without needing direct access to the raw Supabase database console. Specifically:
1. **Studio Table Editor (`SEC-08`)**: A high-performance in-app data grid with instant search and role filtering for Clients (with DPDP consent tracking), Projects, Team Members, and the Append-Only Security Audit Log.
2. **DPDP Compliance Lifecycle (`DP-03`)**: Statutory capability to export client data upon verified request, or execute compliant data erasure (anonymizing contact PII like name, mobile, email, and address while legally retaining anonymized project geometry and tax records required for tax audit compliance).
3. **Accounting Export (`GST-06`)**: Tally and Zoho Books compatible CSV export formatted with invoice number, client GSTIN, HSN 9403 / SAC 9954 itemized taxable amounts, and CGST/SGST/IGST tax splits.

## 2. Requirements

### 2.1 Studio Table Editor (SEC-08)
- Owner-only access gate (`role === 'owner'`).
- Interactive tabular views for:
  - **Clients**: Client Name, Mobile (masked for unauthorized roles), Email, Site Address, Consent Version, Consent Timestamp.
  - **Projects**: Project Name, Status (`draft`, `approved`, `in_production`, `installed`), Revision, Created At, Client Association.
  - **Team Members**: User Name, Role (`owner`, `admin`, `designer`, `production`, `viewer`), Joined Date.
  - **Audit Log**: Timestamp, Actor, Action (`sign_in`, `role_change`, `quote_sign_off`, `cutlist_download`), Entity, IP Address.
- Live search bar and filter controls across all columns.

### 2.2 DPDP Client Data Export & Compliant Erasure (DP-03)
- Pure platform function `exportClientData(clientId)`: Returns a structured JSON/CSV export of all personal data held for that client.
- Pure platform function `eraseClientData(clientId)`:
  - Redacts PII in the client record: sets name to `Anonymized Client`, phone to `0000000000`, email to empty, and address to `Redacted per DPDP Section 12`.
  - Retains all geometric kitchen project data, production cut lists, and GST tax invoice numbers intact.
  - Appends an authoritative `client.erased` entry to the append-only `audit_log`.

### 2.3 Accounting CSV Export for Tally / Zoho Books (GST-06)
- Pure commercial function `exportAccountingCsv(quote, metadata)`:
  - Produces standard ERP-importable CSV format matching Tally Prime / Zoho Books specifications.
  - Headers: `Voucher Date,Voucher Type,Voucher Number,Party Name,Party GSTIN,Place of Supply,Item Description,HSN/SAC,Taxable Value,CGST Amount,SGST Amount,IGST Amount,Total Amount`.

## 3. Definition of Done
1. Zero framework imports in `src/domain/platform/` and `src/engine/commercial/`.
2. Unit tests pass for DPDP erasure/export and accounting CSV mapper.
3. React component tests for Studio Table Editor.
4. Playwright E2E test verifying owner table editor navigation, accounting CSV download, and erasure workflow.
5. `npm run lint && npm run typecheck && npm test && npm run build` pass with 0 errors.

