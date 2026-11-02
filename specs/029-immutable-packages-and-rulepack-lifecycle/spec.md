# Spec 029 — Immutable Production Packages, SHA-256 Hashing & RulePack Lifecycle Gates (ARC-02, ARC-04, MFG-02)

## Context & Objectives
PRD v2.1 Section 6 & 8 introduces foundational enterprise manufacturing constraints:
- **`ARC-02`**: Immutable Production-Package Snapshot & Content Hash. Rather than exploding parts into independently mutable database rows, the system must generate a canonical, schema-versioned production package containing `parts[]`, `hardware[]`, and `edge_band_summary` alongside a deterministic **SHA-256 content digest**. Changing any cabinet dimension, material, or joinery rule creates a new package with a distinct hash, guaranteeing that factory-approved cut-lists are never silently mutated.
- **`ARC-04`**: Factory Rule Pack Provenance Lifecycle. Rule packs must distinguish:
  1. `provisional` (development fixture / unverified defaults)
  2. `designer_reviewed` (internal studio review)
  3. `factory_validated` (verified with machine saw parameters)
  4. `production_approved` (signed off for production release)
- **`MFG-02`**: Machine-enforced Production Readiness Gate. A production package cannot be certified as "Factory-Ready" or released for manufacturing cut-lists if it relies on a `provisional` rule pack.

## User Stories
1. **As a production manager / factory operator**, I want every generated production package to include a SHA-256 content hash so I can verify that the cut-list CSV, DXF shop drawings, and part labels match the exact design version approved by the client without post-approval tampering.
2. **As an interior designer**, I want the system to warn me if my project uses a `provisional` joinery rule pack and prevent me from falsely approving it for production until the factory has validated machine deductions.
3. **As a factory partner (e.g. Mihir)**, I want to upgrade a studio's rule pack from `provisional` to `factory_validated` or `production_approved` once board thicknesses and edge-band reveal calibrations are confirmed.

## Functional Requirements
- **FR-01**: RulePack Lifecycle Schema (`src/domain/manufacturing/rulePack.ts`):
  - Extend `RulePackSchema` with `status: 'provisional' | 'designer_reviewed' | 'factory_validated' | 'production_approved'`.
  - Add `signedOffBy?: string`, `signedOffAtIso?: string`.
  - Update `SEED_RULE_PACK_V1` with explicit status (defaulting to `provisional` fixture).
  - Provide a factory-approved fixture `FACTORY_VALIDATED_RULE_PACK_V1` with status `production_approved`.
- **FR-02**: Deterministic Canonical Serialization & SHA-256 Hashing (`src/engine/manufacturing/packageHash.ts`):
  - Canonical JSON stringifier (key-sorted, deterministic numeric formatting).
  - Web Crypto API (`crypto.subtle.digest('SHA-256', ...)`) hash generator compatible with Node.js, Chromium V8, and Edge runtimes.
  - Generates verifiable 64-character lowercase hex digest.
- **FR-03**: Integrate Package Hash into Explode Engine (`src/engine/manufacturing/explode.ts`):
  - Add `canonicalHash: string` and `rulePackStatus: RulePackStatus` to `ManufacturingPackage`.
  - Store immutable snapshot structure matching `ARC-02`.
- **FR-04**: Production Readiness Gate Enforcement (`src/engine/deliverables/readiness.ts`):
  - Add check: If the active rule pack is `provisional`, flag a blocking error: `"Provisional Rule Pack: Factory saw parameters and board reveals have not been verified. Cannot approve for production."`
  - Allow approval when rule pack status is `factory_validated` or `production_approved`.
- **FR-05**: UI Display of Package Hash & RulePack Status:
  - Display `Package Hash: sha256:...` in Deliverables view, cabinet schedule, and Client Presentation portal.
  - Display Rule Pack verification badge (Amber "Provisional" vs Green "Factory Approved").

