/**
 * Photo/video references for the assistant, and AI photoreal renders of the 3D view.
 * References are read on the server (`/api/reference`) and become an ordinary proposal through
 * `Conversation.send`, so they are previewed and approved like anything typed. Renders capture the
 * 3D canvas and ask `/api/render` for a photograph-like image; they are illustrations, not drawings.
 */
import { create } from 'zustand';
import type { ChatMessage } from '@/ai/conversation';
import { ReferenceAnalysisSchema, referenceToResponse, VISION_MODEL } from '@/ai/vision';
import { captureViewport, MAX_IMAGES, preparePhoto, prepareVideo, type Prepared } from '@/features/vision/media';
import { assistantConversation } from './assistantStore';
import { useEditorStore } from './editorStore';

export interface Attachments {
  kind: 'photo' | 'video';
  items: Prepared[];
}

export interface RenderState {
  open: boolean;
  status: 'idle' | 'rendering' | 'done' | 'error';
  url: string | null;
  error: string | null;
  lighting: 'daylight' | 'evening';
  style: string;
  /** The design revision the render shows. */
  revision: number | null;
}

interface VisionStore {
  attachments: Attachments | null;
  preparing: boolean;
  attachError: string | null;
  addFiles: (files: File[]) => Promise<void>;
  clearAttachments: () => void;
  /** Sends the attached reference with the designer's note; returns the assistant's reply. */
  sendReference: (note: string) => Promise<ChatMessage | null>;
  render: RenderState;
  openRender: (start?: boolean) => void;
  closeRender: () => void;
  setRenderOptions: (patch: Partial<Pick<RenderState, 'lighting' | 'style'>>) => void;
  startRender: () => Promise<void>;
}

const errorOf = async (res: Response, fallback: string) => ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? `${fallback} (HTTP ${res.status}).`;

export const useVisionStore = create<VisionStore>()((set, get) => ({
  attachments: null,
  preparing: false,
  attachError: null,
  addFiles: async (files) => {
    const video = files.find((f) => f.type.startsWith('video/'));
    const photos = files.filter((f) => f.type.startsWith('image/'));
    if (!video && !photos.length) return set({ attachError: 'Attach photos (JPEG, PNG, WebP…) or one video.' });
    set({ preparing: true, attachError: null });
    try {
      if (video) set({ attachments: { kind: 'video', items: await prepareVideo(video) } });
      else {
        const current = get().attachments?.kind === 'photo' ? get().attachments!.items : [];
        const added = await Promise.all(photos.slice(0, MAX_IMAGES - current.length).map(preparePhoto));
        set({ attachments: { kind: 'photo', items: [...current, ...added].slice(0, MAX_IMAGES) } });
      }
    } catch (e) {
      set({ attachError: e instanceof Error ? e.message : 'That file could not be read.' });
    } finally {
      set({ preparing: false });
    }
  },
  clearAttachments: () => set({ attachments: null, attachError: null }),
  sendReference: async (note) => {
    const a = get().attachments;
    const conversation = assistantConversation();
    const project = useEditorStore.getState().project;
    if (!a || !project || conversation.state.busy) return null;
    const text = note.trim() || (a.kind === 'video' ? 'Make my design look like this video' : 'Make my design look like this');
    set({ attachments: null });
    const thumbs = a.items.map((i) => i.thumb);
    let value;
    try {
      const res = await fetch('/api/reference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ images: a.items.map((i) => i.data), kind: a.kind, note: note.trim() || undefined }) });
      if (!res.ok) throw new Error(await errorOf(res, 'The reference could not be read'));
      const body = (await res.json()) as { analysis?: unknown };
      const analysis = ReferenceAnalysisSchema.parse(body.analysis);
      value = referenceToResponse(analysis, text, project);
    } catch (e) {
      value = { kind: 'answer' as const, text: e instanceof Error ? e.message : 'The reference could not be read.' };
    }
    return conversation.send(text, { attachments: thumbs, response: { value, servedBy: { provider: 'gemini', model: VISION_MODEL } } });
  },
  render: { open: false, status: 'idle', url: null, error: null, lighting: 'daylight', style: '', revision: null },
  openRender: (start = false) => {
    set((s) => ({ render: { ...s.render, open: true } }));
    if (start && get().render.status !== 'rendering') void get().startRender();
  },
  closeRender: () => set((s) => ({ render: { ...s.render, open: false } })),
  setRenderOptions: (patch) => set((s) => ({ render: { ...s.render, ...patch } })),
  startRender: async () => {
    const editor = useEditorStore.getState();
    if (editor.view !== '3d' && editor.view !== 'split') editor.setView('3d');
    // Let the 3D view draw a frame first if it was hidden.
    await new Promise((r) => setTimeout(r, 250));
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewport-3d"] canvas');
    if (!canvas) return set((s) => ({ render: { ...s.render, status: 'error', error: 'Open the 3D view to render it.' } }));
    const { data, aspectRatio } = captureViewport(canvas);
    const old = get().render.url;
    set((s) => ({ render: { ...s.render, status: 'rendering', error: null, revision: useEditorStore.getState().revision } }));
    try {
      const { lighting, style } = get().render;
      const res = await fetch('/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: data, mimeType: 'image/jpeg', aspectRatio, lighting, ...(style.trim() ? { style: style.trim() } : {}) }) });
      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) throw new Error(await errorOf(res, 'The render failed'));
      const url = URL.createObjectURL(await res.blob());
      if (old) URL.revokeObjectURL(old);
      set((s) => ({ render: { ...s.render, status: 'done', url } }));
    } catch (e) {
      set((s) => ({ render: { ...s.render, status: 'error', error: e instanceof Error ? e.message : 'The render failed.' } }));
    }
  },
}));
