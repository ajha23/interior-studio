/**
 * Design checks: kitchen-planning guidance that flags awkward layouts without blocking edits.
 * Door and drawer clearances use the same movers that animate the 3D model, so a warning matches
 * what you would see opening the door. All distances in millimetres.
 */
import { allElements, deriveCountertops, elementLabel, isCabinet, specOf, type KitchenElement, type KitchenProject } from '@/domain';
import { boxesIntersect, elementBox, unionBoxes, type Box } from '../geometry/box';
import { buildModel, moverPoint, type Mover } from '../geometry/parts';
import { localToRoom } from '../geometry/transform';

export type CheckCode = 'clearance' | 'walkway' | 'wall-cabinet-height' | 'hood-height' | 'landing' | 'work-triangle';

export interface DesignCheck {
  id: string;
  severity: 'warning' | 'info';
  code: CheckCode;
  entityIds: string[];
  message: string;
  /** Space to highlight (e.g. what a door sweeps when it opens), in room millimetres. */
  zone?: Box;
}

export const WALKWAY_MIN = 900;
export const WALL_CABINET_GAP_MIN = 450;
export const HOOD_GAP = { min: 650, max: 750 };
const DOOR_CHECK_ANGLE = Math.PI / 2;
/**
 * Overlaps up to this deep are absorbed by real hinges (which offset the door as it opens), so they
 * are not reported as clashes. Covers 18 mm cabinet doors and ~30 mm appliance doors.
 */
const CLASH_TOLERANCE = 35;
/** Gaps narrower than this are fillers and corner joints, not walkways. */
const JOINT = 100;

const floorUnit = (el: KitchenElement) => specOf(el).mount === 'floor';
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The room-space box a mover sweeps from closed to open (doors to 90°, drawers fully out). */
export function sweptZone(el: KitchenElement, mover: Mover): Box {
  const { parts } = buildModel(el);
  const tMax = mover.kind === 'hinge' ? Math.min(1, DOOR_CHECK_ANGLE / Math.abs(mover.amount)) : 1;
  const boxes: Box[] = [];
  for (const p of parts.filter((x) => x.mover === mover.id && x.finish !== 'handle')) {
    const hx = p.size.x / 2;
    const hy = p.size.y / 2;
    const hz = p.size.z / 2;
    for (let i = 0; i <= 6; i++) {
      const t = (tMax * i) / 6;
      const pts = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => localToRoom(el, moverPoint(mover, t, { x: p.center.x + sx * hx, y: p.center.y + sy * hy, z: p.center.z + sz * hz })))));
      boxes.push({
        minX: Math.min(...pts.map((q) => q.x)),
        maxX: Math.max(...pts.map((q) => q.x)),
        minY: Math.min(...pts.map((q) => q.y)),
        maxY: Math.max(...pts.map((q) => q.y)),
        minZ: Math.min(...pts.map((q) => q.z)),
        maxZ: Math.max(...pts.map((q) => q.z)),
      });
    }
  }
  return unionBoxes(boxes);
}

function clearanceChecks(project: KitchenProject, elements: KitchenElement[], boxes: Map<string, Box>): DesignCheck[] {
  const out: DesignCheck[] = [];
  const { width: W, length: L } = project.room;
  for (const el of elements) {
    for (const m of buildModel(el).movers) {
      if (m.requires.length) continue; // inner drawers stay inside their own open doors
      const zone = sweptZone(el, m);
      const what = `The ${lower(m.label)} of ${elementLabel(el)}`;
      const action = m.kind === 'slide' ? 'pulled out' : 'opened';
      for (const other of elements) {
        if (other.id === el.id || !boxesIntersect(zone, boxes.get(other.id)!, CLASH_TOLERANCE)) continue;
        out.push({ id: `clearance:${el.id}:${m.id}:${other.id}`, severity: 'warning', code: 'clearance', entityIds: [el.id, other.id], zone, message: `${what} hits ${elementLabel(other)} when ${action}.` });
      }
      const wall = zone.minX < -CLASH_TOLERANCE ? 'left' : zone.maxX > W + CLASH_TOLERANCE ? 'right' : zone.minZ < -CLASH_TOLERANCE ? 'back' : zone.maxZ > L + CLASH_TOLERANCE ? 'front' : null;
      if (wall) out.push({ id: `clearance:${el.id}:${m.id}:wall`, severity: 'warning', code: 'clearance', entityIds: [el.id], zone, message: `${what} hits the ${wall} wall when ${action}.` });
    }
  }
  return out;
}

