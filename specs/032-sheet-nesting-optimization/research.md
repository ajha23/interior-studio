# Phase 0: Technical Research & Architectural Decisions

**Feature**: `032-sheet-nesting-optimization`  
**Date**: 2026-11-02  
**Status**: Completed  
**Governing Authority**: Constitution Principle V (*Manufacturing Traceability*), Principle I (*Architectural Layer Isolation*), Principle III (*Integer Millimetres*)

---

## 1. 2D Rectangular Bin Packing: Guillotine vs. MaxRects

### Context
Standard modular interior factories in India operate sliding table panel saws (Altendorf, Robland, Biesse, Indian local sliding table saws) that can only perform **guillotine cuts** (straight edge-to-edge passes from one side of the panel/strip through to the opposite side). Conversely, high-end automated factories utilize flat-table CNC routers that can mill arbitrary nested rectangular profiles without continuous through-cuts.

### Decision
Implement a **Dual-Mode 2D Packing Architecture**:
1. **Guillotine Mode (Default)**: Uses recursive guillotine cutting tree with **Best-Area-Fit (BAF)** and **Best-Short-Side-Fit (BSSF)** heuristics. The stock board is split into horizontal strips (rip cuts) and subsequently into vertical segments (crosscuts), or vice-versa.
2. **CNC Router Mode (Optional)**: Uses the **MaxRects (Maximal Rectangles)** algorithm, which places parts at corners of maximal free spaces, producing higher packing density when cuts do not need to run continuously edge-to-edge.

---

## 2. Grain Direction & Part Role Intelligence

### Context
Natural wood veneers, fluted laminates, and textured finishes have an explicit grain direction. If a door or drawer front is rotated 90°, the visual grain mismatch ruins the kitchen aesthetic. However, internal carcass sides, dividers, plinths, and shelves are typically manufactured from solid-color or neutral pre-laminated boards where rotation is visually irrelevant.

### Decision
Apply **Intelligent Grain Policy by Part Role**:
- `front` (`Door`, `Drawer front`, `Tall unit shutter`): Strict `grain: 'lengthwise'` (rotation angle fixed at 0°).
- `carcass` (`Side`, `Top`, `Bottom`, `Divider`, `Shelf`, `Plinth`): Default `grain: 'none'` (optimizer freely evaluates 0° and 90° rotations to maximize sheet yield).
- `back` (`Back panel`): Neutral grain.
- Manual override: Designer or production engineer can toggle grain lock per panel or per material.

---

## 3. Saw Blade Kerf & Trim Margins

### Context
Saw blades physically remove material (the kerf). Standard carbide circular blades on panel saws have a kerf width of $3.2\text{ mm}$ ($1/8\text{ in}$). Furthermore, commercial raw boards ($2440 \times 1220\text{ mm}$) frequently have ragged, crushed, or swollen edges from transportation.

### Decision
- **Kerf**: Default $3.2\text{ mm}$ blade width applied between all adjacent panel boundaries.
- **Edge Trim**: Default $10\text{ mm}$ perimeter margin shaved off all four edges of the raw board stock, yielding a usable cutting area of $2420 \times 1200\text{ mm}$.
- Parameterization: Both kerf and trim margin are configurable in workshop settings ($0\text{ to }10\text{ mm}$ kerf, $0\text{ to }25\text{ mm}$ trim).

---

## 4. Reusable Offcut Classification

### Context
Offcuts smaller than a certain threshold cannot be used for any standard cabinet part and must be designated as scrap (for plinths or packing battens). Large continuous rectangles can be inventoried for future jobs.

### Decision
- Any contiguous unallocated rectangular space $\ge 600 \times 600\text{ mm}$ is classified as `Reusable Offcut` with dimensions $(L \times W)$, area ($\text{m}^2$), and parent material recorded.
- Remaining unallocated space $< 600 \times 600\text{ mm}$ is classified as `Scrap / Sawdust`.

---

## 5. Client-Side Rendering & Performance Bounds

### Context
Nesting algorithms can be computationally intensive if using brute-force branch-and-bound. However, cabinet cut lists rarely exceed 150 panels per project.

### Decision
- The algorithm executes pure deterministic Best-Fit-Decreasing (BFD) heuristics in pure TypeScript in under $500\text{ ms}$ on the main browser thread.
- Zero external native C++/WASM dependencies required.
- Visual diagram rendered via clean SVG vectors with crisp pan/zoom and export to multi-page printable PDF and DXF.
