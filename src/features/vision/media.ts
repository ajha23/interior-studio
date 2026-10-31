/**
 * Reference media in the browser: photos are downscaled to JPEG, videos are sampled into a handful
 * of evenly spaced frames. Everything stays small enough to send in one request (and nothing is
 * uploaded or stored anywhere else).
 */
const MAX_EDGE = 1280;
export const MAX_IMAGES = 6;
export const MAX_VIDEO_FRAMES = 6;

export interface Prepared {
  /** Base64 JPEG (no data: prefix), for the server. */
  data: string;
  /** Small data URL, for thumbnails in the chat. */
  thumb: string;
}

function toJpeg(source: CanvasImageSource, width: number, height: number, edge = MAX_EDGE, quality = 0.82): string {
  const scale = Math.min(1, edge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

const strip = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function preparePhoto(file: File): Promise<Prepared> {
  const bitmap = await createImageBitmap(file);
  try {
    return { data: strip(toJpeg(bitmap, bitmap.width, bitmap.height)), thumb: toJpeg(bitmap, bitmap.width, bitmap.height, 160, 0.7) };
  } finally {
    bitmap.close();
  }
}

/** Evenly spaced frames from a video (skipping the very start and end). */
export async function prepareVideo(file: File, frames = MAX_VIDEO_FRAMES): Promise<Prepared[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('This video format cannot be read by the browser. Try an MP4 or WebM.'));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const out: Prepared[] = [];
    for (let i = 0; i < frames; i++) {
      const t = duration ? (duration * (i + 0.5)) / frames : 0;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
        if (!duration) resolve();
      });
      out.push({ data: strip(toJpeg(video, video.videoWidth, video.videoHeight)), thumb: toJpeg(video, video.videoWidth, video.videoHeight, 160, 0.7) });
      if (!duration) break;
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The 3D view as a JPEG, and the supported aspect ratio closest to it. */
export function captureViewport(canvas: HTMLCanvasElement): { data: string; aspectRatio: '16:9' | '4:3' | '3:2' | '1:1' | '3:4' | '9:16' } {
  const ratios = { '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 3 / 2, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16 } as const;
  const r = canvas.width / canvas.height;
  const aspectRatio = (Object.entries(ratios).sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0]![0]) as keyof typeof ratios;
  return { data: strip(toJpeg(canvas, canvas.width, canvas.height, 1600, 0.9)), aspectRatio };
}
