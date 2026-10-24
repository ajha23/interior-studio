# ADR 0001 — Floor-plan model: wall graph with derived rooms

**Status:** accepted · 2026-10-24 · scene schema v2

## Context

Phase 0 stored one rectangular room (`room.widthUm × depthUm`) with openings addressed by side (`N/E/S/W` + offset). Phase 1 needs whole homes: many rooms, partitions, L-shapes, walls at any angle, and doors between rooms. About 125 code paths assumed the rectangle.

## Decision

- **Walls are the source of truth.** `plan.walls` holds centreline segments with thickness and height. Rooms are **derived**: walls are split at junctions (shared ends, T-junctions, crossings) into a planar graph, dead ends are pruned, faces are traced, and each bounded face is inset by half of each wall's thickness to give the clear-floor polygon.
- **Room properties live in `plan.rooms`** (name, ceiling, finishes) and attach to a detected polygon by a `seed` point inside it. Editing walls never orphans a name unless the room itself disappears; unmatched rooms get stable automatic ids (`auto:<wall ids>`).
- **Openings attach to a wall** by `wallId`, `offsetUm` along the centreline from `wall.a`, and a `side` sign (swing side / room side). Moving a wall carries its openings.
- **Furniture stays in plan coordinates.** The v1 room's inside north-west corner remains the origin, so v1 furniture needs no change.
- **Validation is plan-aware:** furniture must sit inside one room's clear polygon and not cut into any wall body; ceiling height comes from the room the piece stands in.

## Consequences

- Existing designs migrate automatically on load (`persistence/sceneMigrations.ts`, step 1 → 2); tests assert every opening's jambs land at the same world position as before.
- Kitchens, drawings and BOM build on rooms and walls rather than a single box.
- Room detection is O(n²) in walls, fine for homes (< 500 walls). Revisit with a spatial index if plans grow beyond that.
- Multi-storey plans will wrap `plan` in `floors[]` in a later schema step; nothing here prevents it.
