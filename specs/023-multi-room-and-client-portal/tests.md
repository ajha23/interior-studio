# 023 Tests — Multi-Room Packs, Wardrobe Parametric Modules & Client Presentation Portal

## Acceptance Criteria & Test Scenarios

### 1. Wardrobe & Vanity Explode Precision
- Test that a 2100mm H × 900mm W × 600mm D 2-door hinged wardrobe generates:
  - 2 side gables (2100 × 580mm) with 32mm system hole boring.
  - Top and bottom panels (864 × 580mm).
  - 1 fixed mid-shelf (864 × 580mm) dividing hanging rail zone from upper loft shelf.
  - 1 grooved back panel with 8mm rebate deduction.
  - 2 shutters (2094 × 445mm) with 3mm reveal deductions and 35mm hinge cups.
- Test that a vanity unit generates carcass with BWP-grade moisture-resistant specification.

### 2. Loose Furniture Parametric Explode
- Test that a 1500mm L × 900mm W × 750mm H dining table generates:
  - 1 solid top panel (1500 × 900 × 25mm).
  - 4 legs (725 × 75 × 75mm).
  - 2 long aprons and 2 short aprons.

### 3. Quote Revision Diffing
- Compare two quotes with 1 common item, 1 modified item (quantity changed from 1 to 2), 1 added item, and 1 removed item.
- Assert exact line-by-line categorization and arithmetic consistency down to 1 paisa across goods, services, and GST taxes.

### 4. Client Sign-Off & Presentation Portal
- Test `ClientSignOffSchema` parses valid payload and rejects missing mobile or invalid status.
- End-to-end browser test: Open Client Presentation Portal, inspect statutory quote, click "Approve & Sign Quote", submit client signature, assert signed badge displays.

