# Architecture Decision Record (ADR): Workspace Topology & 8 Bounded Domain Packages

- **Status:** Approved / In Execution
- **Context Reference:** PRD v2.1 Section 6 (`ARC-01: Monorepo structure and dependency boundaries`)
- **Date:** November 2026

---

## 1. Context & Motivation

PRD v2.1 mandates strict architectural boundaries to elevate Interior Studio from an interactive 3D web tool to an authoritative, enterprise-grade **Design-to-Manufacture Operating System**.

To eliminate cyclic coupling and enforce strict purity across computational layers:
1. Computation and business rules must run identically in client (browser V8) and background workers/server (Node/Deno).
2. The engine must have **zero** DOM, React, Three.js, network, or filesystem dependencies.
3. Billing belongs under platform governance (`@studio/platform/billing`), strictly capping domain packages at **eight bounded packages**.

---

## 2. Decision: 8 Bounded Domain Packages & Applications

The workspace topology defines 8 domain packages plus 2 applications:

```
├── packages/
│   ├── @studio/core          # Canonical KitchenProject schemas, 32mm units, Command pipeline, undo/redo
│   ├── @studio/platform      # RBAC, Tenancy, Billing (Stripe/Razorpay), DPDP compliance, Audit logging
│   ├── @studio/catalog       # Standard modules (base, wall, tall, wardrobes), finishes, hardware hardware
│   ├── @studio/engine        # Pure geometric kernel: procedural parts, collision, 32mm boring, OptiCut CSV, packageHash
│   ├── @studio/measure       # Mobile site survey wizard, ±10mm wall closure diagnostic solver, photo tagging
│   ├── @studio/commercial    # Indian GST engine (HSN 9403/SAC 9954), Tally/Zoho accounting CSV, cost-down advisor
│   ├── @studio/deliverables  # AutoCAD DXF generator, single-module SVG shop drawings, thermal part labels, readiness gates
│   └── @studio/ai            # Layout generative solver, voice NL copilot, camera walkthrough script generator
└── apps/
    ├── apps/web              # Single-page Vite/React/Three.js desktop & mobile designer application
    └── apps/workers          # Async background worker: 1080p walkthrough MP4 rendering, heavy PDF/DXF batch exports
```

---

## 3. Dependency Graph & Directed Acyclic Graph (DAG)

Dependencies flow strictly downward. Cycles are rejected at compile time:

```mermaid
graph TD
  apps_web[apps/web] --> deliverables[@studio/deliverables]
  apps_web --> commercial[@studio/commercial]
  apps_web --> measure[@studio/measure]
  apps_web --> platform[@studio/platform]
  apps_web --> ai[@studio/ai]
  
  apps_workers[apps/workers] --> deliverables
  apps_workers --> engine[@studio/engine]

  deliverables --> engine
  deliverables --> catalog[@studio/catalog]
  deliverables --> core[@studio/core]

  commercial --> engine
  commercial --> core

  ai --> engine
  ai --> catalog
  ai --> core

  measure --> core

  engine --> catalog
  engine --> core

  platform --> core
```

---

## 4. Enforcement Mechanisms

1. **Pure TypeScript Engine Contract:**
   - No `window`, `document`, `localStorage`, or React/Three.js imports allowed in `@studio/core`, `@studio/engine`, `@studio/measure`, `@studio/commercial`.
   - Enforced by ESLint `no-restricted-imports`.

2. **Deterministic Arithmetic (`ARC-03`):**
   - Dimensions are integer millimetres in the domain.
   - Money and tax are integer paise.
   - Canonical JSON stringification with sorted keys and pure SHA-256 digests.

3. **Interim Monolith-to-Monorepo Bridge:**
   - The codebase maintains these 8 modular domains under `src/domain/`, `src/engine/`, `src/features/` with isolated directory boundaries, verified by `tsconfig.json` path mappings and strict lint rules.
   - Migration to pnpm workspaces preserves existing import paths through package namespace aliases.

