import { create } from 'zustand';
import {
  type VideoRenderJob,
  type RoomBoundary,
  createVideoRenderJob,
} from '@/domain/platform/walkthroughVideo';

interface WalkthroughState {
  currentJob: VideoRenderJob | null;
  history: VideoRenderJob[];
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  startJob: (projectId: string, room: RoomBoundary, options?: { durationSec?: number; resolution?: '1080p' | '720p' }) => void;
  updateJobProgress: (progressPct: number) => void;
  completeJob: (downloadUrl: string) => void;
  resetJob: () => void;
}

export const useWalkthroughStore = create<WalkthroughState>((set) => ({
  currentJob: null,
  history: [],
  isModalOpen: false,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),

  startJob: (projectId, room, options) => {
    const job = createVideoRenderJob(projectId, room, options);
    set({ currentJob: job });
  },

  updateJobProgress: (progressPct) => {
    set((state) => {
      if (!state.currentJob) return state;
      const progress = Math.min(100, Math.max(0, progressPct));
      const status = progress >= 100 ? 'ready' : progress > 0 ? 'rendering' : 'queued';
      return {
        currentJob: {
          ...state.currentJob,
          progressPct: progress,
          status,
        },
      };
    });
  },

  completeJob: (downloadUrl) => {
    set((state) => {
      if (!state.currentJob) return state;
      const completed: VideoRenderJob = {
        ...state.currentJob,
        status: 'ready',
        progressPct: 100,
        downloadUrl,
        completedAtIso: new Date().toISOString(),
      };
      return {
        currentJob: completed,
        history: [completed, ...state.history],
      };
    });
  },

  resetJob: () => set({ currentJob: null }),
}));

