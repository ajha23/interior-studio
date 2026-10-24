import type { Um } from '../domain/units';
import type { TemplateKey } from '../domain/types';

/** Axis-aligned box in furniture-local space (µm). x → width, y → depth (0 = back, +y = front), z → up. */
export interface Box3 {
  x: Um;
  y: Um;
  z: Um;
  w: Um;
  d: Um;
  h: Um;
}

export type PartRole = 'side' | 'top' | 'bottom' | 'partition' | 'shelf' | 'back' | 'shutter' | 'drawer-front' | 'drawer-box' | 'drawer-bottom' | 'panel' | 'plinth' | 'worktop';

export type PartMaterial = 'carcass' | 'shutter' | 'back' | 'worktop';

export interface Part {
  key: string;
  name: string;
  role: PartRole;
  /** Finished size along the grain (longest edge for carcass parts). */
  lengthUm: Um;
  widthUm: Um;
  thicknessUm: Um;
  material: PartMaterial;
  grain: 'along-length' | 'none';
  /** Banded edges as a short code: L = long edge, S = short edge, e.g. "1L", "2L2S". */
  edgeBanding: string;
  box: Box3;
}

export interface HardwareLine {
  name: string;
  spec: string;
  qty: number;
}

export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ResolvedFurniture {
  templateKey: TemplateKey;
  templateVersion: number;
  overall: { widthUm: Um; depthUm: Um; heightUm: Um; zMinUm: Um };
  /** Module spans along width for dimension chains (inner clear widths). */
  modules: { xUm: Um; widthUm: Um; label: string }[];
  parts: Part[];
  hardware: HardwareLine[];
  issues: Issue[];
}

export function edgeCode(long: number, short: number): string {
  const out: string[] = [];
  if (long) out.push(`${long}L`);
  if (short) out.push(`${short}S`);
  return out.join('') || '—';
}
