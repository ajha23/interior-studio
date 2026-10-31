/**
 * The open home (apartment or villa). A room is edited in the normal editor: its design is opened
 * as a project, and every edit there is copied back into the home, so going back to the plan never
 * loses work; Save stores the whole home. Home-level changes (room size, name, type, style for every
 * room) go through the same domain commands as everything else.
 */
import { create } from 'zustand';
import { executeCommand, newId, roomDesign, roomProjectId, type Home, type HomeRoom, type KitchenProject, type RoomType } from '@/domain';
import { generateHome, restyleHome, type HomeBrief, type HomeStyleId } from '@/engine/home/generate';
import { loadHome, saveHome } from '@/persistence/projectDb';
import { useEditorStore } from './editorStore';

interface HomeStore {
  home: Home | null;
  /** The room open in the editor, if any. */
  roomId: string | null;
  dirty: boolean;
  /** Notes from generation (pieces that did not fit). */
  notes: string[];
  selectedRoomId: string | null;
  level: number;
  open: (id: string) => Promise<string | null>;
  create: (brief: HomeBrief) => Promise<Home>;
  enterRoom: (roomId: string) => boolean;
  leaveRoom: () => void;
  save: () => Promise<boolean>;
  selectRoom: (roomId: string | null) => void;
  setLevel: (level: number) => void;
  /** Resizes, renames or retypes a room; returns the domain's errors. */
  updateRoom: (roomId: string, patch: { width?: number; length?: number; name?: string; type?: RoomType }) => string[];
  restyle: (style: HomeStyleId) => void;
  rename: (name: string) => void;
  close: () => void;
}

const replaceRoom = (home: Home, room: HomeRoom): Home => ({ ...home, rooms: home.rooms.map((r) => (r.id === room.id ? room : r)) });

export const useHomeStore = create<HomeStore>()((set, get) => ({
  home: null,
  roomId: null,
  dirty: false,
  notes: [],
  selectedRoomId: null,
  level: 0,
  open: async (id) => {
    if (get().home?.id === id) return null;
    const loaded = await loadHome(id);
    if (!loaded) return 'This home does not exist on this device.';
    if (!loaded.ok) return `This home could not be opened: ${loaded.errors.join(' ')}`;
    set({ home: loaded.home, roomId: null, dirty: false, notes: [], selectedRoomId: null, level: 0 });
    return null;
  },
  create: async (brief) => {
    const { home, notes } = generateHome(brief, newId);
    await saveHome(home);
    set({ home, roomId: null, dirty: false, notes, selectedRoomId: null, level: 0 });
    return home;
  },
  enterRoom: (roomId) => {
    const home = get().home;
    const room = home?.rooms.find((r) => r.id === roomId);
    if (!home || !room) return false;
    const editor = useEditorStore.getState();
    if (editor.project?.id !== roomProjectId(home, room)) {
      editor.openProject(roomDesign(home, room));
      // Unsaved home changes stay visible as unsaved in the room too.
      if (get().dirty) useEditorStore.setState({ savedProject: null });
    }
    set({ roomId, selectedRoomId: roomId, level: room.level });
    return true;
  },
  leaveRoom: () => set({ roomId: null }),
  save: async () => {
    const home = get().home;
    if (!home) return false;
    await saveHome(home);
    set({ dirty: false });
    const editor = useEditorStore.getState();
    if (editor.project && get().roomId) editor.markSaved(editor.project);
    return true;
  },
  selectRoom: (selectedRoomId) => set({ selectedRoomId }),
  setLevel: (level) => set({ level }),
  updateRoom: (roomId, patch) => {
    const home = get().home;
    const room = home?.rooms.find((r) => r.id === roomId);
    if (!home || !room) return ['No such room.'];
    let design = room.design;
    if (patch.width !== undefined || patch.length !== undefined) {
      const { project, result } = executeCommand(design, { type: 'set_room', room: { ...design.room, ...(patch.width !== undefined ? { width: patch.width } : {}), ...(patch.length !== undefined ? { length: patch.length } : {}) } });
      if (!result.success) return result.errors;
      design = project;
    }
    const next: HomeRoom = { ...room, design, ...(patch.name?.trim() ? { name: patch.name.trim().slice(0, 60) } : {}), ...(patch.type ? { type: patch.type } : {}) };
    set({ home: replaceRoom(home, next), dirty: true });
    return [];
  },
  restyle: (style) => {
    const home = get().home;
    if (!home) return;
    set({ home: restyleHome(home, style), dirty: true });
  },
  rename: (name) => {
    const home = get().home;
    if (home && name.trim()) set({ home: { ...home, name: name.trim().slice(0, 120) }, dirty: true });
  },
  close: () => set({ home: null, roomId: null, dirty: false, notes: [], selectedRoomId: null }),
}));

/** Copies an edited room design back into the home (keeping the room's own id and name). */
function syncRoom(project: KitchenProject): void {
  const { home, roomId } = useHomeStore.getState();
  const room = home?.rooms.find((r) => r.id === roomId);
  if (!home || !room || project.id !== roomProjectId(home, room)) return;
  const prefix = `${home.name} · `;
  const name = project.name.startsWith(prefix) ? project.name.slice(prefix.length) : project.name;
  const design = { ...project, id: room.design.id, name: room.design.name };
  if (design === room.design) return;
  useHomeStore.setState({ home: replaceRoom(home, { ...room, design, name: name.trim() || room.name }), dirty: true });
}

useEditorStore.subscribe((s, prev) => {
  if (s.project && s.project !== prev.project && s.revision !== prev.revision) syncRoom(s.project);
});
