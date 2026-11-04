# 021 — Tests

## Step A Tests
- `src/domain/platform/rbac.test.ts`:
  - Enforces role hierarchy (`owner` > `admin` > `designer` > `production` > `viewer`).
  - Blocks privilege escalation (user cannot assign a role higher or equal to their own unless owner).
  - Evaluates granular permissions correctly across roles.
- `src/domain/platform/dpdp.test.ts`:
  - Correctly masks 10-digit Indian mobile numbers (`9876543210` -> `98******10`).
  - Masks emails while preserving domain for debugging (`john.doe@example.com` -> `j***e@example.com`).
  - Verifies consent expiration and withdrawal status.
- `src/domain/platform/audit.test.ts`:
  - Formats immutable audit payload with actor, tenant, timestamp, and metadata.
  - Verifies event categorization for the 8 PRD v2 required families.

## Step B Tests
- `src/domain/manufacturing/rulePack.test.ts`:
  - Validates `seed-v1` against 18mm carcass, 18mm shutter, 3mm reveal, 32mm hole pitch.
- `src/engine/manufacturing/explode.test.ts`:
  - Explodes a base cabinet (600x720x560) into left side, right side, bottom, stretchers, back panel, and shelf.
  - Applies edge-banding deductions (0.8mm / 2mm) to finished panel cutting sizes.
  - Generates 32mm system boring coordinates.
- `src/engine/manufacturing/opticutCsv.test.ts`:
  - Generates 16-column OptiCut CSV matching header and column constraints.

## Step C Tests
- `src/engine/commercial/gst.test.ts`:
  - Computes HSN 9403 goods GST at 18% (9% CGST + 9% SGST / 18% IGST).
  - Computes SAC 9954 services GST at 18% with correct tax invoice summary.

