# Spec 028 — Site Measurement Capture & Wall-Tagged Photos (MT-03, MT-05, MT-04)

## Context & Objectives
PRD v2 Section B details site capture requirements:
- **`MT-03`**: Site photo attachment tagged per wall (Back, Left, Right, Front) with compass heading, timestamp, notes, and visual thumbnail display.
- **`MT-04`**: Room geometry solver with **±10mm wall-closure tolerance validation**: checks whether consecutive wall lengths and angles form a closed polygon, calculating closure error distance and warning if out of tolerance.
- **`MT-05`**: Mobile-responsive measurement capture wizard (down to 360px viewport) enabling site technicians to record room dimensions, wall heights, and openings directly on a phone or tablet.

## User Stories
1. **As a site measurement surveyor**, I want a dedicated mobile-friendly measurement wizard where I can enter wall lengths, verify if the room closes within ±10mm tolerance, and attach photos to specific walls.
2. **As an interior designer**, I want to see photos taken at the site pinned to the corresponding wall in the 3D editor and deliverables sheets, so I don't design over unforeseen site obstacles (beams, conduits, damp patches).
3. **As a project manager**, I want to export or review the site capture report with wall photos and closure diagnostics before committing manufacturing cut-lists.

## Functional Requirements
- **FR-01**: Pure domain models and validation in `src/domain/measurement/siteCapture.ts`:
  - `SitePhoto`: id, wallId (`back` | `left` | `right` | `front`), url, thumbnail, compassHeading, notes, capturedAtIso.
  - `WallMeasurement`: wallId, lengthMm, heightMm, thicknessMm.
  - `ClosureValidation`: isClosed, closureErrorMm, status (`valid` <= 10mm, `warning` > 10mm), message.
- **FR-02**: Room closure solver (`src/engine/measurement/closureSolver.ts`):
  - Calculates loop closure for rectangular/polygon wall sequences.
  - Returns `closureErrorMm` with integer precision and clear warning when `closureErrorMm > 10`.
- **FR-03**: State management (`src/state/siteCaptureStore.ts`):
  - Stores captured wall photos and measurements per project.
  - Supports photo addition, deletion, and wall tagging.
- **FR-04**: Mobile-responsive Site Measurement Modal / Wizard (`src/features/measurement/SiteCaptureModal.tsx`):
  - Responsive down to 360px width.
  - Wall selector tabs with photo upload & preview.
  - Live closure diagnostic badge (Green: "Closed within 4mm" / Amber: "Closure gap: 14mm — Check measurements").
  - TopBar integration for easy access.
