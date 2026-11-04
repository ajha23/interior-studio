/**
 * MEP (Mechanical, Electrical, Plumbing) Service Layout Sheet Generator.
 * Produces technical civil drawings and schedules for site service rough-ins.
 *
 * Rules:
 * - Framework-free TypeScript.
 * - Integer millimeter coordinates and AFF heights.
 */

import { type KitchenProject, WALL_LABEL, wallLength } from '@/domain';
import type { MepKind } from '@/domain/mep/schema';
import { wallPieces } from '../geometry/walls';
import { boundsOf, formatDimension, type Prim, type View, type Sheet, type TableColumn } from './drawing';

const KIND_LABEL: Record<MepKind, string> = {
  electrical_16a: '16A Power Point',
  electrical_6a: '6A Utility Point',
  water_inlet: 'Water Inlet (Hot/Cold)',
  water_drain: 'Waste Drain Outlet',
  gas_point: 'Gas Cylinder Connection',
  chimney_duct: 'Chimney Exhaust Duct',
};

const KIND_TAG: Record<MepKind, string> = {
  electrical_16a: 'E16',
  electrical_6a: 'E6',
  water_inlet: 'W_IN',
  water_drain: 'W_OUT',
  gas_point: 'GAS',
  chimney_duct: 'CHIM',
};

/**
 * Builds the 2D MEP Service Layout View with room outline, cabinet boundaries, and MEP service tags.
 */
export function mepPlanView(project: KitchenProject): View {
  const { width: W, length: L } = project.room;
  const prims: Prim[] = [];

  // 1. Draw outer and inner walls
  const wallIds: ('back' | 'front' | 'left' | 'right')[] = ['back', 'front', 'left', 'right'];
  for (const w of wallIds) {
    for (const piece of wallPieces(project.room, w, project.openings || [])) {
      prims.push({
        t: 'rect',
        x: piece.minX,
        y: piece.minZ,
        w: piece.maxX - piece.minX,
        h: piece.maxZ - piece.minZ,
        stroke: 'thick',
        fill: 'wall',
      });
    }
  }

  // 2. Base cabinet outlines (dashed lines for context)
  for (const cab of project.cabinets) {
    if (cab.type === 'base' || cab.type === 'sink' || cab.type === 'drawer') {
      prims.push({
        t: 'rect',
        x: cab.position.x,
        y: cab.position.z,
        w: cab.dimensions.width,
        h: cab.dimensions.depth,
        stroke: 'hidden',
        fill: 'none',
      });
    }
  }

  // 3. MEP Points and dimension lines
  const mepList = project.mep || [];
  for (const pt of mepList) {
    const wLen = wallLength(project.room, pt.wallId);
    let rx = 0;
    let ry = 0;

    switch (pt.wallId) {
      case 'back':
        rx = pt.offset;
        ry = 0;
        break;
      case 'front':
        rx = wLen - pt.offset;
        ry = L;
        break;
      case 'left':
        rx = 0;
        ry = pt.offset;
        break;
      case 'right':
        rx = W;
        ry = wLen - pt.offset;
        break;
    }

    // MEP Tag circle
    prims.push({
      t: 'tag',
      at: { x: rx, y: ry },
      text: KIND_TAG[pt.kind],
      r: 4,
      key: `mep-${pt.id}`,
    });

    // Label with height AFF
    prims.push({
      t: 'text',
      at: { x: rx, y: ry + (pt.wallId === 'back' ? 60 : -40) },
      text: `${pt.label || KIND_TAG[pt.kind]} (AFF ${pt.elevation}mm)`,
      size: 2.2,
      anchor: 'middle',
    });

    // Dimension line along the wall to corner
    prims.push({
      t: 'dim',
      a: { x: pt.wallId === 'back' ? 0 : rx, y: pt.wallId === 'left' ? 0 : ry },
      b: { x: rx, y: ry },
      offset: 35,
      value: pt.offset,
      text: formatDimension(pt.offset, 'mm'),
      role: 'segment',
      axis: pt.wallId === 'back' || pt.wallId === 'front' ? 'x' : 'y',
    });
  }

  const bounds = boundsOf(prims, 10);

  return {
    id: 'mep-plan-view',
    title: 'MEP Services Layout Plan',
    prims,
    bounds,
    notes: [
      'All dimensions in millimetres unless noted.',
      'AFF = Above Finished Floor level to centre of box/pipe.',
      'Plumbing rough-ins must maintain 300mm minimum separation from 16A electrical sockets (NBC 2016 / BS 7671).',
    ],
  };
}

/**
 * Builds the tabular MEP Schedule sheet.
 */
export function buildMepScheduleSheet(
  project: KitchenProject,
  revision: string
): Omit<Sheet, 'title'> {
  const mepList = project.mep || [];
  const columns: TableColumn[] = [
    { label: 'Ref', width: 0.1 },
    { label: 'Service Type', width: 0.28 },
    { label: 'Wall', width: 0.14 },
    { label: 'Dist from Corner (mm)', width: 0.18, align: 'right' },
    { label: 'Height AFF (mm)', width: 0.15, align: 'right' },
    { label: 'Appliance / Description', width: 0.15 },
  ];

  const rows: string[][] = mepList.map((pt) => [
    KIND_TAG[pt.kind],
    KIND_LABEL[pt.kind],
    WALL_LABEL[pt.wallId],
    pt.offset.toString(),
    pt.elevation.toString(),
    pt.label || '-',
  ]);

  return {
    id: 'mep-schedule',
    paper: 'A4',
    body: {
      kind: 'table',
      heading: `MEP Services Schedule & Site Rough-In Guide · Rev ${revision.slice(0, 8)}`,
      columns,
      rows: rows.length > 0 ? rows : [['-', 'No MEP services marked', '-', '-', '-', '-']],
      notes: [
        'Electrical coordinates are to centre of conduit box.',
        'Water drainage outlets require 1:50 gravity fall to main stack.',
      ],
    },
  };
}
