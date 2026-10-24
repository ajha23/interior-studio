// AI modeler (Gemini only): a photo or a description becomes a furniture "recipe" — shaped parts
// with real millimetre sizes and studio materials — that the browser builds with three.js (and a
// Blender worker can build later). The recipe is untrusted JSON: the app sanitises it before use.
import { admin, caller, debit, handle, HttpError, json, loadImage, refund, requireEditor, type ImageIn } from '../_shared/ai.ts';

const COST = 2;
const MATERIALS =
  'oak-light (light oak), walnut (walnut), teak (teak), white-matte (white lacquer), ivory (ivory satin), graphite (dark grey suede), sage (sage green), terracotta (terracotta), ' +
  'fabric-beige (beige linen), fabric-grey (grey boucle), fabric-teal (teal velvet), fabric-mustard (mustard velvet), leather-tan (tan leather), cane (natural cane/rattan), ' +
  'metal-black (matte black metal), metal-brass (brushed brass), steel (brushed steel), glass (clear glass), ceramic-white (white ceramic), marble (white marble), ' +
  'granite-black (black granite), wood-fluted (fluted oak), plant-green (foliage), terracotta-pot (terracotta clay)';

const SYSTEM = `You are a furniture modeller. You describe a single piece of furniture or decor as a JSON "recipe" of simple shaped parts that a 3D engine will build exactly.

Coordinate frame, all in millimetres: x = width (left to right, centred on 0), y = height up from the floor (floor is y = 0), z = depth (back to front, centred on 0, +z is the FRONT that faces the viewer). "position" is the CENTRE of each part's bounding box. Rotations are degrees [rx, ry, rz], applied in that order.

Shapes (use the simplest that fits; prefer fewer, well-proportioned parts — typically 4 to 40):
- {"shape":"box","size":[w,h,d]}
- {"shape":"roundedBox","size":[w,h,d],"radius":r}  cushions, mattresses, padded or softened blocks
- {"shape":"cylinder","radiusTop":r1,"radiusBottom":r2,"height":h}  legs (tapered if r1≠r2), rods, posts; axis is vertical
- {"shape":"sphere","radius":r}
- {"shape":"torus","radius":R,"tube":t}  rings and round handles; lies flat (horizontal)
- {"shape":"lathe","profile":[[radius,y],...]}  turned legs, vases, lamp bases, bowls; profile from bottom to top, y measured from the part's own base
- {"shape":"extrude","outline":[[x,y],...],"holes":[[[x,y],...]],"depth":d,"bevel":b}  flat shaped panels: arched headboards, curved chair backs, cabriole legs, carved aprons, jaali (use holes). Outline is in the part's own x-y plane, coordinates relative to the part position, then extruded along z by depth. Rotate with ry=90 to face sideways.
- {"shape":"tube","path":[[x,y,z],...],"radius":r,"closed":false}  bent metal frames, rails, cane loops; path points relative to the part position (usually position [0,0,0] and absolute path points)

Any part may add "repeat":{"count":n,"offset":[dx,dy,dz]} for evenly spaced copies (legs: use two repeats or list each leg; slats, shelves, flutes, drawers).

Materials: declare slots in "materials" mapping a slot name to one of these ids ONLY: ${MATERIALS}. Each part uses one slot name in "material".

Rules: real Indian furniture proportions (seat height ~450, table ~750, counter ~900, bed ~450 to mattress top); parts must touch or overlap slightly so the piece is solid; nothing below y=0; the overall "size" {w,d,h} must match the parts' extent. Leave out tiny details under 5 mm. If unsure, choose the most typical design and say so in "notes".

Return ONLY JSON: {"name":string,"category":one of living|bedroom|dining|kitchen|bath|storage|office|kids|lighting|decor,"size":{"w":mm,"d":mm,"h":mm},"materials":{slot:id},"parts":[...],"notes":string}`;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function geminiJson(parts: unknown[]): Promise<{ data: unknown; model: string }> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new HttpError(503, 'not_configured', 'The AI modeler is not set up yet: add the GEMINI_API_KEY secret in Supabase.');
  const models = [Deno.env.get('GEMINI_TEXT_MODEL') || 'gemini-3.6-flash', 'gemini-2.5-flash'];
  let last = '';
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 16384 },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) {
      last = `model ${model} not available`;
      continue; // try the fallback model
    }
    if (!res.ok) throw new HttpError(502, 'provider_error', `Gemini error (${res.status}): ${out?.error?.message ?? 'unknown'}`);
    const text = (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    try {
      return { data: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')), model };
    } catch {
      throw new HttpError(422, 'bad_recipe', 'The model did not return a readable description. Try again or simplify the request.');
    }
  }
  throw new HttpError(502, 'provider_error', `No Gemini model available (${last}). Set GEMINI_TEXT_MODEL.`);
}

