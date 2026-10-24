// Public, read-only resolution of a client share link.
// Anyone holding the unguessable token gets the design (latest or pinned version), the studio's
// saved renders and short-lived URLs for uploaded 3D models used in the scene. Nothing else.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SIGNED_TTL_S = 60 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let token = '';
  try {
    token = String((await req.json())?.token ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: 'not_found' }, 404);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: link } = await db
    .from('share_links')
    .select('id, project_id, org_id, version_id, label, show_renders, show_plan, expires_at, revoked_at, view_count')
    .eq('token', token)
    .maybeSingle();
  // Same answer for unknown, revoked and expired links: don't reveal which tokens exist.
  if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at).getTime() < Date.now())) return json({ error: 'not_found' }, 404);

  const [{ data: project }, { data: org }] = await Promise.all([
    db.from('projects').select('id, name, client_name, current_version_id, archived_at').eq('id', link.project_id).maybeSingle(),
    db.from('organizations').select('name').eq('id', link.org_id).maybeSingle(),
  ]);
  if (!project || project.archived_at) return json({ error: 'not_found' }, 404);

  const versionId = link.version_id ?? project.current_version_id;
  if (!versionId) return json({ error: 'empty' }, 404);
  const { data: version } = await db.from('project_versions').select('version_no, schema_version, scene, created_at').eq('id', versionId).eq('project_id', project.id).maybeSingle();
  if (!version) return json({ error: 'not_found' }, 404);

  // Issued revisions carry full snapshots; clients only need the live design.
  const scene = { ...(version.scene as Record<string, unknown>), revisions: [] };

  let renders: { url: string; width: number; height: number; caption: string; createdAt: string }[] = [];
  if (link.show_renders) {
    const { data: rows } = await db.from('renders').select('storage_path, width, height, caption, created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(40);
    if (rows?.length) {
      const { data: signed } = await db.storage.from('renders').createSignedUrls(rows.map((r) => r.storage_path), SIGNED_TTL_S);
      const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      renders = rows.filter((r) => urlOf.get(r.storage_path)).map((r) => ({ url: urlOf.get(r.storage_path)!, width: r.width, height: r.height, caption: r.caption, createdAt: r.created_at }));
    }
  }

  const modelIds = [...new Set(((scene.furniture as { kind?: string; modelId?: string }[] | undefined) ?? []).filter((f) => f.kind === 'model' && f.modelId).map((f) => f.modelId!))];
  const models: Record<string, string> = {};
  if (modelIds.length) {
    const { data: rows } = await db.from('catalog_models').select('id, storage_path').eq('org_id', link.org_id).in('id', modelIds);
    if (rows?.length) {
      const { data: signed } = await db.storage.from('models').createSignedUrls(rows.map((r) => r.storage_path), SIGNED_TTL_S);
      const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      for (const r of rows) {
        const u = urlOf.get(r.storage_path);
        if (u) models[r.id] = u;
      }
    }
  }

  await db.from('share_links').update({ view_count: link.view_count + 1, last_viewed_at: new Date().toISOString() }).eq('id', link.id);

  return json({
    label: link.label,
    studio: org?.name ?? '',
    project: { name: project.name, client: project.client_name },
    version: { no: version.version_no, savedAt: version.created_at, pinned: Boolean(link.version_id) },
    schemaVersion: version.schema_version,
    scene,
    showPlan: link.show_plan,
    renders,
    models,
  });
});
