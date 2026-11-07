/**
 * Someone else saved this project after this device last saw it (spec 043, US3, FR-012). Nothing is
 * overwritten silently: "Save mine on top" keeps both versions (theirs, then mine); "Load theirs"
 * discards my unsaved changes, only after I confirm. Closing keeps the conflict; the status reopens it.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import { useStudioContext } from './studioContext';
import { useSyncStore } from './sync';

export const DISCARD_PROMPT = 'Discard your unsaved changes and open their version?';

export function ConflictDialog() {
  const { status, conflict, conflictOpen, projectId, setConflictOpen, saveMineOnTop, loadTheirs } = useSyncStore();
  const studio = useStudioContext((s) => s.studio);
  const [who, setWho] = useState<cloud.VersionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const theirs = conflict?.currentVersionNo ?? null;

  useEffect(() => {
    if (!studio || !projectId || theirs === null || status !== 'conflict') return;
    let cancelled = false;
    void cloud.versionInfo(studio.client, projectId, theirs).then((r) => !cancelled && setWho(r.ok ? r.value : null));
    return () => {
      cancelled = true;
    };
  }, [studio, projectId, theirs, status]);

  if (status !== 'conflict' || !conflictOpen) return null;

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setProblem(null);
    const ok = await action();
    setBusy(false);
    if (!ok) setProblem(useSyncStore.getState().error?.message ?? 'That did not work. Check the connection and try again.');
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div className="w-[min(460px,100%)] rounded-xl bg-card p-5 shadow-2xl">
        <h2 id="conflict-title" className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="size-4 text-amber-600" /> Someone else saved this project
        </h2>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="conflict-who">
          {who
            ? `${who.authorName} saved version ${who.versionNo} at ${new Date(who.createdAt).toLocaleString()}, after you opened it.`
            : theirs !== null
              ? `Version ${theirs} was saved by someone else after you opened it.`
              : 'A newer version was saved after you opened it.'}{' '}
          Your changes are kept on this device until you choose.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          <li>
            <strong className="text-foreground">Save mine on top</strong>: your design becomes the newest version; theirs stays in the history.
          </li>
          <li>
            <strong className="text-foreground">Load theirs</strong>: open their version and discard your unsaved changes.
          </li>
        </ul>
        {problem && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {problem}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConflictOpen(false)} disabled={busy}>
            Decide later
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => window.confirm(DISCARD_PROMPT) && void run(loadTheirs)}>
            Load theirs
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void run(saveMineOnTop)}>
            Save mine on top
          </Button>
        </div>
      </div>
    </div>
  );
}
