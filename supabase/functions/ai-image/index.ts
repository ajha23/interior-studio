// AI image studio: restyle, style transfer, room clearing, sketch-to-render, render enhancement
// and targeted edits. Each successful job lands in the project's render gallery.
import { admin, caller, debit, geminiImage, handle, HttpError, imageSize, json, loadImage, refund, requireEditor, type ImageIn } from '../_shared/ai.ts';

const COST = 2;
type Op = 'enhance' | 'restyle' | 'style_transfer' | 'clear_room' | 'sketch_to_render' | 'edit';
const OPS: Op[] = ['enhance', 'restyle', 'style_transfer', 'clear_room', 'sketch_to_render', 'edit'];

const KEEP = 'Keep the room architecture exactly: walls, windows, doors, ceiling height, floor plan and camera viewpoint must not change.';

function promptFor(op: Op, style: string, extra: string): string {
  const more = extra ? ` Additional direction: ${extra}` : '';
  switch (op) {
    case 'enhance':
      return `Turn this 3D interior render into a professional interior photograph: realistic materials and textures, soft natural global illumination, accurate contact shadows and reflections, subtle depth of field. Do not change the layout, furniture, colours, finishes or camera.${more}`;
    case 'restyle':
      return `Redesign this interior in a ${style || 'modern'} style. ${KEEP} Change the furniture styling, finishes, materials, colours, lighting fixtures and decor to suit the style. Photorealistic interior photograph.${more}`;
    case 'style_transfer':
      return `Apply the interior style, colour palette, materials and mood of the second image to the room in the first image. ${KEEP} Keep the main furniture positions. Photorealistic interior photograph.${more}`;
    case 'clear_room':
      return `Remove all furniture, rugs, curtains, decor, people and clutter from this room. ${KEEP} Keep fixed elements such as built-in cabinets, switches, lights and fans. Fill the revealed floor and walls realistically with the same finishes. Result: the same room, empty.${more}`;
    case 'sketch_to_render':
      return `Turn this sketch, drawing or untextured 3D view into a photorealistic interior render in a ${style || 'modern'} style. Follow its layout, proportions and viewpoint exactly; choose suitable real materials, furniture and lighting.${more}`;
    case 'edit':
      return `Edit this interior image. Change only the following, and keep everything else identical (layout, camera, lighting, other furniture and finishes): ${extra || 'improve it subtly'}`;
  }
}

Deno.serve(
  handle(async (req) => {
    const db = admin();
    const user = await caller(req, db);
    const body = (await req.json().catch(() => ({}))) as { projectId?: string; op?: Op; image?: ImageIn; reference?: ImageIn; style?: string; prompt?: string; aspectRatio?: string; caption?: string };
    const op = body.op as Op;
    if (!OPS.includes(op)) throw new HttpError(400, 'bad_op');
    if (op === 'style_transfer' && !body.reference) throw new HttpError(400, 'reference_required', 'Choose a reference image for the style.');
    if (op === 'edit' && !body.prompt?.trim()) throw new HttpError(400, 'prompt_required', 'Describe the change.');
    const { data: project } = await db.from('projects').select('id, org_id').eq('id', body.projectId ?? '').maybeSingle();
    if (!project) throw new HttpError(404, 'project_not_found');
    const orgId = project.org_id as string;
    await requireEditor(db, orgId, user.id);

    const style = String(body.style ?? '').slice(0, 60);
    const extra = String(body.prompt ?? '').slice(0, 800);
    const aspect = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'].includes(body.aspectRatio ?? '') ? body.aspectRatio : undefined;

    const src = await loadImage(db, orgId, body.image ?? {});
    const ref = body.reference ? await loadImage(db, orgId, body.reference) : null;

    const { data: job, error: jobErr } = await db
      .from('ai_jobs')
      .insert({ org_id: orgId, project_id: project.id, kind: 'image', op, provider: 'gemini', cost_credits: COST, created_by: user.id, input: { style, prompt: extra, source: `${src.bucket}/${src.path}`, reference: ref ? `${ref.bucket}/${ref.path}` : null, aspect } })
      .select('id')
      .single();
    if (jobErr) throw jobErr;
    await debit(db, orgId, COST, job.id, user.id, `AI image: ${op}`);

    try {
      const out = await geminiImage(promptFor(op, style, extra), ref ? [src, ref] : [src], aspect);
      const ext = out.mime.includes('jpeg') ? 'jpg' : 'png';
      const path = `${orgId}/${project.id}/ai-${job.id}.${ext}`;
      const up = await db.storage.from('renders').upload(path, out.bytes, { contentType: out.mime, upsert: false });
      if (up.error) throw up.error;
      const { width, height } = imageSize(out.bytes);
      const { data: versionRow } = await db.from('projects').select('current_version_no').eq('id', project.id).single();
      const label = { enhance: 'AI photo finish', restyle: `AI restyle — ${style || 'modern'}`, style_transfer: 'AI style match', clear_room: 'AI empty room', sketch_to_render: 'AI sketch to render', edit: `AI edit — ${extra.slice(0, 60)}` }[op];
      const { data: render, error: rErr } = await db
        .from('renders')
        .insert({ org_id: orgId, project_id: project.id, version_no: versionRow?.current_version_no ?? 0, storage_path: path, width, height, samples: 0, mood: 'daylight', kind: 'ai', caption: String(body.caption || label).slice(0, 200), created_by: user.id })
        .select('id')
        .single();
      if (rErr) throw rErr;
      await db.from('ai_jobs').update({ status: 'succeeded', output_path: `renders/${path}`, render_id: render.id, finished_at: new Date().toISOString(), input: { style, prompt: extra, source: `${src.bucket}/${src.path}`, model: out.model } }).eq('id', job.id);
      const { data: signed } = await db.storage.from('renders').createSignedUrl(path, 3600);
      return json({ jobId: job.id, renderId: render.id, url: signed?.signedUrl ?? null, width, height });
    } catch (e) {
      await refund(db, orgId, COST, job.id);
      await db.from('ai_jobs').update({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id);
      throw e;
    }
  }),
);