Deno.serve(
  handle(async (req) => {
    const db = admin();
    const user = await caller(req, db);
    const body = (await req.json().catch(() => ({}))) as {
      action?: 'design' | 'refine';
      orgId?: string;
      projectId?: string;
      image?: ImageIn;
      prompt?: string;
      sizeHint?: { w?: number; d?: number; h?: number };
      recipe?: unknown;
      instruction?: string;
    };
    const orgId = String(body.orgId ?? '');
    await requireEditor(db, orgId, user.id);
    const action = body.action === 'refine' ? 'refine' : 'design';
    const prompt = String(body.prompt ?? '').trim().slice(0, 800);
    const instruction = String(body.instruction ?? '').trim().slice(0, 800);
    if (action === 'design' && !body.image && !prompt) throw new HttpError(400, 'input_required', 'Give a photo or a description.');
    if (action === 'refine' && (!body.recipe || !instruction)) throw new HttpError(400, 'input_required', 'Describe what to change.');
    const hint = body.sizeHint && [body.sizeHint.w, body.sizeHint.d, body.sizeHint.h].some((v) => Number(v) > 0)
      ? ` Target overall size (mm): ${['w', 'd', 'h'].map((k) => `${k}=${Number((body.sizeHint as Record<string, number>)[k]) || 'any'}`).join(', ')}.`
      : '';

    const { data: job, error: jobErr } = await db
      .from('ai_jobs')
      .insert({ org_id: orgId, project_id: body.projectId ?? null, kind: 'model', op: action === 'refine' ? 'refine_3d' : body.image ? 'image_to_3d' : 'text_to_3d', provider: 'gemini', cost_credits: COST, created_by: user.id, input: { prompt, instruction } })
      .select('id')
      .single();
    if (jobErr) throw jobErr;
    await debit(db, orgId, COST, job.id, user.id, action === 'refine' ? 'AI 3D refine' : 'AI 3D model');

    try {
      const parts: unknown[] = [];
      if (action === 'refine') {
        parts.push({ text: `Here is the current recipe:\n${JSON.stringify(body.recipe).slice(0, 60000)}\n\nChange it as follows and return the complete updated recipe: ${instruction}.${hint}` });
      } else {
        if (body.image) {
          const img = await loadImage(db, orgId, body.image);
          parts.push({ inline_data: { mime_type: img.mime, data: b64(img.bytes) } });
          parts.push({ text: `Model the main piece of furniture in this photo as a recipe. Ignore the room and other objects.${prompt ? ` Notes from the designer: ${prompt}.` : ''}${hint}` });
        } else {
          parts.push({ text: `Model this piece as a recipe: ${prompt}.${hint}` });
        }
      }
      const { data, model } = await geminiJson(parts);
      await db.from('ai_jobs').update({ status: 'succeeded', finished_at: new Date().toISOString(), input: { prompt, instruction, model } }).eq('id', job.id);
      return json({ jobId: job.id, recipe: data, model });
    } catch (e) {
      await refund(db, orgId, COST, job.id);
      await db.from('ai_jobs').update({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id);
      throw e;
    }
  }),
);
