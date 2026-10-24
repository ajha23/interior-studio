import type { RulePack, TallCabinetParams, WallCabinetParams } from '../domain/types';
import { fmtMm, mm, splitExact, type Um } from '../domain/units';
import { edgeCode, type HardwareLine, type Issue, type Part, type ResolvedFurniture } from './parts';
import { backPanels } from './wardrobe';

export const WALLCABINET_TEMPLATE_VERSION = 1;
export const TALLCABINET_TEMPLATE_VERSION = 1;
const MAX_DOOR_WIDTH_UM = mm(600);

type Limits = Record<string, { min: number; max: number; label: string }>;

/** Wall-hung kitchen unit limits (one table for resolver, inspector, tools and AI). */
export const WALL_CABINET_LIMITS = {
  widthUm: { min: mm(150), max: mm(1200), label: 'Width' },
  heightUm: { min: mm(300), max: mm(1000), label: 'Height' },
  depthUm: { min: mm(250), max: mm(450), label: 'Depth' },
  mountHeightUm: { min: mm(1200), max: mm(2200), label: 'Mount height' },
  doorCount: { min: 1, max: 2, label: 'Doors' },
  shelfCount: { min: 0, max: 3, label: 'Shelves' },
} as const satisfies Limits;

/** Floor-standing tall (pantry) unit limits. */
export const TALL_CABINET_LIMITS = {
  widthUm: { min: mm(300), max: mm(900), label: 'Width' },
  heightUm: { min: mm(1800), max: mm(2400), label: 'Height' },
  depthUm: { min: mm(300), max: mm(700), label: 'Depth' },
  plinthUm: { min: 0, max: mm(200), label: 'Plinth height' },
  doorCount: { min: 1, max: 2, label: 'Doors' },
  shelfCount: { min: 0, max: 6, label: 'Shelves' },
  splitUm: { min: 0, max: mm(1500), label: 'Door split height' },
} as const satisfies Limits;

export const DEFAULT_WALL_CABINET: WallCabinetParams = {
  widthUm: mm(600),
  heightUm: mm(720),
  depthUm: mm(350),
  mountHeightUm: mm(1450),
  front: 'doors',
  doorCount: 1,
  shelfCount: 1,
};

export const DEFAULT_TALL_CABINET: TallCabinetParams = {
  widthUm: mm(600),
  heightUm: mm(2170),
  depthUm: mm(560),
  plinthUm: mm(100),
  doorCount: 1,
  shelfCount: 4,
  splitUm: mm(1300),
};

/** Range/integer checks for any limits table. */
export function limitIssues(p: object, limits: Limits): Issue[] {
  const issues: Issue[] = [];
  for (const [key, lim] of Object.entries(limits)) {
    const v = (p as Record<string, number>)[key];
    const isLen = key.endsWith('Um');
    const show = (n: number) => (isLen ? `${fmtMm(n)} mm` : String(n));
    if (!Number.isFinite(v)) issues.push({ severity: 'error', code: `${key.toUpperCase()}_NAN`, message: `${lim.label} must be a number.` });
    else if (v < lim.min || v > lim.max) issues.push({ severity: 'error', code: `${key.toUpperCase()}_RANGE`, message: `${lim.label} must be between ${show(lim.min)} and ${show(lim.max)} (got ${show(v)}).` });
    else if (!isLen && !Number.isInteger(v)) issues.push({ severity: 'error', code: `${key.toUpperCase()}_INT`, message: `${lim.label} must be a whole number.` });
  }
  return issues;
}

/** Evenly spaced shelves between z0 and z1 (local, top surfaces of the boards excluded). */
function shelves(n: number, x: Um, y: Um, w: Um, d: Um, z0: Um, z1: Um, t: Um, keyPrefix = 'shelf'): Part[] {
  const out: Part[] = [];
  for (let i = 1; i <= n; i++) {
    const z = z0 + Math.round(((z1 - z0) * i) / (n + 1)) - Math.round(t / 2);
    out.push({ key: `${keyPrefix}-${i}`, name: `Shelf ${i}`, role: 'shelf', lengthUm: w, widthUm: d, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x, y, z, w, d, h: t } });
  }
  return out;
}

