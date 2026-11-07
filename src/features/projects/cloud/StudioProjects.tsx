/**
 * The studio's projects (spec 043, US1, FR-001): name, client, status, kitchen or home, last
 * updated and owner. Editors rename, archive and unarchive; owners and admins delete an archived
 * project after typing its name. Archived projects are hidden unless "Show archived" is on. Offline,
 * the last list seen on this device is shown and every change is disabled. Row-level security
 * decides every change; the menu only hides what the role cannot do.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, FolderOpen, Home as HomeIcon, Pencil, Trash2, UtensilsCrossed } from 'lucide-react';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import * as cache from '@/persistence/cloudCache';
import { OFFLINE_COPY_BANNER } from './useCloudDocument';
import { OFFLINE_ACTION, useOnline } from './useOnline';
import { canEdit, type StudioContext } from './studioContext';

const STATUS_LABEL: Record<string, string> = { lead: 'Lead', design: 'Design', approved: 'Approved', production: 'Production', installed: 'Installed', archived: 'Archived' };

type Loaded = { rows: cloud.ProjectRow[]; fromCache: boolean } | { error: string };

/** The studio's list from the database (cached here), or the last list seen on this device. */
async function fetchRows(studio: StudioContext): Promise<Loaded> {
  const result = navigator.onLine ? await cloud.listProjects(studio.client, studio.orgId) : null;
  if (result?.ok) {
    await cache.putList(studio.userId, studio.orgId, result.value);
    return { rows: result.value, fromCache: false };
  }
  if (result && result.error.kind !== 'offline') return { error: result.error.message };
  // Offline: the last list seen here, plus any project opened or saved here since (FR-011a).
  const [copy, docs] = await Promise.all([cache.getList<cloud.ProjectRow>(studio.userId, studio.orgId), cache.docsFor(studio.userId, studio.orgId)]);
  const rows = copy?.rows ?? [];
  const known = new Set(rows.map((r) => r.id));
  const extra = docs
    .filter((d) => !known.has(d.projectId))
    .map((d): cloud.ProjectRow => ({
      id: d.projectId,
      name: d.name,
      clientName: '',
      status: 'design',
      headVersionNo: d.versionNo,
      docType: d.doc.type,
      archivedAt: null,
      updatedAt: d.cachedAt ?? new Date(0).toISOString(),
      ownerId: null,
      ownerName: 'you (on this device)',
    }));
  return { rows: [...extra, ...rows], fromCache: true };
}

