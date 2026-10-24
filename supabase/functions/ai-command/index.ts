// AI command planner. Turns a designer's request into scene tool calls with Gemini function
// calling. It never edits the scene: the browser validates every call against the design (limits,
// construction rules, selection) and applies them as one undoable step, or rejects them all.
import { admin, caller, handle, HttpError, json, requireEditor } from '../_shared/ai.ts';

// Tool names the editor implements. Declarations come from the app (one source of truth), but
// only these names are forwarded to the model.
const ALLOWED = new Set(['set_dimension', 'set_parameter', 'set_material', 'rotate', 'move', 'rename', 'delete', 'select', 'add_base_cabinet', 'add_cabinet', 'fill_wall']);

const SYSTEM = `You are the command planner inside Interior Studio, a professional interior-design editor for Indian homes. Units are millimetres.
Turn the designer's request into calls to the provided tools. Rules:
- Only use the tools. Never invent item ids: use "selected" for the selected piece (context.selectedId), or an id/name from context.furniture.
- Convert units to millimetres (1 cm = 10 mm, 1 m = 1000 mm, 1 inch = 25.4 mm, 1 ft = 304.8 mm). Standard sizes are fine when the designer names a standard (e.g. a dishwasher slot is 600 mm wide, a sink unit 800–900 mm, a counter height 850 mm).
- Pass expectKind when the designer names a kind of piece ("base cabinet" = basecabinet, "wall cabinet"/"upper unit" = wallcabinet, "tall unit"/"pantry" = tallcabinet).
- For a whole run of kitchen cabinets along a wall use fill_wall; for one unit use add_cabinet.
- Respect the limits in the tool descriptions; the app rejects anything outside them, so do not guess values you were not given.
- If the request is ambiguous or needs something the tools cannot do, make no calls and reply with one short sentence saying what you need or cannot do.`;

interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function cleanTools(raw: unknown): ToolSpec[] {
  if (!Array.isArray(raw)) throw new HttpError(400, 'tools_required');
  return raw
    .filter((t): t is ToolSpec => !!t && typeof t === 'object' && ALLOWED.has((t as ToolSpec).name))
    .map((t) => ({ name: t.name, description: String(t.description ?? '').slice(0, 1000), parameters: t.parameters && typeof t.parameters === 'object' ? t.parameters : { type: 'object', properties: {} } }));
}

async function plan(text: string, context: unknown, tools: ToolSpec[]) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new HttpError(503, 'not_configured', 'AI commands are not set up yet: add the GEMINI_API_KEY secret in Supabase.');
  const models = [Deno.env.get('GEMINI_TEXT_MODEL') || 'gemini-3.6-flash', 'gemini-2.5-flash'];
  let last = '';
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `Scene context (JSON):\n${JSON.stringify(context).slice(0, 30000)}\n\nDesigner's request: ${text}` }] }],
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) {
      last = `model ${model} not available`;
      continue;
    }
    if (!res.ok) throw new HttpError(502, 'provider_error', `Gemini error (${res.status}): ${out?.error?.message ?? 'unknown'}`);
    const parts = (out?.candidates?.[0]?.content?.parts ?? []) as { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[];
    const calls = parts
      .filter((p) => p.functionCall && ALLOWED.has(p.functionCall.name))
      .slice(0, 12)
      .map((p) => ({ tool: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
    const reply = parts.map((p) => p.text ?? '').join('').trim().slice(0, 500) || null;
    return { calls, reply, model };
  }
  throw new HttpError(502, 'provider_error', `No Gemini model available (${last}). Set GEMINI_TEXT_MODEL.`);
}

Deno.serve(
  handle(async (req) => {
    const db = admin();
    const user = await caller(req, db);
    const body = (await req.json().catch(() => ({}))) as { orgId?: string; projectId?: string; text?: string; context?: unknown; tools?: unknown };
    const orgId = String(body.orgId ?? '');
    await requireEditor(db, orgId, user.id);
    const text = String(body.text ?? '').trim().slice(0, 400);
    if (!text) throw new HttpError(400, 'text_required', 'Describe a change.');
    const tools = cleanTools(body.tools);
    if (!tools.length) throw new HttpError(400, 'tools_required');

    const { data: job } = await db
      .from('ai_jobs')
      .insert({ org_id: orgId, project_id: body.projectId ?? null, kind: 'command', op: 'plan_command', provider: 'gemini', cost_credits: 0, created_by: user.id, input: { text } })
      .select('id')
      .single();
    try {
      const r = await plan(text, body.context ?? {}, tools);
      if (job) await db.from('ai_jobs').update({ status: 'succeeded', finished_at: new Date().toISOString(), input: { text, model: r.model, calls: r.calls.length } }).eq('id', job.id);
      return json({ calls: r.calls, reply: r.reply });
    } catch (e) {
      if (job) await db.from('ai_jobs').update({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id);
      throw e;
    }
  }),
);
