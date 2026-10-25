import type { BaseCabinetParams, RulePack } from '../domain/types';
import { fmtMm, mm, splitExact, type Um } from '../domain/units';
import { edgeCode, type HardwareLine, type Issue, type Part, type ResolvedFurniture } from './parts';
import { backPanels } from './wardrobe';

export const BASECABINET_TEMPLATE_VERSION = 1;

/** Worktop overhang beyond the shutters at the front. */
export const WORKTOP_OVERHANG_UM = mm(20);
/** Plinth (kick board) set back from the shutter face. */
const PLINTH_SETBACK_UM = mm(50);
/** Front and back rails that replace a full top under a worktop. */
const RAIL_WIDTH_UM = mm(100);
const MAX_DOOR_WIDTH_UM = mm(600);
const MIN_DRAWER_CLEAR_UM = mm(250);
/** Narrowest door opening a blind-corner unit may leave. */
export const BLIND_MIN_OPEN_UM = mm(300);

/**
 * Hard limits for every base-cabinet parameter. One table drives the resolver, the inspector
 * fields, the scene tools (including AI commands) and their error messages, so all of them agree.
 */
export const BASE_CABINET_LIMITS = {
  widthUm: { min: mm(150), max: mm(1200), label: 'Width' },
  heightUm: { min: mm(600), max: mm(1000), label: 'Height' },
  depthUm: { min: mm(300), max: mm(700), label: 'Depth' },
  plinthUm: { min: 0, max: mm(200), label: 'Plinth height' },
  worktopUm: { min: 0, max: mm(60), label: 'Worktop thickness' },
  doorCount: { min: 1, max: 2, label: 'Doors' },
  drawerCount: { min: 1, max: 5, label: 'Drawers' },
  shelfCount: { min: 0, max: 3, label: 'Shelves' },
  blindUm: { min: 0, max: mm(800), label: 'Blind width' },
} as const satisfies Record<string, { min: number; max: number; label: string }>;

export type BaseCabinetLimitKey = keyof typeof BASE_CABINET_LIMITS;

export const DEFAULT_BASE_CABINET: BaseCabinetParams = {
  widthUm: mm(600),
  heightUm: mm(810),
  depthUm: mm(560),
  plinthUm: mm(100),
  worktopUm: mm(40),
  front: 'doors',
  doorCount: 1,
  drawerCount: 3,
  shelfCount: 1,
};

/** Limit violations as issues (also used to reject edits before they reach the scene). */
export function baseCabinetLimitIssues(p: BaseCabinetParams): Issue[] {
  const issues: Issue[] = [];
  for (const [key, lim] of Object.entries(BASE_CABINET_LIMITS) as [BaseCabinetLimitKey, (typeof BASE_CABINET_LIMITS)[BaseCabinetLimitKey]][]) {
    const v = p[key] ?? 0;
    const isLen = key.endsWith('Um');
    const show = (n: number) => (isLen ? `${fmtMm(n)} mm` : String(n));
    if (!Number.isFinite(v)) issues.push({ severity: 'error', code: `${key.toUpperCase()}_NAN`, message: `${lim.label} must be a number.` });
    else if (v < lim.min || v > lim.max) issues.push({ severity: 'error', code: `${key.toUpperCase()}_RANGE`, message: `${lim.label} must be between ${show(lim.min)} and ${show(lim.max)} (got ${show(v)}).` });
    else if (!isLen && !Number.isInteger(v)) issues.push({ severity: 'error', code: `${key.toUpperCase()}_INT`, message: `${lim.label} must be a whole number.` });
  }
  if (p.worktopUm > 0 && p.worktopUm < mm(12)) issues.push({ severity: 'error', code: 'WORKTOP_THIN', message: 'Worktop must be at least 12 mm thick, or 0 for none.' });
  if (p.cutout !== undefined && p.cutout !== 'none') {
    if (p.cutout !== 'sink' && p.cutout !== 'hob') issues.push({ severity: 'error', code: 'CUTOUT', message: 'Cut-out must be a sink or a hob.' });
    else if (p.worktopUm <= 0) issues.push({ severity: 'error', code: 'CUTOUT_NO_TOP', message: `A ${p.cutout} cut-out needs a worktop on the unit.` });
    else if (p.widthUm < mm(600)) issues.push({ severity: 'error', code: 'CUTOUT_NARROW', message: `A ${p.cutout} cut-out needs a unit at least 600 mm wide (this one is ${fmtMm(p.widthUm)} mm).` });
  }
  if ((p.blindUm ?? 0) > 0) {
    if (p.front !== 'doors') issues.push({ severity: 'error', code: 'BLIND_FRONT', message: 'A blind-corner unit has doors, not drawers.' });
    if (p.blindSide !== 'left' && p.blindSide !== 'right') issues.push({ severity: 'error', code: 'BLIND_SIDE', message: 'Blind side must be left or right.' });
    if (p.widthUm - (p.blindUm ?? 0) < BLIND_MIN_OPEN_UM) issues.push({ severity: 'error', code: 'BLIND_OPEN', message: `A blind-corner unit needs at least ${fmtMm(BLIND_MIN_OPEN_UM)} mm of open door: width ${fmtMm(p.widthUm)} mm leaves ${fmtMm(Math.max(0, p.widthUm - (p.blindUm ?? 0)))} mm with a ${fmtMm(p.blindUm ?? 0)} mm blind panel.` });
  }
  if (p.front !== 'doors' && p.front !== 'drawers') issues.push({ severity: 'error', code: 'FRONT', message: 'Front must be doors or drawers.' });
  return issues;
}

