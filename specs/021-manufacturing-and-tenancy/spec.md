# 021 — Enterprise Tenancy, DPDP Compliance & Deterministic Manufacturing (PRD v2)

**Status:** In Progress. Implements PRD v2 (Nov 1, 2026) across three sequential phases:
- **Step A: Foundation, Security Hardening, Data-Driven RBAC & DPDP Core**
- **Step B: Parametric Module Library, Seed RulePacks & Pure Manufacturing Engine**
- **Step C: Commercial Engine (HSN/SAC GST), 2D Shop Drawings & Deliverables**

## Context & Objectives

Transitioning Interior Studio from a client-side exploratory layout tool to an authoritative, enterprise design-to-manufacture CAD/CAM platform.

### Step A Requirements (Foundation, Security, DPDP & RBAC)
1. **Data-Driven RBAC**: Replace hardcoded roles with relational `permissions`, `roles`, `role_permissions`, and `org_members`. Implement the SQL `authorize(org_id, permission_key)` STABLE SECURITY DEFINER function. Enforce role rank guards preventing privilege escalation and a trigger preventing deletion of the last owner.
2. **DPDP Act 2023 Compliance**: Separate customer PII from `projects` into a dedicated `clients` and `consents` schema. Implement field-level masking via `clients_safe` view (masking phone numbers e.g. `98******21` and emails for viewer/production roles). All data residency pinned to `ap-south-1`.
3. **Append-Only Audit Log**: Create an un-truncatable, un-updatable `audit_log` with security triggers recording the 8 critical event families (sign-in, member/role change, PII export, quote actions, version approvals, cut-list downloads, margin edits, share links).
4. **Database Security Hardening**: Remediate SECURITY DEFINER functions with pinned `search_path = public, pg_temp`, change RLS policies from `public` to `authenticated`, and enforce tenant isolation.

### Step B Requirements (Parametric Library & Engine)
1. **RulePack Schema & seed-v1**: Configurable factory joinery parameters: board thicknesses (18mm carcass, 18mm shutter, 8mm back panel), 3mm reveals, 32mm system boring grid, 0.8mm/2.0mm edge-banding codes.
2. **Parametric Module Library**: Versioned `ModuleDefinition` schemas supporting base, wall, tall, drawer, sink, and corner units with semantic zones and hardware slots.
3. **Pure Zero-I/O Manufacturing Engine**: `explode(scene, rulePack, catalog)` calculating exact 0mm tolerance parts with edge deductions, grain orientation, and hole arrays.
4. **OptiCut 16-Column Cut-List Exporter**: Standard CSV output ready for panel saw optimization software.

### Step C Requirements (Commercials & Deliverables)
1. **GST & Bottom-Up Costing**: Tax split between HSN 9403 (18% Goods) and SAC 9954 (18% Design/Assembly Services) with margin governance.
2. **2D Shop Drawings**: SVG/DXF exports with title blocks, dimension strings, and MEP coordination overlays.

