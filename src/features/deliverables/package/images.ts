/**
 * Images for client packages are always re-encoded in the browser to a baseline JPEG (at most
 * 1600 px on the long side) before they are stored: the PDF writer embeds JPEG as is, and nothing
 * but pixels from the original file is kept.
 */
import { useEditorStore } from '@/state/editorStore';

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

const frames = (n: number) => new Promise<void>((resolve) => {
  const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
  step(n);
});

/**
 * The 3D view with its current camera. The canvas only renders while the 3D view is shown (and a
 * resize clears it), so the 3D view is shown for a few frames, captured, and the previous view restored.
 */
export async function captureViewport(): Promise<Jpeg | null> {
  const editor = useEditorStore.getState();
  const previous = editor.view;
  if (previous !== '3d') editor.setView('3d');
  try {
    await frames(6);
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="viewport-3d"] canvas');
    if (!gl || !gl.width || !gl.height) return null;
    return await canvasJpeg(gl, gl.width, gl.height);
  } finally {
    if (previous !== '3d') useEditorStore.getState().setView(previous);
  }
}
