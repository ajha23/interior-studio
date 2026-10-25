/**
 * Factory order: one self-describing, versioned document with everything a workshop or ERP needs
 * to build the design — units with finishes and parameters, per-board cut-list, worktop slabs,
 * hardware and the BOM. Sizes are millimetres. Deterministic: the caller supplies the timestamp.
 */
import { finishById } from '../domain/catalog';
import { isParametric, type Project } from '../domain/types';
import { type Um } from '../domain/units';
import { envelope, resolveParametric } from '../furniture';
import { worktopRuns } from '../kitchen/worktops';
import { buildBom, type PriceList } from './pricing';
import { buildCutList } from './cutlist';

export const ORDER_SCHEMA = 'interior-studio.order/1';

const mmNum = (um: Um) => Math.round(um / 100) / 10;

export interface FactoryOrder {
  schema: typeof ORDER_SCHEMA;
  generatedAt: string;
  project: { id: string; name: string; client: string };
  designVersion: number | null;
  units: {
    id: string;
    name: string;
    kind: string;
    sizeMm: { width: number; depth: number; height: number };
    position: { xMm: number; yMm: number; rotationDeg: number };
    finishes: Record<string, string>;
    params: Record<string, number | string>;
    hardware: { name: string; spec: string; qty: number }[];
  }[];
  boards: {
    label: string;
    finish: string;
    thicknessMm: number;
    sheets: number;
    areaM2: number;
    parts: { unit: string; part: string; qty: number; lengthMm: number; widthMm: number; edgeBanding: string; grain: string }[];
  }[];
  worktops: { name: string; finish: string; lengthMm: number; depthMm: number; joints: number; cutouts: string[] }[];
  bom: { section: string; description: string; qty: number; unit: string }[];
}

export function buildOrder(project: Project, priceList: PriceList, opts: { generatedAt: string; designVersion?: number | null }): FactoryOrder {
  const units: FactoryOrder['units'] = [];
  for (const f of project.furniture) {
    if (!isParametric(f)) continue;
    const e = envelope(f);
    const r = resolveParametric(f, project.rulePack);
    const params: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(f.params as unknown as Record<string, unknown>)) {
      if (typeof v === 'number') params[k.endsWith('Um') ? k.replace(/Um$/, 'Mm') : k] = k.endsWith('Um') ? mmNum(v) : v;
      else if (typeof v === 'string') params[k] = v;
    }
    units.push({
      id: f.id,
      name: f.name,
      kind: f.kind,
      sizeMm: { width: mmNum(e.widthUm), depth: mmNum(e.depthUm), height: mmNum(e.heightUm - e.zMinUm) },
      position: { xMm: mmNum(f.xUm), yMm: mmNum(f.yUm), rotationDeg: f.rotDeg },
      finishes: Object.fromEntries(Object.entries(f.materials as Record<string, string>).map(([slot, id]) => [slot, finishById(id).name])),
      params,
      hardware: r.hardware.map((h) => ({ name: h.name, spec: h.spec, qty: h.qty })),
    });
  }
  return {
    schema: ORDER_SCHEMA,
    generatedAt: opts.generatedAt,
    project: { id: project.id, name: project.name, client: project.client ?? '' },
    designVersion: opts.designVersion ?? null,
    units,
    boards: buildCutList(project).map((b) => ({
      label: b.label,
      finish: b.back ? 'back ply' : finishById(b.finishId).name,
      thicknessMm: mmNum(b.thicknessUm),
      sheets: b.sheets,
      areaM2: Math.round(b.areaM2 * 100) / 100,
      parts: b.rows.map((r) => ({ unit: r.unit, part: r.part, qty: r.qty, lengthMm: mmNum(r.lengthUm), widthMm: mmNum(r.widthUm), edgeBanding: r.edgeBanding, grain: r.grain === 'none' ? 'none' : 'along length' })),
    })),
    worktops: worktopRuns(project).map((w) => ({ name: w.name, finish: finishById(w.finishId).name, lengthMm: mmNum(w.lengthUm), depthMm: mmNum(w.depthUm), joints: w.joints, cutouts: w.cutouts.map((c) => c.kind) })),
    bom: buildBom(project, priceList).lines.map((l) => ({ section: l.section, description: l.description, qty: l.qty, unit: l.unit })),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (k: string) => k.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');

/** Plain XML for ERPs that don't take JSON: arrays become repeated singular elements. */
export function orderXml(order: FactoryOrder): string {
  const single = (k: string) => (k.endsWith('ies') ? `${k.slice(0, -3)}y` : k.endsWith('s') ? k.slice(0, -1) : 'item');
  const node = (k: string, v: unknown, indent: string): string => {
    if (Array.isArray(v)) return v.map((x) => node(single(k), x, indent)).join('\n');
    if (v && typeof v === 'object') {
      const inner = Object.entries(v as Record<string, unknown>).map(([kk, vv]) => node(kk, vv, indent + '  ')).filter(Boolean).join('\n');
      return `${indent}<${tag(k)}>\n${inner}\n${indent}</${tag(k)}>`;
    }
    return `${indent}<${tag(k)}>${esc(String(v ?? ''))}</${tag(k)}>`;
  };
  const { schema, ...rest } = order;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<order schema="${esc(schema)}">\n${Object.entries(rest).map(([k, v]) => node(k, v, '  ')).join('\n')}\n</order>\n`;
}

/** Filename-safe base name for downloads. */
export const orderFileName = (project: Project) => `${(project.name || 'order').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'order'}-factory-order`;
