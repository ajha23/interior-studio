# 025 Tests — Studio Table Editor, DPDP Data Erasure & Accounting Export

## Acceptance Criteria & Test Scenarios

### 1. DPDP Client Data Erasure & Export (DP-03)
- Exporting a client record produces a structured JSON bundle with name, contact, consent timestamp, and linked project metadata.
- Erasing a client record:
  - Replaces name with `Anonymized Client`.
  - Replaces mobile with `0000000000`.
  - Replaces address with `Redacted per DPDP Section 12`.
  - Marks `isAnonymized: true`.
  - Keeps linked project geometries, dimensions, and quotes completely intact.

### 2. Accounting CSV Export for Tally / Zoho Books (GST-06)
- Given a quotation with HSN 9403 goods (₹50,000) and SAC 9954 services (₹12,500) under Intra-State tax:
  - Line 1: HSN 9403, Taxable: 50000, CGST: 4500, SGST: 4500, IGST: 0, Total: 59000.
  - Line 2: SAC 9954, Taxable: 12500, CGST: 1125, SGST: 1125, IGST: 0, Total: 14750.
  - CSV header conforms to Tally Prime / Zoho Books standard fields.

### 3. Studio Table Editor (SEC-08)
- Owner can view clients, filter by search term, and see consent timestamps.
- Audit log tab lists events (`sign_in`, `quote_sign_off`, `cutlist_download`) with timestamps and actors.
- Non-owners cannot open the studio table editor.

