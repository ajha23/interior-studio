/**
 * The assistant on a home's plan (no room open in the editor): designs a new home, applies a style to
 * every room, opens a room to design it, resizes a room, and describes the home. Room-level changes
 * (furniture, finishes of one room) happen inside the room, where the full assistant works.
 */
import { navigate } from '@/app/router';
import { carpetArea, ROOM_TYPE_LABELS, roomArea, type HomeRoom } from '@/domain';
import { parseHomeBrief } from '@/engine/home/brief';
import { HOME_STYLES, type HomeStyleId } from '@/engine/home/generate';
import { parseLength } from '@/engine/measurement/units';
import { useHomeStore } from './homeStore';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();

/** The room a phrase names ("bedroom 2", "the kitchen", "master bath"). */
export function findRoom(rooms: HomeRoom[], phrase: string): HomeRoom | null {
  const p = norm(phrase).replace(/^(the|my) /, '');
  return rooms.find((r) => norm(r.name) === p) ?? rooms.find((r) => norm(r.name).startsWith(p) || p.startsWith(norm(r.name))) ?? rooms.find((r) => norm(ROOM_TYPE_LABELS[r.type]) === p || r.type === p.replace(/ /g, '-')) ?? rooms.find((r) => norm(r.name).includes(p)) ?? null;
}

export function homeCommand(text: string): string | null {
  const store = useHomeStore.getState();
  const home = store.home;
  if (!home) return null;
  const t = norm(text);

  const brief = parseHomeBrief(text);
  if (brief && /\b(new|another|design|create|generate|make)\b/.test(t)) {
    void store.create(brief).then((h) => navigate({ name: 'house', homeId: h.id }));
    return `Designing a new ${brief.bhk}BHK ${brief.kind}${brief.carpetAreaSqft ? ` of about ${brief.carpetAreaSqft} sq ft` : ''}. It opens in a moment (this one stays in your projects once saved).`;
  }

  const styleId = (Object.keys(HOME_STYLES) as HomeStyleId[]).find((s) => t.includes(s) || t.includes(norm(HOME_STYLES[s].label))) ?? (/\b(wood|wooden)\b/.test(t) ? 'warm' : null);
  if (styleId && /\b(style|look|make|apply|change|use|theme|everything|whole|all)\b/.test(t)) {
    store.restyle(styleId);
    return `Applied the ${HOME_STYLES[styleId].label} style to every room: floors, walls, wood, kitchen fronts and soft furnishings. Save to keep it.`;
  }

  // The size is the last number before "wide"/"long" (room names can contain numbers: "bedroom 2").
  const resize = /^(?:make|set|change|resize)\s+(.+)\s+(?:to\s+)?(\d+(?:\.\d+)?\s*(?:mm|cm|m|metres?|meters?|ft|feet|foot|in|inch(?:es)?)?)\s+(wide|width|long|length|deep)$/.exec(t);
  if (resize) {
    const room = findRoom(home.rooms, resize[1]!);
    if (!room) return `I could not find “${resize[1]}”. Rooms: ${home.rooms.map((r) => r.name).join(', ')}.`;
    const parsed = parseLength(resize[2]!.replace(/metres?|meters?/, 'm').replace(/feet|foot/, 'ft'), 'mm');
    if (!parsed.ok) return parsed.error;
    const key = /wide|width/.test(resize[3]!) ? 'width' : 'length';
    const errors = store.updateRoom(room.id, { [key]: parsed.mm });
    return errors.length ? errors.join(' ') : `${room.name} is now ${parsed.mm} mm ${key === 'width' ? 'wide' : 'long'}. Neighbouring rooms stay where they are; save to keep it.`;
  }

  const open = /^(?:open|design|furnish|edit|go to|enter|show me|take me to|work on)\s+(.+)$/.exec(t);
  if (open) {
    const room = findRoom(home.rooms, open[1]!);
    if (room) {
      navigate({ name: 'room', homeId: home.id, roomId: room.id });
      return `Opening the ${room.name.toLowerCase()} in the room editor: change its layout, furniture and finishes there, then use “Home plan” to come back.`;
    }
  }

  if (/\b(how big|size|area|sq ?ft|square|rooms?|what|which|list)\b/.test(t)) {
    const a = carpetArea(home);
    return `${home.name}: ${home.bhk}BHK ${home.kind}, ${Math.round(a.sqft).toLocaleString()} sq ft carpet (${a.m2.toFixed(0)} m²), ${home.style ?? 'custom'} style. Rooms: ${home.rooms.map((r) => `${r.name} ${roomArea(r).toFixed(1)} m²`).join('; ')}.`;
  }

  return 'On the home plan I can: apply a style to every room (“make it japandi”), open a room to design it (“design the kitchen”), resize a room (“make bedroom 2 4 m wide”), tell you the sizes, or design a new home (“design a 4BHK villa”). To change furniture or finishes in one room, open that room.';
}
