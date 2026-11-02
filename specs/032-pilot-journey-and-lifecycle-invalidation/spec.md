# Feature Spec 032: End-to-End Pilot Journey, Lifecycle Invalidation & Cut-List Part Traceability

- **Feature Branch:** `refactorV2`
- **PRD Reference:** PRD v2.1 Section 7 (`UX-07`), Section 8 (`MFG-01`, `COST-01`), Section 13 ("Vertical-slice acceptance gate")
- **Governance:** Constitution Principles I, III, VI, VII, X; `AGENTS.md` Pure TypeScript Engine Contract

---

## 1. Problem Statement

PRD v2.1 mandates that:
1. Designs follow an explicit lifecycle (`draft` → `client_presented` → `quote_approved` → `design_approved` → `factory_validated` → `production_released`).
2. Subsequent design changes must immediately invalidate affected approvals, quotes, cut-lists, and drawings (`UX-07`).
3. 100% of manufactured cut-list parts must be strictly traceable to their source module, design version, rule pack version, material, and generation algorithm (`MFG-01`).
4. Costing must snapshot versioned rate cards so pricing inputs remain reproducible over time (`COST-01`).
5. A full vertical-slice pilot journey test must exercise the entire lifecycle from client onboarding to verified production package generation.

---

## 2. Requirements & User Stories

### Story 1: Lifecycle Invalidation Engine (`UX-07`)
- **Given** an approved design milestone or signed client quote,
- **When** any geometric entity (cabinet size, position, opening, wall) or material finish is modified,
- **Then** the system detects revision divergence (`currentRevision !== approvedRevision`) and flags the previous approval as `invalidated`.
- **And** the Deliverables and Presentation views display a clear invalidation warning with variance details.

### Story 2: 100% Part-to-Module Lineage Traceability (`MFG-01`)
- **Given** any generated `ManufacturingPackage`,
- **When** inspecting `package.parts[]`,
- **Then** every single part has populated `moduleId`, `moduleType`, `rulePackId`, `rulePackVersion`, `material`, `thicknessMm`, `finishedDimensions`, `cutDimensions`, `edgeBanding`, and `generationAlgorithmVersion`.
- **And** zero unlinked or orphaned parts exist.

### Story 3: Versioned Rate Card Snapshotting (`COST-01`)
- **Given** commercial quotation generation,
- **When** a quotation is calculated,
- **Then** the active `RateCard` (version, effective date, shutter rates, carcass rates, hardware rates) is snapshotted into the quotation record, ensuring that future rate updates do not alter historical quotes.

### Story 4: Vertical-Slice End-to-End Pilot Journey (`PRD-13.3`)
- **Given** a new studio client,
- **When** following the 12-step pilot workflow in Playwright,
- **Then** all steps execute cleanly with zero errors, producing an immutable production package with a verified SHA-256 digest and full audit logging.
