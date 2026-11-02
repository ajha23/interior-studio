# Phase 1: Data Model & Schema Specification

**Feature**: `032-sheet-nesting-optimization`  
**Date**: 2026-11-02  
**Status**: Completed  
**Governing Authority**: Constitution Principle V, Principle I, Principle III (Integer Millimetres)

---

## 1. Domain Entities & Zod Schemas

Located in: `src/engine/production/nesting/types.ts` (100% framework-free TypeScript).

```typescript
import { z } from 'zod';

/**
 * Grain Orientation Constraint for wood veneers and textured laminates (FR-002)
 */
export const GrainDirectionSchema = z.enum(['lengthwise', 'crosswise', 'none']);
export type GrainDirection = z.infer<typeof GrainDirectionSchema>;

/**
 * Cutting Mode: Guillotine (table saw through-cuts) vs. CNC Router (arbitrary nesting)
 */
export const NestingModeSchema = z.enum(['guillotine', 'cnc_router']);
export type NestingMode = z.infer<typeof NestingModeSchema>;

/**
 * Raw Board Stock Specification (Dimensions in integer millimetres)
 */
export const RawBoardStockSchema = z.object({
  id: z.string().min(1),
  material: z.string().min(1),
  thickness: z.number().int().min(1), // e.g. 18 mm
  length: z.number().int().min(500).default(2440), // 8 feet = 2440 mm
  width: z.number().int().min(500).default(1220),  // 4 feet = 1220 mm
  trimMargin: z.number().min(0).default(10),       // 10 mm perimeter trim
  kerf: z.number().min(0).default(3.2),            // 3.2 mm saw blade width
});
export type RawBoardStock = z.infer<typeof RawBoardStockSchema>;

/**
 * Input Panel Item for Nesting
 */
export const InputNestingPanelSchema = z.object({
  id: z.string().min(1),
  partName: z.string().min(1),
  material: z.string().min(1),
  thickness: z.number().int().min(1),
  length: z.number().int().min(1),
  width: z.number().int().min(1),
  qty: z.number().int().min(1).default(1),
  grain: GrainDirectionSchema.default('none'),
  banding: z.string().default('none'),
  units: z.array(z.string()).default([]),
});
export type InputNestingPanel = z.infer<typeof InputNestingPanelSchema>;

/**
 * Positioned Panel Placement on a Board
 */
export const NestedPanelPlacementSchema = z.object({
  panelId: z.string().min(1),
  partName: z.string().min(1),
  sheetIndex: z.number().int().min(0),
  x: z.number().min(0),
  y: z.number().min(0),
  length: z.number().int().min(1),
  width: z.number().int().min(1),
  rotated: z.boolean().default(false),
  banding: z.string().default('none'),
  units: z.array(z.string()).default([]),
});
export type NestedPanelPlacement = z.infer<typeof NestedPanelPlacementSchema>;

/**
 * Offcut / Waste Zone on a Board
 */
export const OffcutRectangleSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  length: z.number().int().min(1),
  width: z.number().int().min(1),
  areaMm2: z.number().int().min(0),
  isReusable: z.boolean().default(false), // true if length >= 600 and width >= 600
});
export type OffcutRectangle = z.infer<typeof OffcutRectangleSchema>;

/**
 * Single Nested Sheet Layout
 */
export const NestedSheetSchema = z.object({
  sheetIndex: z.number().int().min(1),
  material: z.string().min(1),
  thickness: z.number().int().min(1),
  boardLength: z.number().int().default(2440),
  boardWidth: z.number().int().default(1220),
  trimMargin: z.number().default(10),
  kerf: z.number().default(3.2),
  placements: z.array(NestedPanelPlacementSchema),
  offcuts: z.array(OffcutRectangleSchema),
  usedAreaMm2: z.number().int().min(0),
  usableAreaMm2: z.number().int().min(0),
  yieldPercentage: z.number().min(0).max(100),
});
export type NestedSheet = z.infer<typeof NestedSheetSchema>;

/**
 * Aggregate Multi-Sheet Optimization Result
 */
export const NestingResultSchema = z.object({
  sheets: z.array(NestedSheetSchema),
  sheetsByMaterial: z.record(z.string(), z.array(NestedSheetSchema)),
  totalSheets: z.number().int().min(0),
  totalPartAreaMm2: z.number().int().min(0),
  totalBoardAreaMm2: z.number().int().min(0),
  netYieldPercentage: z.number().min(0).max(100),
  reusableOffcuts: z.array(OffcutRectangleSchema),
  unplacedPanels: z.array(InputNestingPanelSchema),
  calculatedAt: z.string().datetime(),
});
export type NestingResult = z.infer<typeof NestingResultSchema>;
```
