// Public: a client holding a share link (with comments allowed) adds a comment or replies to a
// thread they started. No sign-in; the unguessable token is the credential. Rate-limited per link.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const PER_HOUR = 30;

function cleanAnchor(a: unknown): Record<string, unknown> | null {
  const v = a as { kind?: string; itemId?: unknown; x?: unknown; y?: unknown; renderId?: unknown } | null;
  if (!v || typeof v !== 'object') return null;
  if (v.kind === 'item' && typeof v.itemId === 'string' && v.itemId.length <= 80) return { kind: 'item', itemId: v.itemId };
  if (v.kind === 'render' && typeof v.renderId === 'string' && /^[0-9a-f-]{36}$/.test(v.renderId)) return { kind: 'render', renderId: v.renderId };
  if (v.kind === 'point' && Number.isFinite(v.x) && Number.isFinite(v.y)) return { kind: 'point', x: Math.round(v.x as number), y: Math.round(v.y as number) };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const input = (await req.json().catch(() => ({}))) as { token?: string; name?: string; body?: string; anchor?: unknown; parentId?: string };
  const token = String(input.token ?? '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: 'not_found' }, 404);
  const text = String(input.body ?? '').trim().slice(0, 2000);
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!text) return json({ error: 'empty', message: 'Write a comment first.' }, 400);
  if (!name) return json({ error: 'name_required', message: 'Add your name so the designer knows who wrote this.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: link } = await db.from('share_links').select('id, org_id, project_id, revoked_at, expires_at, allow_comments').eq('token', token).maybeSingle();
  if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at).getTime() < Date.now())) return json({ error: 'not_found' }, 404);
  if (!link.allow_comments) return json({ error: 'comments_off', message: 'Comments are turned off for this link.' }, 403);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('comments').select('id', { count: 'exact', head: true }).eq('share_link_id', link.id).gte('created_at', since);
  if ((count ?? 0) >= PER_HOUR) return json({ error: 'rate_limited', message: 'Too many comments in the last hour. Please try again later.' }, 429);

  let parentId: string | null = null;
  if (input.parentId) {
    const { data: parent } = await db.from('comments').select('id, parent_id, share_link_id, project_id').eq('id', input.parentId).maybeSingle();
    // Clients may only reply to threads started from this same link.
    if (!parent || parent.parent_id || parent.share_link_id !== link.id || parent.project_id !== link.project_id) return json({ error: 'not_found' }, 404);
    parentId = parent.id;
  }

  const { data: row, error } = await db
    .from('comments')
    .insert({ org_id: link.org_id, project_id: link.project_id, parent_id: parentId, anchor: parentId ? null : cleanAnchor(input.anchor), body: text, source: 'client', author_id: null, author_name: name, share_link_id: link.id })
    .select('id, parent_id, anchor, body, source, author_name, created_at, resolved_at')
    .single();
  if (error) return json({ error: 'internal', message: error.message }, 500);
  return json({ comment: row });
});
