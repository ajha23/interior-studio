/**
 * A whole home: its floor plan or 3D dollhouse per level, the rooms with their sizes and areas, and
 * home-wide changes (style for every room, room size, name and use). Opening a room hands it to the
 * full room editor; its edits come back here.
 */
import { useState } from 'react';
import { Box, ChevronLeft, DoorOpen, Layers, List, Map as MapIcon, PanelRight, Save } from 'lucide-react';
import { AssistantLauncher } from '@/features/assistant/AssistantLauncher';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { carpetArea, ROOM_LIMITS, ROOM_TYPE_LABELS, RoomTypeSchema, roomArea, type RoomType } from '@/domain';
import { HOME_STYLES, type HomeStyleId } from '@/engine/home/generate';
import { formatLength, parseLength, type LengthUnit } from '@/engine/measurement/units';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { HomePlan } from './HomePlan';
import { HomeScene } from './HomeScene';

export function HomeView() {
  const home = useHomeStore((s) => s.home)!;
  const level = useHomeStore((s) => s.level);
  const selectedId = useHomeStore((s) => s.selectedRoomId);
  const dirty = useHomeStore((s) => s.dirty);
  const notes = useHomeStore((s) => s.notes);
  const quality = useEditorStore((s) => s.renderQuality);
  const { selectRoom, setLevel, save, restyle, rename } = useHomeStore.getState();
  const [view, setView] = useState<'plan' | '3d'>('plan');
  const [unit, setUnit] = useState<LengthUnit>('ft-in');
  const [saving, setSaving] = useState(false);
  // Below 1280 px the room list and the room details are drawers; selecting a room opens its details.
  const [listOpen, setListOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const select = (id: string | null) => {
    selectRoom(id);
    if (id && window.innerWidth < 1280) setDetailsOpen(true);
  };
  const area = carpetArea(home);
  const selected = home.rooms.find((r) => r.id === selectedId) ?? null;
  const open = (roomId: string) => navigate({ name: 'room', homeId: home.id, roomId });
  const styleId = (Object.entries(HOME_STYLES).find(([, v]) => v.label === home.style)?.[0] ?? '') as HomeStyleId | '';

  const leave = () => {
    if (dirty && !window.confirm('You have unsaved changes to this home. Leave without saving?')) return;
    useHomeStore.getState().close();
    navigate({ name: 'home' });
  };

  return (
    <div className="flex h-full flex-col" data-testid="home-view">
      <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-2">
        <Button variant="ghost" size="sm" onClick={leave} aria-label="All projects">
          <ChevronLeft /> Projects
        </Button>
        <Input aria-label="Home name" defaultValue={home.name} key={home.name} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="h-8 w-56 font-medium" />
        <span className="text-xs whitespace-nowrap text-muted-foreground" data-testid="home-summary">
          {home.bhk}BHK {home.kind} · {home.rooms.length} rooms · {Math.round(area.sqft).toLocaleString()} sq ft carpet ({area.m2.toFixed(0)} m²)
        </span>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <Select aria-label="Style for every room" value={styleId} onChange={(e) => restyle(e.target.value as HomeStyleId)} className="h-8 w-40 text-xs" title="Apply a style to every room: floors, walls, wood, kitchen and soft furnishings">
            {!styleId && <option value="">Custom style</option>}
            {Object.entries(HOME_STYLES).map(([id, s]) => (
              <option key={id} value={id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Units" value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)} className="h-8 w-24 text-xs">
            <option value="ft-in">ft-in</option>
            <option value="m">m</option>
            <option value="mm">mm</option>
          </Select>
          <Button size="sm" disabled={saving} onClick={async () => (setSaving(true), await save(), setSaving(false))}>
            <Save /> Save
          </Button>
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className={cn('min-h-0 overflow-y-auto border-r bg-card p-2 max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-30 max-xl:w-[260px] max-xl:shadow-xl', !listOpen && 'max-xl:hidden')} aria-label="Rooms">
          {Array.from({ length: home.levels }, (_, l) => (
            <div key={l} className="mb-3">
              <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{l === 0 ? 'Ground floor' : `Level ${l}`}</p>
              {home.rooms
                .filter((r) => r.level === l)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => (setLevel(l), select(r.id), setListOpen(false))}
                    onDoubleClick={() => open(r.id)}
                    className={cn('flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted', r.id === selectedId && 'bg-muted font-medium')}
                    data-testid="room-list-item"
                  >
                    <span>{r.name}</span>
                    <span className="text-[11px] text-muted-foreground">{roomArea(r).toFixed(1)} m²</span>
                  </button>
                ))}
            </div>
          ))}
        </aside>

        <main className="relative min-h-0 bg-viewport">
          <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1 rounded-lg border bg-card/95 p-1 shadow-sm">
            <Button size="xs" variant={listOpen ? 'selected' : 'ghost'} aria-pressed={listOpen} onClick={() => setListOpen((v) => !v)} className="xl:hidden">
              <List /> Rooms
            </Button>
            <Button size="xs" variant={detailsOpen ? 'selected' : 'ghost'} aria-pressed={detailsOpen} onClick={() => setDetailsOpen((v) => !v)} className="xl:hidden">
              <PanelRight /> Room details
            </Button>
            <Button size="xs" variant={view === 'plan' ? 'selected' : 'ghost'} aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
              <MapIcon /> Plan
            </Button>
            <Button size="xs" variant={view === '3d' ? 'selected' : 'ghost'} aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              <Box /> 3D
            </Button>
            {home.levels > 1 &&
              Array.from({ length: home.levels }, (_, l) => (
                <Button key={l} size="xs" variant={level === l ? 'selected' : 'ghost'} aria-pressed={level === l} onClick={() => setLevel(l)}>
                  <Layers /> {l === 0 ? 'Ground' : `Level ${l}`}
                </Button>
              ))}
          </div>
          {view === 'plan' ? (
            <div className="absolute inset-0 p-4 pt-14">
              <HomePlan home={home} level={level} selectedRoomId={selectedId} unit={unit} onSelect={select} onOpen={open} />
            </div>
          ) : (
            <div className="absolute inset-0">
              <HomeScene home={home} level={level} selectedRoomId={selectedId} textured={quality === 'high'} onSelect={select} onOpen={open} />
            </div>
          )}
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">Click a room to see its size · double-click (or Design this room) to furnish and finish it in detail</p>
        </main>

        <aside className={cn('min-h-0 overflow-y-auto border-l bg-card p-3 max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-[300px] max-xl:shadow-xl', !detailsOpen && 'max-xl:hidden')} aria-label="Room">
          <div className="mb-2 flex justify-end xl:hidden">
            <Button size="xs" variant="ghost" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </div>
          {selected ? <RoomInspector key={selected.id + selected.design.room.width + selected.design.room.length} roomId={selected.id} unit={unit} onOpen={() => open(selected.id)} /> : <p className="text-sm text-muted-foreground">Select a room on the plan or in the list to change its size, name or use, or to design it.</p>}
          {notes.length > 0 && (
            <details className="mt-4 text-xs text-muted-foreground">
              <summary>{notes.length} item{notes.length === 1 ? '' : 's'} did not fit</summary>
              <ul className="mt-1 list-disc pl-4">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
      <AssistantLauncher />
    </div>
  );
}

function RoomInspector({ roomId, unit, onOpen }: { roomId: string; unit: LengthUnit; onOpen: () => void }) {
  const room = useHomeStore((s) => s.home!.rooms.find((r) => r.id === roomId)!);
  const [errors, setErrors] = useState<string[]>([]);
  const { width, length } = room.design.room;
  const fmt = (mm: number) => formatLength(mm, unit);
  const apply = (patch: Parameters<ReturnType<typeof useHomeStore.getState>['updateRoom']>[1]) => setErrors(useHomeStore.getState().updateRoom(roomId, patch));
  const sizeInput = (label: string, value: number, key: 'width' | 'length') => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        aria-label={`Room ${key}`}
        defaultValue={fmt(value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => {
          const parsed = parseLength(e.target.value, unit === 'ft-in' ? 'ft-in' : unit);
          if (!parsed.ok) return setErrors([parsed.error]);
          if (parsed.mm !== value) apply({ [key]: parsed.mm });
        }}
        className="h-8"
      />
      <span className="text-[10px] text-muted-foreground">
        {fmt(ROOM_LIMITS[key].min)}–{fmt(ROOM_LIMITS[key].max)}
      </span>
    </label>
  );
  const counts = room.design.furniture.length + room.design.cabinets.length + room.design.appliances.length;
  return (
    <div className="flex flex-col gap-3" data-testid="room-inspector">
      <Input aria-label="Room name" defaultValue={room.name} onBlur={(e) => e.target.value.trim() && e.target.value !== room.name && apply({ name: e.target.value })} className="h-8 font-medium" />
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Use</span>
        <Select aria-label="Room use" value={room.type} onChange={(e) => apply({ type: e.target.value as RoomType })} className="h-8 text-sm">
          {RoomTypeSchema.options.map((t) => (
            <option key={t} value={t}>
              {ROOM_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {sizeInput('Width', width, 'width')}
        {sizeInput('Length', length, 'length')}
      </div>
      <p className="text-xs text-muted-foreground">
        {((width * length) / 1e6).toFixed(1)} m² · {Math.round((width * length) / 1e6 * 10.7639)} sq ft · ceiling {fmt(room.design.room.height)} · {counts} items · {room.design.openings.length} doors and windows
      </p>
      {errors.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          {errors.join(' ')}
        </p>
      )}
      <Button onClick={onOpen} data-testid="open-room">
        <DoorOpen /> Design this room
      </Button>
      <p className="text-[11px] text-muted-foreground">Opens the full room editor: layout, every unit and piece of furniture, finishes, walk-through, drawings and the assistant. Changes come back to this home.</p>
    </div>
  );
}
