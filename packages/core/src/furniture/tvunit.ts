import type { RulePack, TvUnitParams } from '../domain/types';
import { fmtMm, mm, splitExact } from '../domain/units';
import { edgeCode, type HardwareLine, type Issue, type Part, type ResolvedFurniture } from './parts';
import { backPanels } from './wardrobe';

export const TVUNIT_TEMPLATE_VERSION = 1;

/**
 * Wall-hung console. Local z = 0 is the finished floor; the carcass starts at mountHeight.
 * Optional wall panel sits on top of the console against the wall.
 */
export function resolveTvUnit(params: TvUnitParams, rp: RulePack): ResolvedFurniture {
  const issues: Issue[] = [];
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const { widthUm: W, heightUm: H, depthUm: D, mountHeightUm: z0, wallPanelHeightUm: PH } = params;
  const t = rp.carcassThicknessUm;
  const bt = rp.backThicknessUm;
  const st = rp.shutterThicknessUm;
  const g = rp.shutterGapUm;
  const m = Math.max(1, params.modules.length);
  const hasFronts = params.modules.some((x) => x !== 'open');
  const Dc = hasFronts ? D - st : D;
  const sd = Dc - bt;
  const Wi = W - 2 * t - (m - 1) * t;

  if (W < mm(600)) issues.push({ severity: 'error', code: 'W_MIN', message: 'Width must be at least 600 mm.' });
  if (H < mm(150)) issues.push({ severity: 'error', code: 'H_MIN', message: 'Console height must be at least 150 mm.' });
  if (D < mm(250)) issues.push({ severity: 'error', code: 'D_MIN', message: 'Depth must be at least 250 mm.' });
  if (W - 2 * t > mm(2440)) issues.push({ severity: 'error', code: 'TOP_TOO_LONG', message: 'Top/bottom exceed a 2440 mm board.' });
  if (Wi <= 0 || sd <= 0 || H - 2 * t <= 0) {
    return { templateKey: 'tvunit', templateVersion: TVUNIT_TEMPLATE_VERSION, overall: { widthUm: W, depthUm: D, heightUm: z0 + H + PH, zMinUm: z0 }, modules: [], parts, hardware, issues: [...issues, { severity: 'error', code: 'GEOMETRY', message: 'Dimensions too small for the construction method.' }] };
  }
  if (z0 < mm(150)) issues.push({ severity: 'warning', code: 'MOUNT_LOW', message: `Mounted ${fmtMm(z0)} mm above floor — under 150 mm makes floor cleaning hard.` });

  const add = (p: Omit<Part, 'box'> & { box: Part['box'] }) => parts.push({ ...p, box: { ...p.box, z: p.box.z + z0 } });

  add({ key: 'side-l', name: 'Left side', role: 'side', lengthUm: sd, widthUm: H, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(0, 1), box: { x: 0, y: bt, z: 0, w: t, d: sd, h: H } });
  add({ key: 'side-r', name: 'Right side', role: 'side', lengthUm: sd, widthUm: H, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(0, 1), box: { x: W - t, y: bt, z: 0, w: t, d: sd, h: H } });
  add({ key: 'top', name: 'Top', role: 'top', lengthUm: W - 2 * t, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: H - t, w: W - 2 * t, d: sd, h: t } });
  add({ key: 'bottom', name: 'Bottom', role: 'bottom', lengthUm: W - 2 * t, widthUm: sd, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: t, y: bt, z: 0, w: W - 2 * t, d: sd, h: t } });

  const mws = splitExact(Wi, m);
  const modules: ResolvedFurniture['modules'] = [];
  let x = t;
  let flaps = 0;
  params.modules.forEach((type, i) => {
    const mw = mws[i];
    modules.push({ xUm: x, widthUm: mw, label: type === 'drawer' ? 'Drawer' : type === 'flap' ? 'Flap' : 'Open' });
    if (mw < mm(250)) issues.push({ severity: 'error', code: 'MODULE_NARROW', message: `Module ${i + 1} is ${fmtMm(mw)} mm clear — minimum 250 mm.` });
    if (type === 'open' && H - 2 * t >= mm(300)) {
      const z = t + Math.floor((H - 3 * t) / 2);
      add({ key: `m${i + 1}-shelf`, name: `M${i + 1} shelf`, role: 'shelf', lengthUm: mw, widthUm: sd - rp.shelfSetbackUm, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x, y: bt, z, w: mw, d: sd - rp.shelfSetbackUm, h: t } });
    }
    if (type === 'drawer') {
      const dbt = rp.drawerBoxThicknessUm;
      const dh = Math.min(rp.drawerBoxHeightUm, H - 2 * t - mm(40));
      const boxW = mw - 2 * rp.drawerSideClearanceUm;
      const runnerMm = Math.max(250, Math.floor((sd / 1000 - 30) / 50) * 50);
      const boxD = mm(runnerMm);
      const bx = x + rp.drawerSideClearanceUm;
      const by = bt + sd - boxD;
      const z = t + mm(20);
      const nm = `M${i + 1} drawer`;
      if (dh < mm(60)) issues.push({ severity: 'error', code: 'DRAWER_LOW', message: `Module ${i + 1}: console too low for a drawer.` });
      add({ key: `m${i + 1}-dr-side-l`, name: `${nm} side L`, role: 'drawer-box', lengthUm: boxD, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx, y: by, z, w: dbt, d: boxD, h: dh } });
      add({ key: `m${i + 1}-dr-side-r`, name: `${nm} side R`, role: 'drawer-box', lengthUm: boxD, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + boxW - dbt, y: by, z, w: dbt, d: boxD, h: dh } });
      add({ key: `m${i + 1}-dr-back`, name: `${nm} back`, role: 'drawer-box', lengthUm: boxW - 2 * dbt, widthUm: dh, thicknessUm: dbt, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(1, 0), box: { x: bx + dbt, y: by, z, w: boxW - 2 * dbt, d: dbt, h: dh } });
      add({ key: `m${i + 1}-dr-bottom`, name: `${nm} bottom`, role: 'drawer-bottom', lengthUm: boxW, widthUm: boxD, thicknessUm: bt, material: 'back', grain: 'none', edgeBanding: '—', box: { x: bx, y: by, z: z - bt, w: boxW, d: boxD, h: bt } });
      hardware.push({ name: 'Drawer runner (pair)', spec: `Soft-close, ${runnerMm} mm`, qty: 1 });
    }
    if (type === 'flap') flaps++;
    x += mw;
    if (i < m - 1) {
      add({ key: `partition-${i + 1}`, name: `Partition ${i + 1}`, role: 'partition', lengthUm: sd, widthUm: H - 2 * t, thicknessUm: t, material: 'carcass', grain: 'along-length', edgeBanding: edgeCode(0, 1), box: { x, y: bt, z: t, w: t, d: sd, h: H - 2 * t } });
      x += t;
    }
  });

  backPanels(W, H, bt, 'tv', issues).forEach((p) => add(p));

  // Fronts: one per non-open module, spanning the module plus half of each adjoining board, minus gaps.
  if (hasFronts) {
    let mx = 0;
    params.modules.forEach((type, i) => {
      const left = i === 0 ? 0 : mx + t / 2;
      const right = i === m - 1 ? W : mx + t + mws[i] + t / 2;
      mx += t + mws[i];
      if (type === 'open') return;
      const fx = Math.round(left + g / 2 + (i === 0 ? g / 2 : 0));
      const fr = Math.round(right - g / 2 - (i === m - 1 ? g / 2 : 0));
      const fw = fr - fx;
      add({ key: `m${i + 1}-front`, name: `M${i + 1} ${type === 'drawer' ? 'drawer front' : 'flap'}`, role: type === 'drawer' ? 'drawer-front' : 'shutter', lengthUm: fw, widthUm: H - 2 * g, thicknessUm: st, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x: fx, y: Dc, z: g, w: fw, d: st, h: H - 2 * g } });
    });
  }
  if (flaps) hardware.push({ name: 'Flap stay', spec: 'Soft-down lift-up', qty: flaps }, { name: 'Concealed hinge', spec: '110°, full overlay', qty: flaps * 2 });
  const handled = params.modules.filter((x) => x !== 'open').length;
  if (handled) hardware.push({ name: 'Push-to-open latch', spec: 'Handleless', qty: handled });
  hardware.push({ name: 'Wall-hung bracket', spec: 'Concealed, rated 50 kg', qty: Math.max(2, m) }, { name: 'Cable grommet', spec: '60 mm, top rear', qty: 1 });

  if (PH > 0) {
    if (PH > mm(2440)) issues.push({ severity: 'error', code: 'PANEL_TALL', message: 'Wall panel taller than a board.' });
    add({ key: 'wall-panel', name: 'Wall panel', role: 'panel', lengthUm: Math.max(W, PH), widthUm: Math.min(W, PH), thicknessUm: t, material: 'shutter', grain: 'along-length', edgeBanding: edgeCode(2, 2), box: { x: 0, y: 0, z: H, w: W, d: t, h: PH } });
  }

  return {
    templateKey: 'tvunit',
    templateVersion: TVUNIT_TEMPLATE_VERSION,
    overall: { widthUm: W, depthUm: D, heightUm: z0 + H + PH, zMinUm: z0 },
    modules,
    parts,
    hardware,
    issues,
  };
}
