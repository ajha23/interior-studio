# 023 — Multi-Room Packs, Wardrobe Parametric Modules & Client Presentation Portal

**Status:** In Progress. Implements PRD v2 Phase 3.2 (RM-01 to RM-03) and Phase 3.3 (PR-02, PR-05, CP-06).

## 1. Background & Business Value
Indian interior design studios deliver full homes (Kitchen, Master Bedroom, Wardrobes, Vanity, Living Room) rather than isolated kitchens. Once designs are finalized, studios require:
1. **Multi-Room & Wardrobe Module Coverage**: Wardrobe carcasses (hinged, sliding, lofts), BWP-grade washroom vanities, and parametric loose furniture (dining tables, desks) feeding the same 0-tolerance manufacturing explode engine.
2. **Quote Revision Diffing**: Clear line-item comparisons between revisions (e.g. Rev 1 vs Rev 2) showing added, removed, and modified items with ₹ deltas.
3. **Client Presentation Mode & Digital Sign-Off**: A client-safe, margin-free presentation view with interactive 3D walk/inspect, dimensioned sheets, quotation breakdown, and legal digital acceptance logging (DPDP consent, timestamp, client IP, quote SHA-256).

## 2. Requirements

### 2.1 Multi-Room & Wardrobe Parametric Modules (RM-01, RM-02, RM-03)
- Define parametric module types for:
  - `wardrobe-hinged`: 2-door or 3-door hinged wardrobe with full-height gable sides, top/bottom shelves, hanging rail zone, and optional internal 2-drawer box.
  - `wardrobe-sliding`: 2-door sliding wardrobe with track allowances, internal partition, adjustable shelving, and loft unit.
  - `vanity-bwp`: Moisture-resistant washroom vanity defaulting to BWP-grade plywood carcass, sink plumbing cutout, and waterproof PVC edge-banding.
  - `loose-dining-table`: Parametric 4-leg dining table with top panel, support aprons, and corner brackets.
  - `loose-study-desk`: Parametric study desk with work surface, modesty panel, and pedestal storage.
- All wardrobe, vanity, and loose furniture modules must run through the pure `explodeCabinet()` / `explodeScene()` pipeline and emit factory-ready parts with edge-band codes and 32mm hole patterns.

### 2.2 Quote Revision Diffing & Option Boards (CP-06, PR-02)
- Pure engine function `diffQuotes(quoteA, quoteB)` returning:
  - `added`: Array of line items present in B but not A.
  - `removed`: Array of line items present in A but not B.
  - `modified`: Array of line items with quantity or rate changes.
  - `delta`: Numerical difference in integer paise for goods, services, CGST, SGST, IGST, and total.
- Finish option pricing helper calculating instant ₹ delta between material tier selections.

### 2.3 Client Presentation & Portal Sign-Off (PR-05, DPDP)
- Domain schema `ClientSignOff`:
  - `quoteId`: string
  - `quoteSha256`: string
  - `clientName`: string
  - `clientMobile`: string
  - `status`: `'pending' | 'accepted' | 'rejected'`
  - `timestamp`: string (ISO 8601)
  - `ipAddress`: string
  - `consentVersion`: string
- Locked presentation UI mode in `DeliverablesView`:
  - Strips all internal costs, margins, and manufacturing cut-list buttons.
  - Displays client project summary, interactive 3D snapshot, dimensioned drawing sheets, and statutory HSN/SAC quotation.
  - "Accept & Approve Quote" digital sign-off dialog capturing client confirmation and appending to the audit log.

## 3. Definition of Done
1. All modules in `src/domain` and `src/engine` remain 100% framework-free TypeScript (zero React/Three.js/DOM).
2. Integer millimetres and integer paise throughout.
3. Unit tests pass for wardrobe/vanity explode, quote diffing, and sign-off schemas.
4. UI and Playwright E2E test verifying client presentation mode and digital sign-off.
5. `npm run lint && npm run typecheck && npm test && npm run build` all pass with 0 errors.

