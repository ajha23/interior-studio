# 021 — Design

## Architecture & Boundaries

1. **Downwards-only Pure Domain Layers**:
   - `src/domain/platform/rbac.ts`: Pure TypeScript RBAC models, permission definitions, role hierarchy, and `can(actor, org, permission)` logic.
   - `src/domain/platform/dpdp.ts`: DPDP Act 2023 masking primitives (`maskPhoneNumber`, `maskEmail`, `maskAddress`), consent models, and data redaction rules.
   - `src/domain/platform/audit.ts`: Immutable audit record envelope, event family schemas, and tamper detection.
   - `src/domain/manufacturing/rulePack.ts`: `RulePackSchema`, `seed-v1` factory standard parameters (18mm carcase, 8mm back groove, 32mm system boring).
   - `src/domain/manufacturing/moduleDefinition.ts`: Parametric module schema with dimensions, parts, hardware slots, and boring specifications.
   - `src/engine/manufacturing/explode.ts`: Pure deterministic explode function converting room elements into cut-ready parts.
   - `src/engine/manufacturing/opticutCsv.ts`: 16-column CSV generator matching industrial beam-saw optimizers.
   - `src/engine/commercial/gst.ts`: Indian GST calculation splitting HSN 9403 and SAC 9954 items.

2. **Database Migrations (`supabase/migrations/`)**:
   - `00001_security_hardening.sql`: Fixes `search_path`, enforces `authenticated` RLS.
   - `00002_rbac_and_entitlements.sql`: Relational RBAC, `authorize()`, last-owner guard, privilege escalation check.
   - `00003_dpdp_clients_and_consents.sql`: `clients`, `consents`, `clients_safe` masked view.
   - `00004_append_only_audit_log.sql`: Partitioned `audit_log`, tamper prevention trigger.