/**
 * Floor-standing kitchen base unit: box carcass on a recessed plinth, front and back rails under
 * an optional worktop, overlay doors (with shelves) or a drawer stack. Local z = 0 is the floor,
 * y = 0 is the wall side.
 */
export function resolveBaseCabinet(params: BaseCabinetParams, rp: RulePack): ResolvedFurniture {
  const issues: Issue[] = baseCabinetLimitIssues(params);
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const { widthUm: W, heightUm: H, depthUm: D, plinthUm: P, worktopUm: WT } = params;
  const t = rp.carcassThicknessUm;
  const bt = rp.backThicknessUm;
  const st = rp.shutterThicknessUm;
  const g = rp.shutterGapUm;
  const Hc = H - P; // carcass height
  const Dc = D - st; // carcass depth (fronts overlay)
  const sd = Dc - bt; // side depth in front of the back panel
  const Wi = W - 2 * t; // clear width
  const overallDepth = D + (WT > 0 ? WORKTOP_OVERHANG_UM : 0);
  const overall = { widthUm: W, depthUm: overallDepth, heightUm: H + WT, zMinUm: 0 };
  const result = (): ResolvedFurniture => ({ templateKey: 'basecabinet', templateVersion: BASECABINET_TEMPLATE_VERSION, overall, modules: [{ xUm: t, widthUm: Math.max(0, Wi), label: (params.blindUm ?? 0) > 0 ? 'blind corner' : params.front === 'drawers' ? `${params.drawerCount} drawers` : `${params.doorCount} door${params.doorCount > 1 ? 's' : ''}` }], parts, hardware, issues });

  if (Wi <= 0 || sd <= 0 || Hc - 2 * t <= 0) {
    issues.push({ severity: 'error', code: 'GEOMETRY', message: 'Dimensions too small for the construction method.' });
    return result();
  }
  const blind = Math.max(0, params.blindUm ?? 0);
  const blindLeft = blind > 0 && params.blindSide === 'left';
  const openW = W - blind; // width the doors span
  if (params.front === 'doors' && params.doorCount === 1 && openW > MAX_DOOR_WIDTH_UM) {
    issues.push({ severity: 'error', code: 'DOOR_WIDE', message: `A single door wider than ${fmtMm(MAX_DOOR_WIDTH_UM)} mm sags — use 2 doors for a ${fmtMm(openW)} mm opening.` });
  }
  if (params.front === 'drawers' && Wi - 2 * rp.drawerSideClearanceUm < MIN_DRAWER_CLEAR_UM) {
    issues.push({ severity: 'error', code: 'DRAWER_NARROW', message: `Drawers need at least ${fmtMm(MIN_DRAWER_CLEAR_UM + 2 * t + 2 * rp.drawerSideClearanceUm)} mm cabinet width.` });
  }
  if (P > 0 && P < mm(75)) issues.push({ severity: 'warning', code: 'PLINTH_LOW', message: `Plinth ${fmtMm(P)} mm is below the 75 mm leg adjustment range.` });
  const counter = H + WT;
  if (WT > 0 && (counter < mm(820) || counter > mm(950))) issues.push({ severity: 'warning', code: 'COUNTER_HEIGHT', message: `Counter height ${fmtMm(counter)} mm is outside the usual 820–950 mm.` });

  const add = (p: Part) => parts.push({ ...p, box: { ...p.box, z: p.box.z + P } });

  // Carcass.
  add({ key: 'side-l', name: 'Left side', role: 'side', lengthUm: Hc, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: 0, y: bt, z: 0, w: t, d: sd, h: Hc } });
  add({ key: 'side-r', name: 'Right side', role: 'side', lengthUm: Hc, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: W - t, y: bt, z: 0, w: t, d: sd, h: Hc } });
  add({ key: 'bottom', name: 'Bottom', role: 'bottom', lengthUm: Wi, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: 0, w: Wi, d: sd, h: t } });
  add({ key: 'rail-front', name: 'Front rail', role: 'top', lengthUm: Wi, widthUm: RAIL_WIDTH_UM, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt + sd - RAIL_WIDTH_UM, z: Hc - t, w: Wi, d: RAIL_WIDTH_UM, h: t } });
  add({ key: 'rail-back', name: 'Back rail', role: 'top', lengthUm: Wi, widthUm: RAIL_WIDTH_UM, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: '—', box: { x: t, y: bt, z: Hc - t, w: Wi, d: RAIL_WIDTH_UM, h: t } });
  backPanels(W, Hc, bt, 'base', issues).forEach((p) => add(p));

  if (params.front === 'doors') {
    const n = params.shelfCount;
    const clear = Hc - 2 * t;
    for (let i = 1; i <= n; i++) {
      const z = t + Math.round((clear * i) / (n + 1)) - Math.round(t / 2);
      add({ key: `shelf-${i}`, name: `Shelf ${i}`, role: 'shelf', lengthUm: Wi, widthUm: sd - rp.shelfSetbackUm, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z, w: Wi, d: sd - rp.shelfSetbackUm, h: t } });
    }
    const doors = params.doorCount;
    const widths = splitExact(openW - (doors + 1) * g, doors);
    let x = g + (blindLeft ? blind : 0);
    widths.forEach((dw, i) => {
      add({ key: `door-${i + 1}`, name: doors > 1 ? `Door ${i === 0 ? 'L' : 'R'}` : 'Door', role: 'shutter', lengthUm: Hc - 2 * g, widthUm: dw, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x, y: Dc, z: g, w: dw, d: st, h: Hc - 2 * g } });
      x += dw + g;
    });
    if (blind > 0) {
      // Fixed panel closing the blind end: no hinges, it sits flush with the doors.
      const bx = blindLeft ? g : W - blind + g;
      add({ key: 'blind-panel', name: 'Blind panel', role: 'shutter', lengthUm: Hc - 2 * g, widthUm: blind - 2 * g, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x: bx, y: Dc, z: g, w: blind - 2 * g, d: st, h: Hc - 2 * g } });
    }
    const hingesPerDoor = Hc - 2 * g > mm(900) ? 3 : 2;
    hardware.push({ name: 'Concealed hinge', spec: '110°, soft-close, full overlay', qty: doors * hingesPerDoor });
    if (n) hardware.push({ name: 'Shelf support', spec: '5 mm pin', qty: n * 4 });
    hardware.push({ name: 'Handle', spec: '160 mm bar', qty: doors });
  } else {
    const n = params.drawerCount;
    const heights = splitExact(Hc - (n + 1) * g, n);
    const boxW = Wi - 2 * rp.drawerSideClearanceUm;
    const runnerMm = Math.max(250, Math.floor((sd / 1000 - 30) / 50) * 50);
    const boxD = mm(runnerMm);
    const dbt = rp.drawerBoxThicknessUm;
    let z = g;
    // Top drawer first in the parts list, like a carpenter reads the front.
    const fronts: Part[] = [];
    heights.forEach((fh, i) => {
      const k = n - i; // numbered from the top
      fronts.push({ key: `drawer-${k}-front`, name: `Drawer ${k} front`, role: 'drawer-front', lengthUm: W - 2 * g, widthUm: fh, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x: g, y: Dc, z, w: W - 2 * g, d: st, h: fh } });
      const dh = Math.min(rp.drawerBoxHeightUm, Math.max(mm(60), fh - mm(40)));
      if (fh - mm(40) < mm(60)) issues.push({ severity: 'error', code: 'DRAWER_LOW', message: `Drawer ${k} front is ${fmtMm(fh)} mm — too low for a drawer box. Use fewer drawers.` });
      const bx = t + rp.drawerSideClearanceUm;
      const by = bt + sd - boxD;
      const bz = Math.max(t, z + mm(15));
      const nm = `Drawer ${k}`;
      parts.push(
        { key: `drawer-${k}-side-l`, name: `${nm} side L`, role: 'drawer-box', lengthUm: boxD, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx, y: by, z: bz + P, w: dbt, d: boxD, h: dh } },
        { key: `drawer-${k}-side-r`, name: `${nm} side R`, role: 'drawer-box', lengthUm: boxD, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + boxW - dbt, y: by, z: bz + P, w: dbt, d: boxD, h: dh } },
        { key: `drawer-${k}-back`, name: `${nm} back`, role: 'drawer-box', lengthUm: boxW - 2 * dbt, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + dbt, y: by, z: bz + P, w: boxW - 2 * dbt, d: dbt, h: dh } },
        { key: `drawer-${k}-bottom`, name: `${nm} bottom`, role: 'drawer-bottom', lengthUm: boxW, widthUm: boxD, thicknessUm: bt, material: 'back', grain: 'none', edgeBanding: '—', box: { x: bx, y: by, z: bz + P - bt, w: boxW, d: boxD, h: bt } },
      );
      z += fh + g;
    });
    fronts.reverse().forEach(add);
    hardware.push({ name: 'Drawer runner (pair)', spec: `Soft-close, full extension, ${runnerMm} mm`, qty: n }, { name: 'Handle', spec: '160 mm bar', qty: n });
  }

  if (P > 0) {
    // The plinth sits on the floor in front of the legs, so it is added without the plinth lift.
    parts.push({ key: 'plinth', name: 'Plinth', role: 'plinth', lengthUm: W, widthUm: P, thicknessUm: t, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: 0, y: D - PLINTH_SETBACK_UM - t, z: 0, w: W, d: t, h: P } });
    hardware.push({ name: 'Adjustable leg', spec: `${fmtMm(Math.max(P - mm(10), mm(65)))}–${fmtMm(P + mm(30))} mm`, qty: W > mm(900) ? 6 : 4 }, { name: 'Plinth clip', spec: 'For legs', qty: W > mm(900) ? 3 : 2 });
  }
  if (WT > 0) {
    parts.push({ key: 'worktop', name: 'Worktop', role: 'worktop', lengthUm: W, widthUm: overallDepth, thicknessUm: WT, material: 'worktop', grain: 'none', edgeBanding: '—', box: { x: 0, y: 0, z: H, w: W, d: overallDepth, h: WT } });
  }
  return result();
}