function walkwayChecks(floor: KitchenElement[], boxes: Map<string, Box>): DesignCheck[] {
  const out: DesignCheck[] = [];
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  // A unit's front points along +z (0°), +x (90°), −z (180°) or −x (270°).
  const faces = (el: KitchenElement, axis: 'x' | 'z', dir: 1 | -1) => (axis === 'z' ? el.rotationY === (dir === 1 ? 0 : 180) : el.rotationY === (dir === 1 ? 90 : 270));
  for (let i = 0; i < floor.length; i++) {
    for (let j = i + 1; j < floor.length; j++) {
      const a = floor[i]!;
      const b = floor[j]!;
      const A = boxes.get(a.id)!;
      const B = boxes.get(b.id)!;
      for (const axis of ['x', 'z'] as const) {
        const [lo, hi] = axis === 'z' ? (A.maxZ <= B.minZ ? [a, b] : B.maxZ <= A.minZ ? [b, a] : [null, null]) : A.maxX <= B.minX ? [a, b] : B.maxX <= A.minX ? [b, a] : [null, null];
        if (!lo || !hi) continue;
        const LB = boxes.get(lo.id)!;
        const HB = boxes.get(hi.id)!;
        const across = axis === 'z' ? overlap(LB.minX, LB.maxX, HB.minX, HB.maxX) : overlap(LB.minZ, LB.maxZ, HB.minZ, HB.maxZ);
        const gap = axis === 'z' ? HB.minZ - LB.maxZ : HB.minX - LB.maxX;
        if (across < JOINT || gap < JOINT || gap >= WALKWAY_MIN) continue;
        if (!faces(lo, axis, 1) && !faces(hi, axis, -1)) continue;
        const zone: Box = axis === 'z'
          ? { minX: Math.max(LB.minX, HB.minX), maxX: Math.min(LB.maxX, HB.maxX), minZ: LB.maxZ, maxZ: HB.minZ, minY: 0, maxY: 50 }
          : { minX: LB.maxX, maxX: HB.minX, minZ: Math.max(LB.minZ, HB.minZ), maxZ: Math.min(LB.maxZ, HB.maxZ), minY: 0, maxY: 50 };
        // Only an empty corridor is a walkway (not the corner of an L, where units fill the gap).
        if (floor.some((o) => o.id !== lo.id && o.id !== hi.id && boxesIntersect(zone, { ...boxes.get(o.id)!, minY: 0, maxY: 50 }, 1))) continue;
        out.push({ id: `walkway:${lo.id}:${hi.id}`, severity: 'warning', code: 'walkway', entityIds: [lo.id, hi.id], zone, message: `Only ${Math.round(gap)} mm between ${elementLabel(lo)} and ${elementLabel(hi)} (allow at least ${WALKWAY_MIN} mm to walk and open doors).` });
      }
    }
  }
  return out;
}

