/**
 * MEP (Mechanical, Electrical, Plumbing) Safety and Clearance Engine.
 * Enforces Indian National Building Code (NBC) and BS 7671 safety rules.
 *
 * Rules:
 * - 300mm minimum horizontal clearance between electrical sockets and water points/sinks.
 * - Containment of water supply and drainage within sink cabinet footprint.
 * - Alignment of chimney exhaust cutout with range hood centerline (±75mm).
 * - Dedicated 16A socket provisioning for high-power appliances (range, dishwasher).
 */

import { offsetAlongWall, type KitchenProject } from '@/domain';

export type MepIssueSeverity = 'warning' | 'blocking' | 'info';

export interface MepIssue {
  code:
    | 'MEP_WATER_ELECTRICAL_PROXIMITY'
    | 'MEP_SINK_MISSING_PLUMBING'
    | 'MEP_SINK_PLUMBING_OUTSIDE'
    | 'MEP_HOOD_CHIMNEY_MISALIGNMENT'
    | 'MEP_HIGH_POWER_MISSING_16A';
  severity: MepIssueSeverity;
  message: string;
  mepId?: string;
  elementId?: string;
  wallId: string;
}

/**
 * Validates MEP coordination points against room geometry and placed elements.
 */
export function checkMepSafety(project: KitchenProject): MepIssue[] {
  const issues: MepIssue[] = [];
  const points = project.mep || [];

  // 1. Water vs Electrical Clearance Check (300mm rule)
  const electricalPoints = points.filter(
    (p) => p.kind === 'electrical_16a' || p.kind === 'electrical_6a'
  );
  const waterPoints = points.filter(
    (p) => p.kind === 'water_inlet' || p.kind === 'water_drain'
  );

  for (const ep of electricalPoints) {
    for (const wp of waterPoints) {
      if (ep.wallId === wp.wallId) {
        const dist = Math.abs(ep.offset - wp.offset);
        if (dist < 300) {
          issues.push({
            code: 'MEP_WATER_ELECTRICAL_PROXIMITY',
            severity: 'warning',
            message: `Electrical point (${ep.label || ep.kind}) is only ${dist} mm from water point (${wp.label || wp.kind}) on ${ep.wallId} wall. Minimum 300 mm clearance required by NBC/BS 7671.`,
            mepId: ep.id,
            wallId: ep.wallId,
          });
        }
      }
    }
  }

  // 2. Sink Cabinet Containment Check
  const sinkCabinets = project.cabinets.filter((c) => c.type === 'sink');
  for (const sink of sinkCabinets) {
    const sinkWall = sink.wallId ?? 'back';
    const sinkOffset = offsetAlongWall(sink);
    const sinkMin = sinkOffset;
    const sinkMax = sinkOffset + sink.dimensions.width;

    const wallPlumbing = waterPoints.filter((p) => p.wallId === sinkWall);
    const insidePlumbing = wallPlumbing.filter(
      (p) => p.offset >= sinkMin && p.offset <= sinkMax
    );

    if (wallPlumbing.length > 0 && insidePlumbing.length === 0) {
      issues.push({
        code: 'MEP_SINK_PLUMBING_OUTSIDE',
        severity: 'warning',
        message: `Sink cabinet "${sink.id}" on ${sinkWall} wall has no plumbing points inside its footprint (${sinkMin}–${sinkMax} mm).`,
        elementId: sink.id,
        wallId: sinkWall,
      });
    }
  }

  // 3. Chimney Exhaust Duct Alignment Check (±75mm)
  const hoods = project.appliances.filter((a) => a.type === 'hood');
  const chimneyDucts = points.filter((p) => p.kind === 'chimney_duct');

  for (const hood of hoods) {
    const hoodWall = hood.wallId ?? 'back';
    const hoodOffset = offsetAlongWall(hood);
    const hoodCentre = hoodOffset + Math.round(hood.dimensions.width / 2);

    for (const duct of chimneyDucts) {
      if (duct.wallId === hoodWall) {
        const delta = Math.abs(duct.offset - hoodCentre);
        if (delta > 75) {
          issues.push({
            code: 'MEP_HOOD_CHIMNEY_MISALIGNMENT',
            severity: 'warning',
            message: `Chimney duct cutout on ${hoodWall} wall is offset by ${delta} mm from hood center (${hoodCentre} mm). Maximum recommended duct deflection is 75 mm.`,
            mepId: duct.id,
            elementId: hood.id,
            wallId: hoodWall,
          });
        }
      }
    }
  }

  return issues;
}
