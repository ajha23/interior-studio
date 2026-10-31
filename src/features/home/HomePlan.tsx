/**
 * The home's floor plan for one level: walls at their real thickness with door, archway and window
 * gaps, every unit and piece of furniture as its footprint, and each room's name, size and area.
 * Click a room to select it; double-click to open it in the editor.
 */
import { allElements, type Home, type HomeRoom, type Opening, type RoomType } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { formatLength, type LengthUnit } from '@/engine/measurement/units';

const FILL: Partial<Record<RoomType, string>> = {
  living: '#f3ead9',
  family: '#f3ead9',
  dining: '#f1e6d2',
  kitchen: '#e8eef0',
  'master-bedroom': '#ece6f2',
  bedroom: '#ede8f3',
  bathroom: '#e1edf3',
  study: '#eef1e4',
  pooja: '#f6ecd8',
  balcony: '#e6efe2',
  staircase: '#ebe7e1',
};

/** The strip of wall an opening cuts, in plan mm. */
function openingRect(room: HomeRoom, o: Opening): { x: number; z: number; w: number; h: number } {
  const { width: W, length: L, wallThickness: T } = room.design.room;
  switch (o.wallId) {
    case 'back':
      return { x: room.x + o.offset, z: room.z - T, w: o.width, h: T };
    case 'front':
      return { x: room.x + o.offset, z: room.z + L, w: o.width, h: T };
    case 'left':
      return { x: room.x - T, z: room.z + o.offset, w: T, h: o.width };
    case 'right':
      return { x: room.x + W, z: room.z + o.offset, w: T, h: o.width };
  }
}

export function HomePlan({ home, level, selectedRoomId, unit, onSelect, onOpen }: { home: Home; level: number; selectedRoomId: string | null; unit: LengthUnit; onSelect: (id: string | null) => void; onOpen: (id: string) => void }) {
  const rooms = home.rooms.filter((r) => r.level === level);
  const pad = 600;
  const fmt = (mm: number) => formatLength(mm, unit === 'mm' ? 'm' : unit);
  return (
    <svg viewBox={`${-pad} ${-pad} ${home.plot.width + 2 * pad} ${home.plot.length + 2 * pad}`} className="size-full select-none" role="img" aria-label={`Floor plan, ${level === 0 ? 'ground floor' : `level ${level}`}`} onClick={() => onSelect(null)} data-testid="home-plan">
      <rect x={0} y={0} width={home.plot.width} height={home.plot.length} fill="#e7e3dc" />
      {rooms.map((room) => {
        const { width: W, length: L, wallThickness: T } = room.design.room;
        const selected = room.id === selectedRoomId;
        const area = (W * L) / 1e6;
        return (
          <g
            key={room.id}
            data-testid={`plan-room-${room.id}`}
            data-room-type={room.type}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(room.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onOpen(room.id);
            }}
          >
            <title>{`${room.name} — double-click to design it`}</title>
            <rect x={room.x - T} y={room.z - T} width={W + 2 * T} height={L + 2 * T} fill="#45464a" />
            <rect x={room.x} y={room.z} width={W} height={L} fill={FILL[room.type] ?? '#f2f0ec'} stroke={selected ? '#2563eb' : 'none'} strokeWidth={selected ? 60 : 0} />
            {allElements(room.design).map((el) => {
              const b = elementBox(el);
              return <rect key={el.id} x={room.x + b.minX} y={room.z + b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="#ffffff" fillOpacity={0.75} stroke="#8a8f98" strokeWidth={14} />;
            })}
            {room.design.openings.map((o) => {
              const r = openingRect(room, o);
              return o.kind === 'window' ? (
                <g key={o.id}>
                  <rect {...{ x: r.x, y: r.z, width: r.w, height: r.h }} fill="#ffffff" />
                  <rect {...(r.w > r.h ? { x: r.x, y: r.z + r.h / 2 - 12, width: r.w, height: 24 } : { x: r.x + r.w / 2 - 12, y: r.z, width: 24, height: r.h })} fill="#5aa9d6" />
                </g>
              ) : (
                <rect key={o.id} x={r.x} y={r.z} width={r.w} height={r.h} fill={FILL[room.type] ?? '#f2f0ec'} />
              );
            })}
            {/* Names fit the room's width; sizes show where there is room for them (always in the list). */}
            <text x={room.x + W / 2} y={room.z + L / 2 - 80} textAnchor="middle" fontSize={Math.min(260, (W * 1.6) / Math.max(6, room.name.length))} fontWeight={600} fill="#2b2d31">
              {room.name}
            </text>
            {W >= 2400 && (
              <text x={room.x + W / 2} y={room.z + L / 2 + 220} textAnchor="middle" fontSize={Math.min(190, W / 16)} fill="#5b6070">
                {fmt(W)} × {fmt(L)} · {area.toFixed(1)} m²
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={home.plot.length + pad * 0.7} fontSize={220} fill="#5b6070">
        {`${home.name} · ${level === 0 ? 'Ground floor' : `Level ${level}`} · plot ${fmt(home.plot.width)} × ${fmt(home.plot.length)}`}
      </text>
    </svg>
  );
}