function heightChecks(project: KitchenProject, elements: KitchenElement[], boxes: Map<string, Box>): DesignCheck[] {
  const out: DesignCheck[] = [];
  const slabs = deriveCountertops(project);
  const planOverlap = (a: Box, b: Box, min: number) => Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > min && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > min;
  for (const el of elements) {
    const box = boxes.get(el.id)!;
    if (isCabinet(el) && el.type === 'wall') {
      const below = slabs.filter((s) => s.box.maxY <= box.minY && planOverlap(s.box, box, 50));
      const top = Math.max(-Infinity, ...below.map((s) => s.box.maxY));
      if (below.length && box.minY - top < WALL_CABINET_GAP_MIN) {
        out.push({ id: `wall-gap:${el.id}`, severity: 'warning', code: 'wall-cabinet-height', entityIds: [el.id], message: `Only ${box.minY - top} mm between the worktop and ${elementLabel(el)} (allow at least ${WALL_CABINET_GAP_MIN} mm).` });
      }
    }
    if (!isCabinet(el) && el.type === 'hood') {
      const hob = elements.find((o) => !isCabinet(o) && o.type === 'range' && planOverlap(boxes.get(o.id)!, box, 100));
      if (hob) {
        const gap = box.minY - boxes.get(hob.id)!.maxY;
        if (gap < HOOD_GAP.min || gap > HOOD_GAP.max) {
          out.push({ id: `hood:${el.id}`, severity: 'warning', code: 'hood-height', entityIds: [el.id, hob.id], message: `The cooker hood is ${gap} mm above the hob (manufacturers usually ask for ${HOOD_GAP.min}–${HOOD_GAP.max} mm).` });
        }
      }
    }
    if (!isCabinet(el) && el.type === 'range' && el.wallId) {
      for (const other of elements) {
        if (other.id === el.id || other.wallId !== el.wallId || !floorUnit(other)) continue;
        const o = boxes.get(other.id)!;
        const tall = o.maxY > box.maxY + 200;
        const along = el.wallId === 'back' || el.wallId === 'front' ? [box.minX, box.maxX, o.minX, o.maxX] : [box.minZ, box.maxZ, o.minZ, o.maxZ];
        const touching = Math.abs(along[0]! - along[3]!) < 300 || Math.abs(along[2]! - along[1]!) < 300;
        if (tall && touching) out.push({ id: `landing:${el.id}:${other.id}`, severity: 'warning', code: 'landing', entityIds: [el.id, other.id], message: `${elementLabel(other)} stands right beside the ${lower(elementLabel(el))}: leave at least 300 mm of worktop next to the hob to set pans down.` });
      }
    }
  }
  return out;
}

function workTriangle(elements: KitchenElement[]): DesignCheck[] {
  const pick = (pred: (e: KitchenElement) => boolean) => elements.find(pred);
  const sink = pick((e) => isCabinet(e) && e.type === 'sink');
  const hob = pick((e) => !isCabinet(e) && e.type === 'range');
  const fridge = pick((e) => !isCabinet(e) && e.type === 'fridge');
  if (!sink || !hob || !fridge) return [];
  const front = (e: KitchenElement) => localToRoom(e, { x: 0, y: 0, z: e.dimensions.depth / 2 });
  const [s, h, f] = [front(sink), front(hob), front(fridge)];
  const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const legs = [d(s, h), d(h, f), d(f, s)];
  const total = legs.reduce((a, b) => a + b, 0);
  const m = (v: number) => (v / 1000).toFixed(1);
  const ok = legs.every((l) => l >= 1200 && l <= 2700) && total >= 4000 && total <= 7900;
  return [
    {
      id: 'work-triangle',
      // Guidance for discussion with the client, never a warning.
      severity: 'info',
      code: 'work-triangle',
      entityIds: [sink.id, hob.id, fridge.id],
      message: `Work triangle sink → hob → fridge: ${m(legs[0]!)} + ${m(legs[1]!)} + ${m(legs[2]!)} = ${m(total)} m${ok ? ' (within the usual 1.2–2.7 m legs, 4.0–7.9 m total)' : ' (aim for legs of 1.2–2.7 m and 4.0–7.9 m in total)'}.`,
    },
  ];
}

export function designChecks(project: KitchenProject): DesignCheck[] {
  const elements = allElements(project);
  const boxes = new Map(elements.map((e) => [e.id, elementBox(e)]));
  return [
    ...clearanceChecks(project, elements, boxes),
    ...walkwayChecks(elements.filter(floorUnit), boxes),
    ...heightChecks(project, elements, boxes),
    ...workTriangle(elements),
  ];
}