/** Counter height (worktop surface) above the floor. */
export function counterHeightUm(p: BaseCabinetParams): Um {
  return p.heightUm + p.worktopUm;
}

/**
 * Dependent-parameter rules applied after an edit, so a valid request isn't rejected for a
 * consequence the template can fix itself (e.g. widening past one door's limit adds a door).
 * Returns the adjusted params and a note per change, shown to the designer.
 */
export function adjustBaseCabinet(prev: BaseCabinetParams, next: BaseCabinetParams): { params: BaseCabinetParams; notes: string[] } {
  const params = { ...next };
  const notes: string[] = [];
  const doorsTouched = next.doorCount !== prev.doorCount;
  if (params.front === 'doors' && !doorsTouched) {
    if (params.doorCount === 1 && params.widthUm - (params.blindUm ?? 0) > MAX_DOOR_WIDTH_UM) {
      params.doorCount = 2;
      notes.push(`switched to 2 doors (one door is limited to ${fmtMm(MAX_DOOR_WIDTH_UM)} mm)`);
    } else if (params.doorCount === 2 && params.widthUm - (params.blindUm ?? 0) < mm(400)) {
      params.doorCount = 1;
      notes.push('switched to 1 door (two doors need 400 mm or more)');
    }
  }
  return { params, notes };
}
