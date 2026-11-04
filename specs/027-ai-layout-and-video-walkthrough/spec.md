# Spec 027 — AI Layout Suggester, Cost-Down Advisor & Walkthrough Video Outbox Worker

## Context & Objectives
PRD v2 mandates intelligent assistant capabilities (`AI-01`, `AI-03`) and async video presentation generation (`PR-04`) to give interior designers superpower speed:
- `AI-01`: Guarded Layout Suggester — connects parametric module definitions (`src/domain/manufacturing/moduleDefinition.ts`) to natural language design intent and generates valid sequences adhering strictly to 32mm system increments and clearance constraints.
- `AI-03`: Automated Cost-Down Advisor — analyzes current layout BOM and recommends direct parametric swaps that reduce edge-band meters, runner count, or carcase wastage (e.g. recommending 1x 900mm wide 2-door base over 2x 450mm units, or 1x 600mm 3-drawer vs 2x 300mm narrow units), displaying clear before/after cost difference in integer paise.
- `PR-04`: Headless Walkthrough Video Outbox Worker — queues an async rendering job for a 30-second camera path through the 3D interior, simulating keyframe camera waypoint interpolation, progress states (`queued`, `rendering`, `ready`, `failed`), and video download readiness.

## User Stories
1. **As a designer**, I want the AI layout suggester to suggest valid kitchen and wardrobe arrangements using our standard module catalog (e.g., standard base, drawers, sink base, wall units) that strictly fit my room boundary.
2. **As an owner or designer**, I want a Cost-Down Advisor card that audits my design for expensive modular inefficiencies (such as excessive narrow units doubling side panels and slides) and shows me exact ₹ savings with a 1-click "Apply Optimization" button.
3. **As a client or designer**, in Presentation Mode I want to request a "30s 1080p Walkthrough Video", track the background rendering progress, and download or preview the MP4 video asset.

## Functional Requirements
- **FR-01**: Pure cost-down analysis engine (`src/engine/commercial/costDown.ts`) identifying cost reduction opportunities:
  - Replacing paired narrow base units with wider single units to save carcass panels, edge-banding, and hinges/runners.
  - Standardizing non-standard widths to stock catalogue sizes.
  - Calculating exact delta in integer paise and percentage savings.
- **FR-02**: Layout suggester catalog bridge (`src/ai/layout/moduleSuggester.ts`) that produces valid cabinet placements mapped directly to `STANDARD_MODULES` (`BASE-STD`, `DRAWER-3B`, `SINK-BASE`, `WALL-STD`, `TALL-PANTRY`, `WARDROBE-2D`).
- **FR-03**: Walkthrough video rendering queue engine & state (`src/domain/platform/walkthroughVideo.ts`, `src/state/walkthroughStore.ts`):
  - Waypoint camera path generator calculating 30-second trajectory between room viewpoint keyframes.
  - Video rendering job status lifecycle: `idle` -> `queued` -> `rendering` (progress %) -> `ready`.
  - Video mock download with valid MP4 metadata container / canvas frame stream.
- **FR-04**: Integrated UI components:
  - Cost-down advisor recommendations widget in Quotation / Presentation portal.
  - "Generate 3D Video Walkthrough" trigger and progress modal in Presentation Portal.