/** n overlay doors across width W at height z..z+h, front face at y. */
function doors(n: number, W: Um, y: Um, z: Um, h: Um, st: Um, g: Um, keyPrefix = 'door', label = 'Door'): Part[] {
  const widths = splitExact(W - (n + 1) * g, n);
  let x = g;
  return widths.map((dw, i) => {
    const p: Part = { key: `${keyPrefix}-${i + 1}`, name: n > 1 ? `${label} ${i === 0 ? 'L' : 'R'}` : label, role: 'shutter', lengthUm: h, widthUm: dw, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x, y, z, w: dw, d: st, h } };
    x += dw + g;
    return p;
  });
}

/**
 * Wall-hung unit: full top and bottom between the sides, back, shelves, overlay doors, a lift-up
 * flap or an open front. Local z = 0 is the floor; the carcass starts at the mount height.
 */
export function resolveWallCabinet(params: WallCabinetParams, rp: RulePack): ResolvedFurniture {
  const issues = limitIssues(params, WALL_CABINET_LIMITS);
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const { widthUm: W, heightUm: H, depthUm: D, mountHeightUm: M } = params;
  const t = rp.carcassThicknessUm;
  const bt = rp.backThicknessUm;
  const st = rp.shutterThicknessUm;
  const g = rp.shutterGapUm;
  const open = params.front === 'open';
  const Dc = open ? D : D - st;
  const sd = Dc - bt;
  const Wi = W - 2 * t;
  const overall = { widthUm: W, depthUm: D, heightUm: M + H, zMinUm: M };
  const label = open ? 'Open shelf unit' : params.front === 'flap' ? 'Lift-up flap' : `${params.doorCount} door${params.doorCount > 1 ? 's' : ''}`;
  const result = (): ResolvedFurniture => ({ templateKey: 'wallcabinet', templateVersion: WALLCABINET_TEMPLATE_VERSION, overall, modules: [{ xUm: t, widthUm: Math.max(0, Wi), label }], parts, hardware, issues });
  if (params.front !== 'doors' && params.front !== 'flap' && params.front !== 'open') issues.push({ severity: 'error', code: 'FRONT', message: 'Front must be doors, flap or open.' });
  if (Wi <= 0 || sd <= 0 || H - 2 * t <= 0) {
    issues.push({ severity: 'error', code: 'GEOMETRY', message: 'Dimensions too small for the construction method.' });
    return result();
  }
  if (params.front === 'doors' && params.doorCount === 1 && W > MAX_DOOR_WIDTH_UM) issues.push({ severity: 'error', code: 'DOOR_WIDE', message: `A single door wider than ${fmtMm(MAX_DOOR_WIDTH_UM)} mm sags — use 2 doors or a flap for a ${fmtMm(W)} mm unit.` });
  if (params.front === 'flap' && H > mm(450)) issues.push({ severity: 'warning', code: 'FLAP_TALL', message: `A ${fmtMm(H)} mm lift-up flap is hard to reach — flaps work best up to 450 mm.` });
  if (M < mm(1350)) issues.push({ severity: 'warning', code: 'MOUNT_LOW', message: `Mounted at ${fmtMm(M)} mm — less than 500 mm above an 850 mm counter.` });
  if (M + H > mm(2400)) issues.push({ severity: 'warning', code: 'REACH', message: `Top shelf at ${fmtMm(M + H)} mm is out of easy reach.` });

  const add = (p: Part) => parts.push({ ...p, box: { ...p.box, z: p.box.z + M } });
  add({ key: 'side-l', name: 'Left side', role: 'side', lengthUm: H, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: 0, y: bt, z: 0, w: t, d: sd, h: H } });
  add({ key: 'side-r', name: 'Right side', role: 'side', lengthUm: H, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: W - t, y: bt, z: 0, w: t, d: sd, h: H } });
  add({ key: 'top', name: 'Top', role: 'top', lengthUm: Wi, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: H - t, w: Wi, d: sd, h: t } });
  add({ key: 'bottom', name: 'Bottom', role: 'bottom', lengthUm: Wi, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: 0, w: Wi, d: sd, h: t } });
  backPanels(W, H, bt, 'wall', issues).forEach((p) => add(p));
  shelves(params.shelfCount, t, bt, Wi, sd - rp.shelfSetbackUm, t, H - t, t).forEach(add);
  if (params.shelfCount) hardware.push({ name: 'Shelf support', spec: '5 mm pin', qty: params.shelfCount * 4 });

  if (params.front === 'doors') {
    doors(params.doorCount, W, Dc, g, H - 2 * g, st, g).forEach(add);
    hardware.push({ name: 'Concealed hinge', spec: '110°, soft-close, full overlay', qty: params.doorCount * (H - 2 * g > mm(900) ? 3 : 2) }, { name: 'Handle', spec: '160 mm bar', qty: params.doorCount });
  } else if (params.front === 'flap') {
    add({ key: 'flap', name: 'Lift-up flap', role: 'shutter', lengthUm: W - 2 * g, widthUm: H - 2 * g, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x: g, y: Dc, z: g, w: W - 2 * g, d: st, h: H - 2 * g } });
    hardware.push({ name: 'Lift-up stay', spec: 'Soft-stop, pair', qty: 1 }, { name: 'Concealed hinge', spec: '110°, top-hung', qty: W > mm(900) ? 3 : 2 }, { name: 'Handle', spec: '160 mm bar', qty: 1 });
  }
  hardware.push({ name: 'Wall-hanging bracket', spec: 'Adjustable, rated 65 kg, pair', qty: 1 });
  return result();
}

