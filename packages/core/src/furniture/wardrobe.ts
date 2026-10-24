import type { RulePack, WardrobeParams } from '../domain/types';
import { fmtMm, mm, splitExact, type Um } from '../domain/units';
import { edgeCode, type HardwareLine, type Issue, type Part, type ResolvedFurniture } from './parts';

export const WARDROBE_TEMPLATE_VERSION = 1;
const MAX_BOARD_LENGTH = mm(2440);
const MAX_BOARD_WIDTH = mm(1220);

export function hingesForHeight(h: Um): number {
  if (h <= mm(900)) return 2;
  if (h <= mm(1600)) return 3;
  if (h <= mm(2000)) return 4;
  return 5;
}

/** Positions (bottom z) of n boards of thickness t evenly spaced in the clear span [from, to]. */
export function distribute(from: Um, to: Um, n: number, t: Um): Um[] {
  if (n <= 0) return [];
  const clear = to - from - n * t;
  if (clear <= 0) return [];
  const gaps = splitExact(clear, n + 1);
  const out: Um[] = [];
  let z = from;
  for (let k = 0; k < n; k++) {
    z += gaps[k];
    out.push(z);
    z += t;
  }
  return out;
}

export function backPanels(W: Um, H: Um, bt: Um, keyPrefix: string, issues: Issue[]): Part[] {
  const pieces = Math.max(1, Math.ceil(W / MAX_BOARD_WIDTH));
  const widths = splitExact(W, pieces);
  if (H > MAX_BOARD_LENGTH) {
    issues.push({ severity: 'error', code: 'BACK_TOO_TALL', message: `Back panel height ${fmtMm(H)} mm exceeds a ${fmtMm(MAX_BOARD_LENGTH)} mm board.` });
  }
  let x = 0;
  return widths.map((w, i) => {
    const p: Part = {
      key: `${keyPrefix}-back-${i + 1}`,
      name: pieces > 1 ? `Back panel ${i + 1}/${pieces}` : 'Back panel',
      role: 'back',
      lengthUm: Math.max(H, w),
      widthUm: Math.min(H, w),
      thicknessUm: bt,
      material: 'back',
      grain: 'none',
      edgeBanding: '—',
      box: { x, y: 0, z: 0, w, d: bt, h: H },
    };
    x += w;
    return p;
  });
}

