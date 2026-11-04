import { create } from 'zustand';
import type { SitePhoto, WallMeasurement, ClosureResult } from '@/domain/measurement/siteCapture';
import { evaluateRoomClosure } from '@/engine/measurement/closureSolver';

interface SiteCaptureState {
  isModalOpen: boolean;
  activeWall: 'back' | 'left' | 'right' | 'front';
  photos: SitePhoto[];
  measurements: WallMeasurement[];
  closure: ClosureResult;

  openModal: () => void;
  closeModal: () => void;
  setActiveWall: (wall: 'back' | 'left' | 'right' | 'front') => void;
  setMeasurement: (wall: 'back' | 'left' | 'right' | 'front', lengthMm: number, heightMm: number, notes?: string) => void;
  addPhoto: (photo: Omit<SitePhoto, 'id' | 'capturedAtIso'>) => void;
  deletePhoto: (photoId: string) => void;
  initializeFromRoom: (room: { width: number; length: number; height: number }, projectId: string) => void;
}

const DEFAULT_MEASUREMENTS: WallMeasurement[] = [
  { wallId: 'back', lengthMm: 4000, heightMm: 2800 },
  { wallId: 'front', lengthMm: 4000, heightMm: 2800 },
  { wallId: 'left', lengthMm: 3000, heightMm: 2800 },
  { wallId: 'right', lengthMm: 3000, heightMm: 2800 },
];

export const useSiteCaptureStore = create<SiteCaptureState>((set, get) => ({
  isModalOpen: false,
  activeWall: 'back',
  photos: [],
  measurements: DEFAULT_MEASUREMENTS,
  closure: evaluateRoomClosure(DEFAULT_MEASUREMENTS),

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),

  setActiveWall: (activeWall) => set({ activeWall }),

  setMeasurement: (wallId, lengthMm, heightMm, notes) => {
    const current = get().measurements;
    const updated = current.map((m) =>
      m.wallId === wallId ? { ...m, lengthMm, heightMm, notes } : m
    );
    set({
      measurements: updated,
      closure: evaluateRoomClosure(updated),
    });
  },

  addPhoto: (photoData) => {
    const newPhoto: SitePhoto = {
      ...photoData,
      id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      capturedAtIso: new Date().toISOString(),
    };
    set((state) => ({
      photos: [newPhoto, ...state.photos],
    }));
  },

  deletePhoto: (photoId) => {
    set((state) => ({
      photos: state.photos.filter((p) => p.id !== photoId),
    }));
  },

  initializeFromRoom: (room, _projectId) => {
    const init: WallMeasurement[] = [
      { wallId: 'back', lengthMm: room.width, heightMm: room.height },
      { wallId: 'front', lengthMm: room.width, heightMm: room.height },
      { wallId: 'left', lengthMm: room.length, heightMm: room.height },
      { wallId: 'right', lengthMm: room.length, heightMm: room.height },
    ];
    set({
      measurements: init,
      closure: evaluateRoomClosure(init),
    });
  },
}));

