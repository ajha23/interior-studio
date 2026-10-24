// AI modeler: a photo (or a text description, via a generated product image) becomes a textured
// 3D model through fal.ai's image-to-3D queue. The browser polls `status` and, when the GLB is
// ready, imports it into the studio library through the normal conversion pipeline.
import { admin, caller, debit, geminiImage, handle, HttpError, json, loadImage, refund, requireEditor, type ImageIn } from '../_shared/ai.ts';

const COST_3D = 10;
const COST_TEXT_IMAGE = 2;
const ENDPOINT = Deno.env.get('FAL_3D_ENDPOINT') || 'fal-ai/trellis-2';
const TIMEOUT_MS = 25 * 60 * 1000;

function falKey(): string {
  const k = Deno.env.get('FAL_KEY');
  if (!k) throw new HttpError(503, 'not_configured', 'The AI modeler is not set up yet: add the FAL_KEY secret in Supabase.');
  return k;
}

async function fal(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Key ${falKey()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new HttpError(502, 'provider_error', `3D service error (${res.status}): ${body?.detail ?? body?.error ?? 'unknown'}`);
  return body;
}

Deno.serve(
  handle(async (req) => {
    const db = admin();
    const user = await caller(req, db);
    const body = (await req.json().catch(() => ({}))) as { action?: 'start' | 'status'; orgId?: string; projectId?: string; name?: string; category?: string; image?: ImageIn; prompt?: string; jobId?: string };

    if (body.action === 'status') {
      const { data: job } = await db.from('ai_jobs').select('*').eq('id', body.jobId ?? '').maybeSingle();
      if (!job || job.kind !== 'model') throw new HttpError(404, 'job_not_found');
      const { data: member } = await db.from('org_members').select('role').eq('org_id', job.org_id).eq('user_id', user.id).maybeSingle();
      if (!member) throw new HttpError(404, 'job_not_found');
      const sign = async () => (job.output_path ? (await db.storage.from('ai').createSignedUrl(job.output_path, 3600)).data?.signedUrl ?? null : null);
      if (job.status !== 'running') return json({ status: job.status, error: job.error, glbUrl: await sign(), name: job.input?.name, category: job.input?.category, sizeMm: job.input?.sizeMm });

      const fail = async (msg: string) => {
        await refund(db, job.org_id, job.cost_credits, job.id);
        await db.from('ai_jobs').update({ status: 'failed', error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id);
        return json({ status: 'failed', error: msg });
      };
      if (Date.now() - new Date(job.created_at).getTime() > TIMEOUT_MS) return fail('Timed out waiting for the 3D service.');
      const st = await fal(job.input.statusUrl);
      if (st.status === 'IN_QUEUE' || st.status === 'IN_PROGRESS') return json({ status: 'running', stage: st.status === 'IN_QUEUE' ? 'queued' : 'generating', position: st.queue_position ?? null });
      if (st.status !== 'COMPLETED') return fail(`3D service status: ${st.status ?? 'unknown'}`);
      const result = await fal(job.input.responseUrl);
      const glbUrl = result?.model_glb?.url ?? result?.model_mesh?.url ?? result?.glb?.url;
      if (!glbUrl) return fail('The 3D service returned no model.');
      const glb = await fetch(glbUrl);
      if (!glb.ok) return fail(`Could not download the model (${glb.status}).`);
      const bytes = new Uint8Array(await glb.arrayBuffer());
      const path = `${job.org_id}/ai3d-${job.id}.glb`;
      const up = await db.storage.from('ai').upload(path, bytes, { contentType: 'model/gltf-binary', upsert: true });
      if (up.error) return fail(up.error.message);
      await db.from('ai_jobs').update({ status: 'succeeded', output_path: path, finished_at: new Date().toISOString() }).eq('id', job.id);
      const { data: signed } = await db.storage.from('ai').createSignedUrl(path, 3600);
      return json({ status: 'succeeded', glbUrl: signed?.signedUrl ?? null, name: job.input?.name, category: job.input?.category, sizeMm: job.input?.sizeMm });
    }

    if (body.action !== 'start') throw new HttpError(400, 'bad_action');
    const orgId = String(body.orgId ?? '');
    await requireEditor(db, orgId, user.id);
    falKey(); // fail fast before charging anything
    const name = String(body.name ?? '').trim().slice(0, 120) || 'AI model';
    const category = String(body.category ?? 'decor').slice(0, 40);
    const prompt = String(body.prompt ?? '').trim().slice(0, 600);
    const sizeMm = Math.max(50, Math.min(6000, Math.round(Number((body as { sizeMm?: number }).sizeMm) || 0))) || null;
    if (!body.image && !prompt) throw new HttpError(400, 'input_required', 'Give a photo or a description.');
    const cost = COST_3D + (body.image ? 0 : COST_TEXT_IMAGE);

    const { data: job, error: jobErr } = await db
      .from('ai_jobs')
      .insert({ org_id: orgId, project_id: body.projectId ?? null, kind: 'model', op: body.image ? 'image_to_3d' : 'text_to_3d', provider: 'fal', cost_credits: cost, created_by: user.id, input: { name, category, prompt, sizeMm } })
      .select('id, input')
      .single();
    if (jobErr) throw jobErr;
    await debit(db, orgId, cost, job.id, user.id, body.image ? 'AI 3D from photo' : 'AI 3D from text');

    try {
      let srcPath: string;
      if (body.image) {
        const src = await loadImage(db, orgId, body.image);
        srcPath = `${orgId}/ai3d-${job.id}-src.${src.mime.includes('png') ? 'png' : 'jpg'}`;
        const up = await db.storage.from('ai').upload(srcPath, src.bytes, { contentType: src.mime, upsert: true });
        if (up.error) throw up.error;
      } else {
        const img = await geminiImage(
          `Studio product photograph of a single ${prompt}. The whole object is visible and centred, three-quarter front view from slightly above, on a plain seamless white background, soft even lighting, no shadows on the background, no other objects, no text.`,
          [],
          '1:1',
        );
        srcPath = `${orgId}/ai3d-${job.id}-src.png`;
        const up = await db.storage.from('ai').upload(srcPath, img.bytes, { contentType: img.mime, upsert: true });
        if (up.error) throw up.error;
      }
      const { data: signed } = await db.storage.from('ai').createSignedUrl(srcPath, 3600);
      if (!signed?.signedUrl) throw new Error('Could not share the source image with the 3D service.');
      const sub = await fal(`https://queue.fal.run/${ENDPOINT}`, { method: 'POST', body: JSON.stringify({ image_url: signed.signedUrl, texture_size: 2048, decimation_target: 150000 }) });
      if (!sub?.status_url || !sub?.response_url) throw new Error('The 3D service did not accept the job.');
      await db.from('ai_jobs').update({ input: { ...job.input, source: `ai/${srcPath}`, requestId: sub.request_id, statusUrl: sub.status_url, responseUrl: sub.response_url, endpoint: ENDPOINT } }).eq('id', job.id);
      return json({ jobId: job.id, status: 'running' });
    } catch (e) {
      await refund(db, orgId, cost, job.id);
      await db.from('ai_jobs').update({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id);
      throw e;
    }
  }),
);
