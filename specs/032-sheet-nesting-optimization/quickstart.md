# Quickstart & Verification Guide: Sheet Nesting & Cutting Optimization

**Feature**: `032-sheet-nesting-optimization`  
**Governing Authority**: Constitution Principle V, Principle I, Principle III

This guide provides runnable instructions to execute, test, and verify the 2D sheet nesting engine, interactive visual workshop layouts, export generators (SVG, DXF, Printable Workshop Sheet), and commercial SaaS entitlement gating.

---

## 1. Automated Test Execution

### 1.1 Unit Tests (Domain & Engine)
Execute all framework-free mathematical tests for 2D guillotine packing, grain orientation, material segregation, and offcut classification:

```bash
npx vitest run src/engine/production/nesting
```

Expected output:
- `guillotineBinPacker.test.ts`: 100% pass, validates containment, zero part overlap, guillotine edge-to-edge cut validity.
- `grainPolicy.test.ts`: Validates shutter/door grain lock (0° fixed) and carcass free 90° rotation.
- `nestingEngine.test.ts`: Multi-sheet multi-material optimization, kerf, trim margin, yield calculation.
- `dxfExporter.test.ts`: AutoCAD R12 DXF output formatting, closed ENTITIES lwpolylines.

### 1.2 Component & Feature Tests
Execute React Testing Library unit tests for UI panel, SVG canvas, interactive sheet switcher, and offcut inspector:

```bash
npx vitest run src/features/manufacturing
```

Expected output:
- `CuttingLayoutsPanel.test.tsx`: Validates rendering, sheet switching, material selector, yield display.
- `SheetCanvasViewer.test.tsx`: Validates SVG rendering, part labeling, offcut highlighting, zoom controls.

### 1.3 Full End-to-End Suite
Execute the Playwright end-to-end integration test:

```bash
npx playwright test e2e/sheet-nesting-and-cutting.spec.ts
```

Expected output:
- Project design with multiple cabinets produces valid cut list.
- Navigating to "Workshop & Nesting" view generates sheet layouts.
- Sheet yield metrics, part labels, edge banding tags, and offcuts are displayed.
- DXF and workshop print report exports trigger without error.
- Pro/Enterprise entitlement allows nesting; Free tier shows upgrade prompt.

---

## 2. Interactive Manual Verification

1. Start development server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5173`.
3. Load sample kitchen or add 2 Base Cabinets and 1 Wall Cabinet.
4. Open the **Production / Manufacturing** tab or click **Optimize Sheet Nesting**.
5. Verify the following:
   - **Material Segregation**: 18mm Plywood carcass parts are grouped separately from 18mm Acrylic/Laminate door fronts.
   - **Visual Layout**: Sheets display raw board perimeter (2440 × 1220 mm), 10mm grey trim borders, 3.2mm kerf cut lines, and color-coded parts.
   - **Grain Verification**: External door fronts retain vertical grain; carcass sides/shelves rotate to maximize efficiency.
   - **Offcuts**: Green hatched zones indicate reusable offcuts (≥ 600 × 600 mm) with dimensions displayed; scrap areas (< 600 × 600 mm) marked in grey.
   - **DXF Download**: Clicking "Download DXF" yields a valid `.dxf` file importable into CAD/CAM software.
   - **Workshop Print**: Clicking "Print Workshop Layout" opens printable multi-page cutting sequence sheet.