export function StudioProjects({ studio }: { studio: StudioContext }) {
  const online = useOnline();
  const [rows, setRows] = useState<cloud.ProjectRow[] | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const editor = canEdit(studio.role);
  const admin = studio.role === 'owner' || studio.role === 'admin';

  const apply = useCallback((loaded: Loaded) => {
    if ('error' in loaded) return setError(loaded.error);
    setRows(loaded.rows);
    setFromCache(loaded.fromCache);
    setError(null);
  }, []);
  const load = useCallback(() => fetchRows(studio).then(apply), [studio, apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchRows(studio).then((loaded) => !cancelled && apply(loaded));
    return () => {
      cancelled = true;
    };
  }, [studio, apply, online]);

  const act = async (run: () => Promise<cloud.Result<null>>) => {
    const result = await run();
    if (!result.ok) setError(result.error.message);
    else setError(null);
    await load();
  };

  const open = (row: cloud.ProjectRow) =>
    navigate(row.docType === 'home' ? { name: 'cloud-home', slug: studio.slug, homeId: row.id } : { name: 'cloud-kitchen', slug: studio.slug, projectId: row.id });

  const visible = (rows ?? []).filter((r) => showArchived || !r.archivedAt);
  const archivedCount = (rows ?? []).filter((r) => r.archivedAt).length;

  return (
    <section aria-labelledby="studio-projects-h" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 id="studio-projects-h" className="text-sm font-semibold">
          {studio.name} projects
        </h2>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived{archivedCount ? ` (${archivedCount})` : ''}
        </label>
      </div>
      {fromCache && <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">{OFFLINE_COPY_BANNER}</p>}
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      {rows && visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {rows.length ? 'Every project in this studio is archived.' : 'No projects in this studio yet. Create one, or open the example kitchen.'}
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Studio projects">
        {visible.map((row) => {
          const legacy = row.docType === 'legacy_v1' || row.docType === null;
          return (
            <li key={row.id}>
              <Card className="flex h-full flex-col gap-3 p-4" data-testid="studio-project">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {row.docType === 'home' ? <HomeIcon className="size-3.5 shrink-0" aria-label="Home" /> : <UtensilsCrossed className="size-3.5 shrink-0" aria-label="Kitchen" />}
                    {renaming === row.id ? (
                      <RenameForm
                        name={row.name}
                        onCancel={() => setRenaming(null)}
                        onSave={(name) => {
                          setRenaming(null);
                          void act(() => cloud.renameProject(studio.client, row.id, name));
                        }}
                      />
                    ) : (
                      <h3 className="truncate font-medium">{row.name}</h3>
                    )}
                    {row.archivedAt && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">Archived</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[row.clientName, STATUS_LABEL[row.status] ?? row.status, `${row.docType === 'home' ? 'Home' : 'Kitchen'}`, `updated ${new Date(row.updatedAt).toLocaleString()}`, `by ${row.ownerName}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {legacy && <p className="mt-1 text-xs text-amber-700">Older format: opens after the import update.</p>}
                </div>
                {deleting === row.id ? (
                  <DeleteForm
                    name={row.name}
                    onCancel={() => setDeleting(null)}
                    onDelete={() => {
                      setDeleting(null);
                      void act(() => cloud.deleteProject(studio.client, row.id));
                    }}
                  />
                ) : (
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {!legacy && (
                      <Button size="sm" onClick={() => open(row)} aria-label={`Open ${row.name}`}>
                        <FolderOpen /> Open
                      </Button>
                    )}
                    {editor && (
                      <>
                        <Button size="sm" variant="ghost" disabled={!online} title={online ? undefined : OFFLINE_ACTION} onClick={() => setRenaming(row.id)} aria-label={`Rename ${row.name}`}>
                          <Pencil />
                        </Button>
                        {row.archivedAt ? (
                          <Button size="sm" variant="ghost" disabled={!online} title={online ? undefined : OFFLINE_ACTION} onClick={() => void act(() => cloud.setArchived(studio.client, row.id, false))} aria-label={`Unarchive ${row.name}`}>
                            <ArchiveRestore />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={!online} title={online ? undefined : OFFLINE_ACTION} onClick={() => void act(() => cloud.setArchived(studio.client, row.id, true))} aria-label={`Archive ${row.name}`}>
                            <Archive />
                          </Button>
                        )}
                      </>
                    )}
                    {admin && row.archivedAt && (
                      <Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={!online} title={online ? undefined : OFFLINE_ACTION} onClick={() => setDeleting(row.id)} aria-label={`Delete ${row.name}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {!online && editor && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION}</p>}
    </section>
  );
}

function RenameForm({ name, onSave, onCancel }: { name: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() && value.trim() !== name) onSave(value);
    else onCancel();
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 gap-1" aria-label={`Rename ${name}`}>
      <Input autoFocus aria-label="New name" value={value} maxLength={160} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} className="h-7" />
      <Button type="submit" size="sm" className="h-7">
        Save
      </Button>
    </form>
  );
}

function DeleteForm({ name, onDelete, onCancel }: { name: string; onDelete: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  return (
    <form
      className="mt-auto flex flex-col gap-1.5 rounded-md border border-destructive/40 p-2"
      aria-label={`Delete ${name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (typed === name) onDelete();
      }}
    >
      <p className="text-xs">
        This deletes “{name}” and every version of it. Type the project name to confirm.
      </p>
      <Input aria-label="Project name to delete" value={typed} onChange={(e) => setTyped(e.target.value)} className="h-7" />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" variant="destructive" disabled={typed !== name}>
          Delete for everyone
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
