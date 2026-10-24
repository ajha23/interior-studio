import { isParametric, type ProjectCore } from '../domain/types';
import { fmtMm, mm } from '../domain/units';
import { envelope, resolveParametric } from '../furniture';
import { footprint, frontZone, penetration } from '../geometry/furniture';
import { doorSwingZone, windowStrips } from '../plan/openings';
import { centroid, outsideDistance } from '../plan/polygon';
import { detectRooms, roomAt, type DetectedRoom } from '../plan/rooms';
import { wallBody, wallIndexLabel, wallLength } from '../plan/walls';

export interface ValidationResult {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  itemIds: string[];
}

/** Deterministic checks over the canonical model. Same function runs in the editor, tests and (later) the API. */
export function validateProject(p: ProjectCore, rooms: DetectedRoom[] = detectRooms(p.plan)): ValidationResult[] {
  const out: ValidationResult[] = [];
  const { plan, furniture, openings } = p;
  const push = (r: Omit<ValidationResult, 'id'>) => out.push({ ...r, id: `${r.code}:${r.itemIds.join(',')}:${out.length}` });

  // Plan
  if (rooms.length === 0) push({ severity: 'error', code: 'NO_ROOM', message: plan.walls.length ? 'The walls do not enclose a room yet — join the wall ends to close it.' : 'Draw walls or add a room to start the plan.', itemIds: [] });
  for (const r of rooms) {
    if (r.areaUm2 < 1e12) push({ severity: 'warning', code: 'ROOM_SMALL', message: `${r.info.name} is under 1 m² of clear floor.`, itemIds: [r.id] });
  }
  if (plan.source === 'estimate') push({ severity: 'warning', code: 'PLAN_ESTIMATE', message: 'Plan dimensions are estimates — verify on site before releasing drawings.', itemIds: [] });
  for (const w of plan.walls) {
    if (wallLength(w) < mm(100)) push({ severity: 'error', code: 'WALL_SHORT', message: `${capital(wallIndexLabel(plan, w.id))} is shorter than 100 mm.`, itemIds: [w.id] });
    if (w.thicknessUm < mm(50)) push({ severity: 'error', code: 'WALL_THIN', message: `${capital(wallIndexLabel(plan, w.id))} is thinner than 50 mm.`, itemIds: [w.id] });
  }
  const bodies = plan.walls.map((w) => ({ id: w.id, poly: wallBody(w, plan) }));

  // Openings
  for (const o of openings) {
    const wall = plan.walls.find((w) => w.id === o.wallId);
    const label = o.kind === 'door' ? 'Door' : 'Window';
    if (!wall) {
      push({ severity: 'error', code: 'OPENING_ORPHAN', message: `${label} is not on any wall.`, itemIds: [o.id] });
      continue;
    }
    const L = wallLength(wall);
    const where = wallIndexLabel(plan, wall.id);
    if (o.offsetUm < 0 || o.offsetUm + o.widthUm > L + 1) push({ severity: 'error', code: 'OPENING_OUTSIDE', message: `${label} on ${where} runs past the wall end (${fmtMm(L)} mm).`, itemIds: [o.id] });
    if (o.sillUm + o.heightUm > wall.heightUm) push({ severity: 'error', code: 'OPENING_TALL', message: `${label} on ${where} is taller than the wall.`, itemIds: [o.id] });
  }
  for (let i = 0; i < openings.length; i++)
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i];
      const b = openings[j];
      if (a.wallId === b.wallId && a.offsetUm < b.offsetUm + b.widthUm && b.offsetUm < a.offsetUm + a.widthUm) push({ severity: 'error', code: 'OPENING_OVERLAP', message: `Openings overlap on ${wallIndexLabel(plan, a.wallId)}.`, itemIds: [a.id, b.id] });
    }

  // Furniture
  const fps = furniture.map((f) => footprint(f));
  const homes = fps.map((fp) => roomAt(rooms, centroid(fp)));
  furniture.forEach((f, i) => {
    const env = envelope(f);
    const home = homes[i];
    if (rooms.length && !home) push({ severity: 'error', code: 'OUT_OF_ROOM', message: `${f.name} is not inside any room.`, itemIds: [f.id] });
    else if (home) {
      const outBy = outsideDistance(fps[i], home.interior);
      const crossing = bodies.find((b) => penetration(fps[i], b.poly) > 0);
      if (outBy > mm(1)) push({ severity: 'error', code: 'OUT_OF_ROOM', message: `${f.name} extends ${fmtMm(outBy)} mm beyond the walls of ${home.info.name}.`, itemIds: [f.id] });
      else if (crossing) push({ severity: 'error', code: 'CROSSES_WALL', message: `${f.name} cuts into ${wallIndexLabel(plan, crossing.id)}.`, itemIds: [f.id, crossing.id] });
      const ceiling = home.info.ceilingUm;
      if (env.heightUm > ceiling) push({ severity: 'error', code: 'ABOVE_CEILING', message: `${f.name} is ${fmtMm(env.heightUm - ceiling)} mm taller than the ceiling.`, itemIds: [f.id] });
      else if (f.kind === 'wardrobe' && ceiling - env.heightUm < mm(25)) push({ severity: 'warning', code: 'INSTALL_GAP', message: `${f.name} leaves ${fmtMm(ceiling - env.heightUm)} mm to the ceiling — under 25 mm makes it hard to tilt into place.`, itemIds: [f.id] });
    }

    if (isParametric(f)) {
      for (const iss of resolveParametric(f, p.rulePack).issues) push({ severity: iss.severity, code: iss.code, message: `${f.name}: ${iss.message}`, itemIds: [f.id] });
    }

    for (const o of openings) {
      const where = wallIndexLabel(plan, o.wallId);
      if (o.kind === 'door') {
        const zone = doorSwingZone(plan, o);
        if (zone && penetration(fps[i], zone) > 0) push({ severity: 'warning', code: 'DOOR_SWING', message: `${f.name} sits in the swing of the door on ${where}.`, itemIds: [f.id, o.id] });
      } else if (env.heightUm > o.sillUm && env.zMinUm < o.sillUm + o.heightUm && windowStrips(plan, o).some((z) => penetration(fps[i], z) > 0)) {
        push({ severity: 'warning', code: 'WINDOW_BLOCKED', message: `${f.name} blocks part of the window on ${where}.`, itemIds: [f.id, o.id] });
      }
    }
  });

  for (let i = 0; i < furniture.length; i++)
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i];
      const b = furniture[j];
      const ea = envelope(a);
      const eb = envelope(b);
      const vertical = ea.zMinUm < eb.heightUm && eb.zMinUm < ea.heightUm;
      const pen = penetration(fps[i], fps[j]);
      if (vertical && pen > 0) push({ severity: 'error', code: 'OVERLAP', message: `${a.name} and ${b.name} overlap by ${fmtMm(pen)} mm.`, itemIds: [a.id, b.id] });
    }

  // Shutter swing clearance for wardrobes: zone as deep as one shutter is wide.
  furniture.forEach((f, i) => {
    if (f.kind !== 'wardrobe') return;
    const r = resolveParametric(f, p.rulePack);
    const shutter = r.parts.find((x) => x.role === 'shutter');
    if (!shutter) return;
    const zone = frontZone(f, shutter.widthUm);
    furniture.forEach((g) => {
      if (g.id === f.id) return;
      if (penetration(zone, footprint(g)) > 0 && envelope(g).zMinUm < f.params.heightUm) push({ severity: 'warning', code: 'SHUTTER_CLEARANCE', message: `${g.name} is within ${fmtMm(shutter.widthUm)} mm of ${f.name} — shutters can't open fully.`, itemIds: [f.id, g.id] });
    });
    const home = homes[i];
    const short = home ? outsideDistance(zone, home.interior) : 0;
    const hitsWall = bodies.some((b) => penetration(zone, b.poly) > mm(1));
    if (short > mm(1) || hitsWall) push({ severity: 'warning', code: 'SHUTTER_WALL', message: `${f.name} shutters hit a wall when opened${short > mm(1) ? ` (${fmtMm(short)} mm short)` : ''}.`, itemIds: [f.id] });
  });

  return out;
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