export function resolveWardrobe(params: WardrobeParams, rp: RulePack): ResolvedFurniture {
  const issues: Issue[] = [];
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const { widthUm: W, heightUm: H, depthUm: D } = params;
  const t = rp.carcassThicknessUm;
  const bt = rp.backThicknessUm;
  const st = rp.shutterThicknessUm;
  const g = rp.shutterGapUm;
  const m = Math.max(1, params.modules.length);

  const Dc = D - st; // carcass depth including back
  const sideDepth = Dc - bt; // sides/top/bottom/shelves sit in front of the nailed-on back
  const Hi = H - 2 * t;
  const Wi = W - 2 * t - (m - 1) * t;

  if (W < mm(450)) issues.push({ severity: 'error', code: 'W_MIN', message: 'Width must be at least 450 mm.' });
  if (H < mm(600)) issues.push({ severity: 'error', code: 'H_MIN', message: 'Height must be at least 600 mm.' });
  if (D < mm(350)) issues.push({ severity: 'error', code: 'D_MIN', message: 'Depth must be at least 350 mm (incl. shutters).' });
  if (H > MAX_BOARD_LENGTH) issues.push({ severity: 'error', code: 'SIDE_TOO_LONG', message: `Side panels (${fmtMm(H)} mm) exceed a ${fmtMm(MAX_BOARD_LENGTH)} mm board. Split into base + loft units.` });
  if (sideDepth > MAX_BOARD_WIDTH) issues.push({ severity: 'error', code: 'DEPTH_BOARD', message: 'Carcass depth exceeds board width.' });
  if (Wi <= 0 || Hi <= 0 || sideDepth <= 0) {
    return { templateKey: 'wardrobe', templateVersion: WARDROBE_TEMPLATE_VERSION, overall: { widthUm: W, depthUm: D, heightUm: H, zMinUm: 0 }, modules: [], parts, hardware, issues: [...issues, { severity: 'error', code: 'GEOMETRY', message: 'Dimensions too small for the construction method.' }] };
  }

  // Carcass
  parts.push({ key: 'side-l', name: 'Left side', role: 'side', lengthUm: H, widthUm: sideDepth, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: 0, y: bt, z: 0, w: t, d: sideDepth, h: H } });
  parts.push({ key: 'side-r', name: 'Right side', role: 'side', lengthUm: H, widthUm: sideDepth, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: W - t, y: bt, z: 0, w: t, d: sideDepth, h: H } });
  parts.push({ key: 'top', name: 'Top', role: 'top', lengthUm: W - 2 * t, widthUm: sideDepth, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: H - t, w: W - 2 * t, d: sideDepth, h: t } });
  parts.push({ key: 'bottom', name: 'Bottom', role: 'bottom', lengthUm: W - 2 * t, widthUm: sideDepth, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: 0, w: W - 2 * t, d: sideDepth, h: t } });
  if (W - 2 * t > MAX_BOARD_LENGTH) issues.push({ severity: 'error', code: 'TOP_TOO_LONG', message: `Top/bottom (${fmtMm(W - 2 * t)} mm) exceed a board. Split into two carcasses.` });

  // Modules
  const moduleWidths = splitExact(Wi, m);
  const modules: ResolvedFurniture['modules'] = [];
  let x = t;
  const shelfDepth = sideDepth - rp.shelfSetbackUm;
  let rods = 0;
  let runnerPairs = 0;
  const runnerLenMm = Math.max(250, Math.floor((sideDepth / 1000 - 30) / 50) * 50);

  params.modules.forEach((type, i) => {
    const mw = moduleWidths[i];
    const label = type === 'hanging' ? 'Hanging' : type === 'drawers' ? 'Drawers' : 'Shelves';
    modules.push({ xUm: x, widthUm: mw, label });
    const tag = `m${i + 1}`;
    if (mw < mm(300)) issues.push({ severity: 'error', code: 'MODULE_NARROW', message: `Module ${i + 1} is ${fmtMm(mw)} mm clear — minimum 300 mm.` });
    if (mw > mm(1000) && type !== 'hanging') issues.push({ severity: 'warning', code: 'SHELF_SPAN', message: `Module ${i + 1} shelves span ${fmtMm(mw)} mm — over 1,000 mm risks sag.` });

    const shelf = (z: Um, k: string, name: string) =>
      parts.push({ key: `${tag}-${k}`, name: `M${i + 1} ${name}`, role: 'shelf', lengthUm: mw, widthUm: shelfDepth, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x, y: bt, z, w: mw, d: shelfDepth, h: t } });

    if (type === 'shelves') {
      distribute(t, H - t, params.shelvesPerModule, t).forEach((z, k) => shelf(z, `shelf-${k + 1}`, `shelf ${k + 1}`));
    } else if (type === 'hanging') {
      const hatZ = H - t - mm(400) - t;
      if (hatZ - t < mm(1000)) issues.push({ severity: 'warning', code: 'HANG_SHORT', message: `Module ${i + 1}: only ${fmtMm(hatZ - t)} mm hanging clearance — under 1,000 mm.` });
      if (hatZ > t) shelf(hatZ, 'hat', 'hat shelf');
      rods += 1;
      hardware.push({ name: 'Wardrobe rail', spec: `Oval, ${fmtMm(mw)} mm (M${i + 1})`, qty: 1 });
    } else {
      const n = Math.max(1, params.drawersPerModule);
      const dh = rp.drawerBoxHeightUm;
      const dbt = rp.drawerBoxThicknessUm;
      const boxW = mw - 2 * rp.drawerSideClearanceUm;
      const boxD = mm(runnerLenMm);
      const pitch = dh + mm(40);
      const stackTop = t + mm(20) + n * pitch;
      if (stackTop + t > H - t) issues.push({ severity: 'error', code: 'DRAWER_STACK', message: `Module ${i + 1}: ${n} drawers do not fit the height.` });
      for (let k = 0; k < n; k++) {
        const z = t + mm(20) + k * pitch;
        const dk = `${tag}-dr${k + 1}`;
        const nm = `M${i + 1} drawer ${k + 1}`;
        const bx = x + rp.drawerSideClearanceUm;
        const by = bt + (sideDepth - boxD);
        parts.push({ key: `${dk}-side-l`, name: `${nm} side L`, role: 'drawer-box', lengthUm: boxD, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx, y: by, z, w: dbt, d: boxD, h: dh } });
        parts.push({ key: `${dk}-side-r`, name: `${nm} side R`, role: 'drawer-box', lengthUm: boxD, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + boxW - dbt, y: by, z, w: dbt, d: boxD, h: dh } });
        parts.push({ key: `${dk}-front`, name: `${nm} inner front`, role: 'drawer-box', lengthUm: boxW - 2 * dbt, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + dbt, y: by + boxD - dbt, z, w: boxW - 2 * dbt, d: dbt, h: dh } });
        parts.push({ key: `${dk}-back`, name: `${nm} inner back`, role: 'drawer-box', lengthUm: boxW - 2 * dbt, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + dbt, y: by, z, w: boxW - 2 * dbt, d: dbt, h: dh } });
        parts.push({ key: `${dk}-bottom`, name: `${nm} bottom`, role: 'drawer-bottom', lengthUm: boxW, widthUm: boxD, thicknessUm: bt, material: 'back', grain: 'none', edgeBanding: '—', box: { x: bx, y: by, z: z - bt, w: boxW, d: boxD, h: bt } });
        runnerPairs += 1;
      }
      shelf(stackTop, 'divider', 'divider shelf');
      distribute(stackTop + t, H - t, Math.max(0, params.shelvesPerModule - 1), t).forEach((z, k) => shelf(z, `shelf-${k + 1}`, `shelf ${k + 1}`));
    }

    x += mw;
    if (i < m - 1) {
      parts.push({ key: `partition-${i + 1}`, name: `Partition ${i + 1}`, role: 'partition', lengthUm: Hi, widthUm: sideDepth, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x, y: bt, z: t, w: t, d: sideDepth, h: Hi } });
      x += t;
    }
  });

  // Back
  parts.push(...backPanels(W, H, bt, 'w', issues));

  // Shutters — full overlay, uniform gaps
  const n = Math.max(1, params.shutterCount);
  const sws = splitExact(W - (n + 1) * g, n);
  const sh = H - 2 * g;
  let sx = g;
  sws.forEach((sw, i) => {
    parts.push({ key: `shutter-${i + 1}`, name: `Shutter ${i + 1}`, role: 'shutter', lengthUm: sh, widthUm: sw, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x: sx, y: Dc, z: g, w: sw, d: st, h: sh } });
    sx += sw + g;
  });
  const sw0 = sws[0];
  if (sw0 > mm(600)) issues.push({ severity: 'warning', code: 'SHUTTER_WIDE', message: `Shutters are ${fmtMm(sw0)} mm wide — over 600 mm risks sagging.` });
  if (sw0 < mm(250)) issues.push({ severity: 'error', code: 'SHUTTER_NARROW', message: `Shutters are ${fmtMm(sw0)} mm wide — minimum 250 mm.` });

  // Hinged edges must land on a side or partition.
  const supports = [0, W - t];
  let px = t;
  moduleWidths.forEach((mw, i) => {
    px += mw;
    if (i < m - 1) {
      supports.push(px);
      px += t;
    }
  });
  let unsupported = 0;
  sx = g;
  const onSupport = (edge: Um) => supports.some((s) => edge >= s - g - mm(2) && edge <= s + t + g + mm(2));
  sws.forEach((sw) => {
    // A shutter can be hinged on whichever edge lands on a side or partition.
    if (!onSupport(sx) && !onSupport(sx + sw)) unsupported++;
    sx += sw + g;
  });
  if (unsupported > 0) issues.push({ severity: 'warning', code: 'HINGE_SUPPORT', message: `${unsupported} shutter hinge edge(s) don't fall on a side or partition. Align shutter count with modules.` });

  const hingesEach = hingesForHeight(sh);
  hardware.unshift(
    { name: 'Concealed hinge', spec: '110°, full overlay, soft-close', qty: n * hingesEach },
    { name: 'Handle', spec: 'Designer selection', qty: n },
  );
  if (runnerPairs) hardware.push({ name: 'Drawer runner (pair)', spec: `Telescopic, ${runnerLenMm} mm`, qty: runnerPairs });
  if (rods) hardware.push({ name: 'Rail end bracket', spec: 'Pair per rail', qty: rods });
  hardware.push({ name: 'Wall anchor bracket', spec: 'L-bracket to wall', qty: m + 1 });

  return {
    templateKey: 'wardrobe',
    templateVersion: WARDROBE_TEMPLATE_VERSION,
    overall: { widthUm: W, depthUm: D, heightUm: H, zMinUm: 0 },
    modules,
    parts,
    hardware,
    issues,
  };
}
