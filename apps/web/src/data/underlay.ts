import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const BUCKET = 'plans';
const MAX_PX = 4096;

/** Rasterise the first page of a PDF to a PNG, sized for tracing. */
async function pdfToPng(file: File): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_PX / base.width, MAX_PX / base.height, 4);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Could not read this PDF page.');
    return blob;
  } finally {
    void task.destroy();
  }
}

/** Downscale very large scans so the plan stays responsive. */
async function normaliseImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  if (bmp.width <= MAX_PX && bmp.height <= MAX_PX) {
    bmp.close();
    return file;
  }
  const k = MAX_PX / Math.max(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9))) ?? file;
}

async function sizeOf(blob: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const out = { w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
}

/**
 * Upload a floor plan (PDF, PNG, JPEG or WebP) to trace over. PDFs use their first page.
 * DWG isn't readable in the browser: export it to PDF from AutoCAD first.
 */
export async function uploadPlanImage(orgId: string, file: File): Promise<{ path: string; pxWidth: number; pxHeight: number }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.dwg') || name.endsWith('.dxf')) throw new Error('DWG/DXF can’t be read in the browser yet. In AutoCAD, plot the plan to PDF and upload that.');
  if (file.size > 60 * 1024 * 1024) throw new Error('Files up to 60 MB.');
  let blob: Blob;
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) blob = await pdfToPng(file);
  else if (/^image\/(png|jpeg|webp)$/.test(file.type)) blob = await normaliseImage(file);
  else throw new Error('Use a PDF, PNG, JPEG or WebP file.');
  const { w, h } = await sizeOf(blob);
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/png', upsert: false });
  if (error) throw error;
  return { path, pxWidth: w, pxHeight: h };
}

export function useUnderlayUrl(path: string | undefined) {
  return useQuery({
    queryKey: ['underlay-url', path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
