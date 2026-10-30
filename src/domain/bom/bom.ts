/**
 * Bill of materials, derived only from the domain model (never from rendered meshes).
 * Panel areas are estimates for budgeting: fronts = width × height, carcass = two sides,
 * top, bottom and back. They are not a cut list.
 */
import { deriveCountertops } from '../furniture/countertops';
import { APPLIANCE_SPECS, CABINET_SPECS } from '../furniture/specs';
import { WALL_LABEL } from '../room/walls';
import type { ApplianceType, CabinetType, KitchenProject } from '../schema';

export interface CabinetBomRow {
  key: string;
  type: CabinetType;
  label: string;
  width: number;
  height: number;
  depth: number;
  finish: string;
  quantity: number;
  entityIds: string[];
}

export interface ApplianceBomRow {
  key: string;
  type: ApplianceType;
  label: string;
  width: number;
  quantity: number;
  entityIds: string[];
}

export interface CountertopBomRow {
  id: string;
  wall: string;
  length: number;
  depth: number;
  thickness: number;
  finish: string;
}

export interface Bom {
  cabinets: CabinetBomRow[];
  appliances: ApplianceBomRow[];
  countertops: CountertopBomRow[];
  totals: {
    cabinetCount: number;
    applianceCount: number;
    countertopLength: number;
    /** Square metres, two decimals. */
    frontAreaByFinish: Record<string, number>;
    carcassArea: number;
  };
}

const m2 = (mm2: number) => Math.round(mm2 / 10_000) / 100;

export function computeBom(project: KitchenProject): Bom {
  const finishName = (id: string) => project.materials[id]?.name ?? id;

  const cabinetRows = new Map<string, CabinetBomRow>();
  const fronts = new Map<string, number>();
  let carcass = 0;
  for (const c of project.cabinets) {
    const { width: w, height: h, depth: d } = c.dimensions;
    const key = `${c.type}|${w}|${h}|${d}|${c.materialId}`;
    const row = cabinetRows.get(key) ?? { key, type: c.type, label: CABINET_SPECS[c.type].label, width: w, height: h, depth: d, finish: finishName(c.materialId), quantity: 0, entityIds: [] };
    row.quantity += 1;
    row.entityIds.push(c.id);
    cabinetRows.set(key, row);
    fronts.set(c.materialId, (fronts.get(c.materialId) ?? 0) + w * h);
    carcass += 2 * h * d + 2 * w * d + w * h;
  }

  const applianceRows = new Map<string, ApplianceBomRow>();
  for (const a of project.appliances) {
    const key = `${a.type}|${a.dimensions.width}`;
    const row = applianceRows.get(key) ?? { key, type: a.type, label: APPLIANCE_SPECS[a.type].label, width: a.dimensions.width, quantity: 0, entityIds: [] };
    row.quantity += 1;
    row.entityIds.push(a.id);
    applianceRows.set(key, row);
  }

  const countertops = deriveCountertops(project).map((ct) => ({
    id: ct.id,
    wall: ct.wallId ? WALL_LABEL[ct.wallId] : 'Free-standing',
    length: ct.length,
    depth: ct.depth,
    thickness: ct.thickness,
    finish: finishName(project.surfaces.countertop),
  }));

  const byLabel = <T extends { label: string; width: number }>(a: T, b: T) => a.label.localeCompare(b.label) || a.width - b.width;
  return {
    cabinets: [...cabinetRows.values()].sort(byLabel),
    appliances: [...applianceRows.values()].sort(byLabel),
    countertops,
    totals: {
      cabinetCount: project.cabinets.length,
      applianceCount: project.appliances.length,
      countertopLength: countertops.reduce((s, c) => s + c.length, 0),
      frontAreaByFinish: Object.fromEntries([...fronts].map(([id, area]) => [finishName(id), m2(area)])),
      carcassArea: m2(carcass),
    },
  };
}
