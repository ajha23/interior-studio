/**
 * History of a studio project (spec 043, US5): who saved what and when, newest first, 50 at a time.
 * Open shows a version read-only (VersionBanner); Restore saves it on top of the head. Both need a
 * connection; viewers can look but not restore.
 */
import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import { canEdit, useStudioContext } from './studioContext';
import { useHistoryStore } from './history';
import { useSyncStore } from './sync';
import { OFFLINE_ACTION, useOnline } from './useOnline';

const KIND: Record<string, string> = { autosave: 'Autosave', manual: 'Saved version', restore: 'Restore', revision: 'Revision' };

const describe = (v: cloud.VersionRow) => `${KIND[v.kind] ?? v.kind} · ${v.authorName} · ${new Date(v.createdAt).toLocaleString()}`;

/** The History button for the editor and home plan headers (studio projects only). */
export function HistoryButton() {
  const projectId = useSyncStore((s) => s.projectId);
  const online = useOnline();
  if (!projectId) return null;
  return (
    <Button variant="ghost" size="sm" disabled={!online} title={online ? 'Versions of this project' : OFFLINE_ACTION} onClick={() => useHistoryStore.getState().setOpen(true)}>
      <History /> History
    </Button>
  );
}

export function HistoryPanel() {
  const open = useHistoryStore((s) => s.open);
  const error = useHistoryStore((s) => s.error);
  const projectId = useSyncStore((s) => s.projectId);
  const head = useSyncStore((s) => s.head);
  const studio = useStudioContext((s) => s.studio);
  const online = useOnline();
  const [rows, setRows] = useState<cloud.VersionRow[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !studio || !projectId) return;
    let cancelled = false;
    void cloud.listVersions(studio.client, projectId, page).then((r) => {
      if (cancelled) return;
      if (!r.ok) return setLoadError(r.error.message);
      setLoadError(null);
      setRows((prev) => (page === 0 ? r.value : [...prev, ...r.value]));
      setMore(r.value.length === cloud.HISTORY_PAGE);
    });
    return () => {
      cancelled = true;
    };
  }, [open, studio, projectId, page, head]);

  if (!open || !projectId) return null;
  const close = () => {
    useHistoryStore.getState().setOpen(false);
    setPage(0);
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-[65] flex w-[min(380px,100%)] flex-col border-l bg-card shadow-2xl" role="dialog" aria-label="Version history">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <History className="size-4" />
        <h2 className="text-sm font-semibold">Version history</h2>
        <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Close history" onClick={close}>
          <X />
        </Button>
      </header>
      {(error || loadError) && (
        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
          {error ?? loadError}
        </p>
      )}
      <ol className="flex-1 overflow-y-auto" aria-label="Versions">
        {rows.map((v) => (
          <li key={v.versionNo} className="flex items-start gap-2 border-b px-4 py-2.5" data-testid="version-row">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Version {v.versionNo}
                {v.versionNo === head && <span className="ml-1.5 rounded bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">Latest</span>}
              </p>
              <p className="text-xs text-muted-foreground">{describe(v)}</p>
              {v.message && <p className="mt-0.5 truncate text-xs">“{v.message}”</p>}
            </div>
            {v.docType === 'legacy_v1' ? (
              <span className="text-[11px] text-muted-foreground">Older format</span>
            ) : (
              <Button size="sm" variant="outline" disabled={!online} title={online ? undefined : OFFLINE_ACTION} onClick={() => void useHistoryStore.getState().view(v)} aria-label={`Open version ${v.versionNo}`}>
                Open
              </Button>
            )}
          </li>
        ))}
      </ol>
      {more && (
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setPage((p) => p + 1)}>
            Show more
          </Button>
        </div>
      )}
      {studio && !canEdit(studio.role) && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Viewers can open past versions; restoring needs edit access.</p>}
    </aside>
  );
}

/** Shown while a past version is on screen. */
export function VersionBanner() {
  const viewing = useHistoryStore((s) => s.viewing);
  const studio = useStudioContext((s) => s.studio);
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  if (!viewing) return null;
  const { version } = viewing;
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    await action();
    setBusy(false);
  };
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-sky-50 px-3 py-1.5 text-xs text-sky-950" data-testid="version-banner">
      <span>
        Viewing version {version.versionNo} ({describe(version)}) · read-only
      </span>
      <div className="ml-auto flex gap-1.5">
        <Button size="xs" variant="outline" disabled={busy || !online} title={online ? undefined : OFFLINE_ACTION} onClick={() => void run(useHistoryStore.getState().backToLatest)}>
          Back to latest
        </Button>
        {studio && canEdit(studio.role) && (
          <Button size="xs" disabled={busy || !online} title={online ? 'Save this version as the newest one; nothing is deleted' : OFFLINE_ACTION} onClick={() => void run(useHistoryStore.getState().restore)}>
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}