/**
 * Tall (pantry) unit on a plinth: full-height sides, top and bottom, fixed shelf at the door split,
 * adjustable shelves, one full-height door set or upper and lower doors.
 */
export function resolveTallCabinet(params: TallCabinetParams, rp: RulePack): ResolvedFurniture {
  const issues = limitIssues(params, TALL_CABINET_LIMITS);
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const { widthUm: W, heightUm: H, depthUm: D, plinthUm: P, splitUm: S } = params;
  const t = rp.carcassThicknessUm;
  const bt = rp.backThicknessUm;
  const st = rp.shutterThicknessUm;
  const g = rp.shutterGapUm;
  const Hc = H - P;
  const Dc = D - st;
  const sd = Dc - bt;
  const Wi = W - 2 * t;
  const split = S > 0;
  const overall = { widthUm: W, depthUm: D, heightUm: H, zMinUm: 0 };
  const result = (): ResolvedFurniture => ({ templateKey: 'tallcabinet', templateVersion: TALLCABINET_TEMPLATE_VERSION, overall, modules: [{ xUm: t, widthUm: Math.max(0, Wi), label: split ? 'Upper + lower doors' : 'Full-height doors' }], parts, hardware, issues });
  if (Wi <= 0 || sd <= 0 || Hc - 2 * t <= 0) {
    issues.push({ severity: 'error', code: 'GEOMETRY', message: 'Dimensions too small for the construction method.' });
    return result();
  }
  if (params.doorCount === 1 && W > MAX_DOOR_WIDTH_UM) issues.push({ severity: 'error', code: 'DOOR_WIDE', message: `A single door wider than ${fmtMm(MAX_DOOR_WIDTH_UM)} mm sags — use 2 doors for a ${fmtMm(W)} mm unit.` });
  if (split && (S < P + mm(500) || S > H - mm(400))) issues.push({ severity: 'error', code: 'SPLIT_RANGE', message: `The door split must leave at least 500 mm below and 400 mm above (between ${fmtMm(P + mm(500))} and ${fmtMm(H - mm(400))} mm).` });
  if (Hc > mm(2440)) issues.push({ severity: 'error', code: 'SIDE_TOO_LONG', message: 'Sides exceed a 2440 mm board.' });
  if (!split && Hc - 2 * g > mm(2100)) issues.push({ severity: 'warning', code: 'DOOR_TALL', message: 'Doors over 2100 mm tend to warp — split them into upper and lower doors.' });

  const add = (p: Part) => parts.push({ ...p, box: { ...p.box, z: p.box.z + P } });
  add({ key: 'side-l', name: 'Left side', role: 'side', lengthUm: Hc, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: 0, y: bt, z: 0, w: t, d: sd, h: Hc } });
  add({ key: 'side-r', name: 'Right side', role: 'side', lengthUm: Hc, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: W - t, y: bt, z: 0, w: t, d: sd, h: Hc } });
  add({ key: 'top', name: 'Top', role: 'top', lengthUm: Wi, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: Hc - t, w: Wi, d: sd, h: t } });
  add({ key: 'bottom', name: 'Bottom', role: 'bottom', lengthUm: Wi, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: 0, w: Wi, d: sd, h: t } });
  backPanels(W, Hc, bt, 'tall', issues).forEach((p) => add(p));

  const n = params.shelfCount;
  if (split) {
    const zs = S - P - Math.round(t / 2); // fixed shelf behind the door split
    add({ key: 'fixed-shelf', name: 'Fixed shelf', role: 'shelf', lengthUm: Wi, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: zs, w: Wi, d: sd, h: t } });
    const lower = Math.round(n / 3);
    shelves(lower, t, bt, Wi, sd - rp.shelfSetbackUm, t, zs, t, 'shelf-lo').forEach(add);
    shelves(n - lower, t, bt, Wi, sd - rp.shelfSetbackUm, zs + t, Hc - t, t, 'shelf-up').forEach(add);
    const lowH = S - P - g - Math.round(g / 2);
    const upZ = S - P + Math.round(g / 2);
    doors(params.doorCount, W, Dc, g, lowH, st, g, 'door-lo', 'Lower door').forEach(add);
    doors(params.doorCount, W, Dc, upZ, Hc - g - upZ, st, g, 'door-up', 'Upper door').forEach(add);
  } else {
    shelves(n, t, bt, Wi, sd - rp.shelfSetbackUm, t, Hc - t, t).forEach(add);
    doors(params.doorCount, W, Dc, g, Hc - 2 * g, st, g).forEach(add);
  }
  const doorParts = parts.filter((p) => p.role === 'shutter');
  const hinges = doorParts.reduce((s, d) => s + (d.lengthUm > mm(1500) ? 4 : d.lengthUm > mm(900) ? 3 : 2), 0);
  hardware.push({ name: 'Concealed hinge', spec: '110°, soft-close, full overlay', qty: hinges }, { name: 'Handle', spec: '320 mm bar', qty: doorParts.length });
  if (n) hardware.push({ name: 'Shelf support', spec: '5 mm pin', qty: n * 4 });
  if (P > 0) {
    parts.push({ key: 'plinth', name: 'Plinth', role: 'plinth', lengthUm: W, widthUm: P, thicknessUm: t, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: 0, y: D - mm(50) - t, z: 0, w: W, d: t, h: P } });
    hardware.push({ name: 'Adjustable leg', spec: `${fmtMm(Math.max(P - mm(10), mm(65)))}–${fmtMm(P + mm(30))} mm`, qty: 4 });
  }
  hardware.push({ name: 'Anti-tip wall bracket', spec: 'Steel, pair', qty: 1 });
  return result();
}

/** Dependent-parameter rules shared by door units: widen past one door → two doors, and back. */
export function adjustDoors<T extends { widthUm: Um; doorCount: number }>(prev: T, next: T, applies: boolean): { params: T; notes: string[] } {
  const params = { ...next };
  const notes: string[] = [];
  if (!applies || next.doorCount !== prev.doorCount) return { params, notes };
  if (params.doorCount === 1 && params.widthUm > MAX_DOOR_WIDTH_UM) {
    params.doorCount = 2;
    notes.push(`switched to 2 doors (one door is limited to ${fmtMm(MAX_DOOR_WIDTH_UM)} mm)`);
  } else if (params.doorCount === 2 && params.widthUm < mm(400)) {
    params.doorCount = 1;
    notes.push('switched to 1 door (two doors need 400 mm or more)');
  }
  return { params, notes };
}
