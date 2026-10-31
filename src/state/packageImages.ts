/**
 * Images for client packages are always re-encoded in the browser to a baseline JPEG (at most
 * 1600 px on the long side) before they are stored: the PDF writer embeds JPEG as is, and nothing
 * but pixels from the original file is kept.
 */
import type { WalkPose } from '@/rendering/scene/walk';
import { useEditorStore, type CameraRequest } from './editorStore';

const MAX = 1600;

export interface Jpeg {
  data: Uint8Array;
  w: number;
  h: number;
}

async function canvasJpeg(source: CanvasImageSource, sw: number, sh: number): Promise<Jpeg> {
  const k = Math.min(1, MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('The image could not be encoded.');
  return { data: new Uint8Array(await blob.arrayBuffer()), w, h };
}

/** An uploaded image file as JPEG; rejects anything the browser cannot decode as an image. */
export async function fileToJpeg(file: File): Promise<Jpeg> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name} could not be read as an image.`);
  });
  try {
    return await canvasJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Waits n animation frames, but never longer than ~50 ms a frame (a hidden tab gets no frames). */
const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, n * 50);
    const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : (clearTimeout(timer), resolve()));
    step(n);
  });

/** The 3D view only draws while the page is visible: a capture from a hidden tab would be a stale picture. */
export class HiddenPageError extends Error {
  constructor() {
    super('Keep this window visible while 3D views are captured (the 3D view does not draw in a hidden tab).');
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Where the camera goes before a capture: an orbit framing or a standing pose; none = as it is. */
export type CaptureCamera = { orbit: CameraRequest } | { walk: WalkPose } | null;

/**
 * The 3D view, optionally framed first. The canvas only renders while the 3D view is shown (and a
 * resize clears it), so the 3D view is shown, the camera moved and allowed to settle, the frame
 * captured, and the previous view, navigation mode and selection restored. The selection is cleared
 * meanwhile so no highlight appears in the picture.
 */
export async function captureViewport(camera: CaptureCamera = null): Promise<Jpeg | null> {
  if (document.hidden) throw new HiddenPageError();
  const editor = useEditorStore.getState();
  const { view, navMode, selectedId } = editor;
  if (selectedId) editor.select(null);
  if (view !== '3d') editor.setView('3d');
  try {
    await frames(4);
    if (camera && 'orbit' in camera) {
      if (useEditorStore.getState().navMode !== 'orbit') useEditorStore.getState().setNavMode('orbit');
      await frames(2);
      useEditorStore.getState().requestCamera(camera.orbit);
      await wait(800);
    } else if (camera && 'walk' in camera) {
      useEditorStore.getState().requestWalk({ kind: 'pose', pose: camera.walk });
      await wait(1200);
    }
    await frames(3);
    if (document.hidden) throw new HiddenPageError();
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="viewport-3d"] canvas');
    if (!gl || !gl.width || !gl.height) return null;
    return await canvasJpeg(gl, gl.width, gl.height);
  } finally {
    const s = useEditorStore.getState();
    if (s.navMode !== navMode) s.setNavMode(navMode);
    if (selectedId) useEditorStore.getState().select(selectedId);
    useEditorStore.getState().setView(view);
  }
}
