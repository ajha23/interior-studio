# Implementation Plan: Algorithmic 2D Sheet Nesting, Cutting Optimization & Visual Workshop Layouts

**Branch**: `032-sheet-nesting-optimization` | **Date**: 2026-11-02 | **Spec**: [specs/032-sheet-nesting-optimization/spec.md](file:///Users/akhil/WorkSpace/interior-studio-rewrite/specs/032-sheet-nesting-optimization/spec.md)

**Input**: Feature specification from `/specs/032-sheet-nesting-optimization/spec.md`

---

## Summary

Implement an algorithmic 2D rectangular bin-packing engine and interactive workshop visualizer that converts kitchen/wardrobe panel cut lists into optimized cutting layouts on standard raw sheet stock ($2440 \times 1220\text{ mm}$ / 8' × 4'). The engine supports dual cutting modes (Guillotine table saw through-cuts by default, CNC Router nesting), respects part grain orientation constraints, accounts for $3.2\text{ mm}$ saw kerf and $10\text{ mm}$ perimeter trim margin, segregates materials, classifies reusable offcuts ($\ge 600 \times 600\text{ mm}$), and provides multi-format exports (interactive SVG, AutoCAD R12 DXF, and printable workshop cutting reports) gated under SaaS manufacturing entitlements.

---

## Technical Context

**Language/Version**: TypeScript 5.8 (Strict Mode), Node.js v22  
**Primary Dependencies**: React 19, Tailwind CSS, Lucide React, Zod (Pure nesting engine in `src/engine/production/nesting/` is 100% framework-free TypeScript with zero external UI/runtime dependencies)  
**Storage**: Transient cutting layout derived from project BOM cut list; saved workshop preferences in local storage  
**Testing**: Vitest 3 (`*.test.ts`, `*.test.tsx`), React Testing Library, Playwright 1.50 (`e2e/`)  
**Target Platform**: Modern Evergreen Browsers (Chrome, Firefox, Safari, Edge)  
**Project Type**: Web Application + Framework-Free Algorithmic Computational Engine  
**Performance Goals**: < 500ms deterministic execution for 150 panels on the main browser thread; 60fps pan/zoom in SVG viewer  
**Constraints**: 
- Strict integer millimetres in domain geometry (Constitution Principle III)
- Pure framework-free engine without React, Three.js, or DOM imports (Constitution Principle I)
- Zero part overlaps and exact mathematical containment within raw sheet boundaries (Constitution Principle V)
- Commercial entitlement gating via `feature.manufacturing.sheet_nesting` and quota tracking via `quota.nesting_runs.monthly.max`  
**Scale/Scope**: 150+ panels per kitchen project, 1–20 sheets per material, multi-sheet interactive pagination

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check Item | Evaluation | Status |
|-----------|------------|------------|--------|
| **Principle I: Architectural Layer Isolation** | Is `src/engine/production/nesting/` free of React, Three.js, and DOM imports? | Yes. Verified: pure mathematical functions taking typed inputs and returning pure data structures. ESLint `no-restricted-imports` enforced. | **PASS** |
| **Principle II: State Mutation via Commands** | Does nesting mutate project state outside the command pipeline? | No. Nesting is an analytical and manufacturing view derived from the project BOM/cut-list. Any project property edits go through standard commands. | **PASS** |
| **Principle III: Integer Millimetres** | Are all board, panel, kerf, trim, and coordinate dimensions represented in integer millimetres? | Yes. Raw sheets ($2440 \times 1220\text{ mm}$), trim margin ($10\text{ mm}$), offcut minimum ($600\text{ mm}$), and panel positions ($X, Y$) are integer mm. Kerf $3.2\text{ mm}$ is handled with precise floating-point or tenths of mm offsets. | **PASS** |
| **Principle IV: Derived Geometry** | Are nested sheet layouts derived on demand rather than stored as mutable project mesh state? | Yes. The engine takes the existing BOM cut list as input and deterministically computes the layout. | **PASS** |
| **Principle V: Manufacturing Traceability** | Does the nesting layout match actual workshop cutting constraints (kerf, trim, grain, guillotine through-cuts)? | Yes. Dual-mode cutting supports panel saws and CNC routers, grain is locked for fronts, and reusable offcuts $\ge 600 \times 600\text{ mm}$ are inventoried. | **PASS** |

---

## Project Structure

### Documentation (this feature)

```text
specs/032-sheet-nesting-optimization/
├── plan.md              # Implementation Plan
├── research.md          # Phase 0: Technical decisions & heuristics
├── data-model.md        # Phase 1: Domain schemas & entities
├── quickstart.md        # Phase 1: Test & verification commands
├── contracts/           # Phase 1: Engine and Exporter contracts
│   ├── nesting-engine.contract.ts
│   └── nesting-exporter.contract.ts
├── checklists/
│   └── requirements.md  # Requirements verification checklist
└── tasks.md             # Phase 2: Sequential task breakdown
```

### Source Code Layout

```text
src/
├── engine/
│   └── production/
│       └── nesting/
│           ├── types.ts                     # Domain types, Zod schemas, constants
│           ├── grainPolicy.ts               # Part role grain rules & rotation logic
│           ├── guillotineBinPacker.ts       # Recursive guillotine cut tree packer (BAF/BSSF)
│           ├── nestingEngine.ts             # Multi-sheet multi-material optimization engine
│           ├── dxfExporter.ts               # AutoCAD R12 DXF generator for CAM/CNC
│           ├── workshopReport.ts            # Printable workshop HTML cutting sheet generator
│           ├── guillotineBinPacker.test.ts  # Unit tests for guillotine packing & containment
│           ├── grainPolicy.test.ts          # Unit tests for grain orientation rules
│           ├── nestingEngine.test.ts        # Unit tests for multi-material nesting
│           └── dxfExporter.test.ts          # Unit tests for DXF entity formatting
├── features/
│   └── manufacturing/
│       ├── CuttingLayoutsPanel.tsx          # Main workshop nesting UI panel
│       ├── SheetCanvasViewer.tsx            # Responsive SVG vector sheet visualizer
│       ├── OffcutSummaryCard.tsx            # Offcut inventory & yield metric cards
│       ├── NestingExportDropdown.tsx        # DXF / SVG / PDF / Print export actions
│       ├── CuttingLayoutsPanel.test.tsx     # RTL tests for manufacturing UI
│       └── SheetCanvasViewer.test.tsx       # RTL tests for SVG canvas viewer
└── domain/
    └── billing/
        └── (existing entitlement infrastructure used via useSubscriptionPolicy)

e2e/
└── sheet-nesting-and-cutting.spec.ts        # Playwright E2E workshop nesting workflow
```

---

## Complexity Tracking

*No constitutional violations. Pure modular TypeScript engine, zero new external npm dependencies required.*
