// Shared helpers for the AI studio edge functions: auth, studio permissions, credits, storage,
// and the Gemini image call. Provider keys live in Supabase function secrets, never in the app.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** The signed-in caller, from the request's access token. */
export async function caller(req: Request, db: SupabaseClient): Promise<{ id: string }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthenticated');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'unauthenticated');
  return { id: data.user.id };
}

/** Designers, admins and owners may run AI jobs; viewers may not. */
export async function requireEditor(db: SupabaseClient, orgId: string, userId: string) {
  const { data } = await db.from('org_members').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  if (!data || !['owner', 'admin', 'designer'].includes(data.role)) throw new HttpError(403, 'forbidden', 'Designer access is needed for AI tools.');
}

export async function debit(db: SupabaseClient, orgId: string, cost: number, jobId: string, userId: string, note: string) {
  const { error } = await db.rpc('ai_debit', { p_org: orgId, p_cost: cost, p_job: jobId, p_user: userId, p_note: note });
  if (error) {
    const m = /insufficient_credits:(-?\d+)/.exec(error.message);
    if (m) throw new HttpError(402, 'insufficient_credits', `Not enough AI credits (${m[1]} left, ${cost} needed). An admin can top up on the Team page.`);
    throw error;
  }
}

export async function refund(db: SupabaseClient, orgId: string, cost: number, jobId: string) {
  if (cost > 0) await db.from('ai_credit_ledger').insert({ org_id: orgId, delta: cost, reason: 'refund', job_id: jobId, note: 'Job failed' });
}

export interface ImageIn {
  /** A saved render of the project. */
  renderId?: string;
  /** A file already uploaded to the studio's `ai` bucket. */
  aiPath?: string;
}

/** Load an input image the caller's studio owns. */
export async function loadImage(db: SupabaseClient, orgId: string, img: ImageIn): Promise<{ bytes: Uint8Array; mime: string; path: string; bucket: string }> {
  let bucket: string;
  let path: string;
  if (img.renderId) {
    const { data } = await db.from('renders').select('storage_path, org_id').eq('id', img.renderId).maybeSingle();
    if (!data || data.org_id !== orgId) throw new HttpError(404, 'image_not_found');
    bucket = 'renders';
    path = data.storage_path;
  } else if (img.aiPath) {
    if (!img.aiPath.startsWith(`${orgId}/`) || img.aiPath.includes('..')) throw new HttpError(403, 'forbidden');
    bucket = 'ai';
    path = img.aiPath;
  } else throw new HttpError(400, 'image_required');
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new HttpError(404, 'image_not_found');
  if (data.size > 20 * 1024 * 1024) throw new HttpError(413, 'image_too_large', 'Images up to 20 MB.');
  return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || (path.endsWith('.png') ? 'image/png' : 'image/jpeg'), path, bucket };
}

function b64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

/** One Gemini image call: prompt plus reference images in, one image out. */
export async function geminiImage(prompt: string, images: { bytes: Uint8Array; mime: string }[], aspectRatio?: string): Promise<{ bytes: Uint8Array; mime: string; model: string }> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new HttpError(503, 'not_configured', 'AI images are not set up yet: add the GEMINI_API_KEY secret in Supabase.');
  const model = Deno.env.get('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-image';
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: b64(i.bytes) } }))] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'provider_error', `Image model error (${res.status}): ${out?.error?.message ?? 'unknown'}`);
  const parts = out?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: { inlineData?: unknown; inline_data?: unknown }) => p.inlineData || p.inline_data);
  const data = img?.inlineData ?? img?.inline_data;
  if (!data?.data) {
    const reason = out?.candidates?.[0]?.finishReason ?? out?.promptFeedback?.blockReason ?? 'no image returned';
    throw new HttpError(422, 'no_image', `The model returned no image (${reason}). Try rephrasing.`);
  }
  const bin = atob(data.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: data.mimeType ?? data.mime_type ?? 'image/png', model };
}

/** Image size from PNG/JPEG headers (for the render row). */
export function imageSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xc3) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      i += 2 + len;
    }
  }
  return { width: 1024, height: 1024 };
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'internal', message: (e as Error).message }, 500);
    }
  };
}
