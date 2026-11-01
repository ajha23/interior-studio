# 022 — MEP Service Coordination & DXF CAD Deliverables (PRD v2)

**Status:** In Progress. Implements PRD v2 MEP and CAD export capabilities:
- **MEP Point Domain Entities**: Electrical sockets (16A/6A), Plumbing (water inlet, drain), Chimney duct, Gas.
- **MEP Clearance & Design Checks**: Water-electrical separation (300mm rule), sink plumbing alignment, and chimney exhaust vertical alignment.
- **DXF 2D CAD Exporter**: Industry-standard ASCII DXF R12/2000 format with layered CAD output (`WALLS`, `CABINETS`, `WORKTOPS`, `MEP_PLUMBING`, `MEP_ELECTRICAL`, `DIMENSIONS`).
- **Deliverables Integration**: One-click DXF export and MEP layer visibility toggle.

## Objectives & Statutory Rules

1. **Safety Standards Compliance (NBC India / BS 7671)**:
   - Sockets must maintain a minimum 300mm horizontal separation from any water outlet or sink basin.
   - High-power appliances (hob ignition, microwave, dishwasher) require dedicated 16A service points.
2. **Manufacturing & Architectural CAD Handoff**:
   - Architecture and interior studios require DXF files to coordinate structural and MEP drawings with site contractors and structural consultants.
   - CAD files must have strictly separated layers with standard color indices (ACI).

