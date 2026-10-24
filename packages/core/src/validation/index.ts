import { isParametric, type ProjectCore } from '../domain/types';
import { fmtMm, mm } from '../domain/units';
import { envelope, resolveParametric } from '../furniture';
import { doorSwingZone, footprint, frontZone, outsideBy, penetration, wallLength, windowStrip } from '../geometry';

export interface ValidationResult {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  itemIds: string[];
}

/** Deterministic checks over the canonical model. Same function runs in the editor, tests and (later) the API. */
export function validateProject(p: ProjectCore): ValidationResult[] {
  const out: ValidationResult[] = [];
  const { room, furniture, openings } = p;
  const push = (r: Omit<ValidationResult, 'id'>) => out.push({ ...r, id: `${r.code}:${r.itemIds.join(',')}:${out.length}` });

  if (room.widthUm < mm(1000) || room.depthUm < mm(1000)) push({ severity: 'error', code: 'ROOM_SMALL', message: 'Room must be at least 1,000 × 1,000 mm.', itemIds: [] });
  if (room.source === 'estimate') push({ severity: 'warning', code: 'ROOM_ESTIMATE', message: 'Room dimensions are estimates — verify on site before releasing drawings.', itemIds: [] });

  for (const o of openings) {
    const L = wallLength(room, o.wall);
    const label = o.kind === 'door' ? 'Door' : 'Window';
    if (o.offsetUm < 0 || o.offsetUm + o.widthUm > L) push({ severity: 'error', code: 'OPENING_OUTSIDE', message: `${label} on ${o.wall} wall runs past the wall end (${fmtMm(L)} mm).`, itemIds: [o.id] });
    if (o.sillUm + o.heightUm > room.ceilingUm) push({ severity: 'error', code: 'OPENING_TALL', message: `${label} on ${o.wall} wall is taller than the ceiling.`, itemIds: [o.id] });
  }
  for (let i = 0; i < openings.length; i++)
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i];
      const b = openings[j];
      if (a.wall === b.wall && a.offsetUm < b.offsetUm + b.widthUm && b.offsetUm < a.offsetUm + a.widthUm) push({ severity: 'error', code: 'OPENING_OVERLAP', message: `Openings overlap on ${a.wall} wall.`, itemIds: [a.id, b.id] });
    }

  const fps = furniture.map((f) => footprint(f));
  furniture.forEach((f, i) => {
    const env = envelope(f);
    const out1 = outsideBy(fps[i], room);
    if (out1 > mm(1)) push({ severity: 'error', code: 'OUT_OF_ROOM', message: `${f.name} extends ${fmtMm(out1)} mm outside the room.`, itemIds: [f.id] });
    if (env.heightUm > room.ceilingUm) push({ severity: 'error', code: 'ABOVE_CEILING', message: `${f.name} is ${fmtMm(env.heightUm - room.ceilingUm)} mm taller than the ceiling.`, itemIds: [f.id] });
    else if (f.kind === 'wardrobe' && room.ceilingUm - env.heightUm < mm(25)) push({ severity: 'warning', code: 'INSTALL_GAP', message: `${f.name} leaves ${fmtMm(room.ceilingUm - env.heightUm)} mm to the ceiling — under 25 mm makes it hard to tilt into place.`, itemIds: [f.id] });

    if (isParametric(f)) {
      for (const iss of resolveParametric(f, p.rulePack).issues) push({ severity: iss.severity, code: iss.code, message: `${f.name}: ${iss.message}`, itemIds: [f.id] });
    }

    for (const o of openings) {
      if (o.kind === 'door' && penetration(fps[i], doorSwingZone(room, o)) > 0) push({ severity: 'warning', code: 'DOOR_SWING', message: `${f.name} sits in the swing of the door on the ${o.wall} wall.`, itemIds: [f.id, o.id] });
      if (o.kind === 'window' && env.heightUm > o.sillUm && env.zMinUm < o.sillUm + o.heightUm && penetration(fps[i], windowStrip(room, o)) > 0) push({ severity: 'warning', code: 'WINDOW_BLOCKED', message: `${f.name} blocks part of the window on the ${o.wall} wall.`, itemIds: [f.id, o.id] });
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
  furniture.forEach((f) => {
    if (f.kind !== 'wardrobe') return;
    const r = resolveParametric(f, p.rulePack);
    const shutter = r.parts.find((x) => x.role === 'shutter');
    if (!shutter) return;
    const zone = frontZone(f, shutter.widthUm);
    furniture.forEach((g) => {
      if (g.id === f.id) return;
      if (penetration(zone, footprint(g)) > 0 && envelope(g).zMinUm < f.params.heightUm) push({ severity: 'warning', code: 'SHUTTER_CLEARANCE', message: `${g.name} is within ${fmtMm(shutter.widthUm)} mm of ${f.name} — shutters can't open fully.`, itemIds: [f.id, g.id] });
    });
    const outside = outsideBy(zone, p.room);
    if (outside > mm(1)) push({ severity: 'warning', code: 'SHUTTER_WALL', message: `${f.name} shutters hit a wall when opened (${fmtMm(outside)} mm short).`, itemIds: [f.id] });
  });

  return out;
}
