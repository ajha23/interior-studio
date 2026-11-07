/**
 * The quiet save indicator for a studio project (spec 043, FR-010): exactly one of Saved, Saving…,
 * Offline (queued N), Conflict, or Couldn't save (with Retry when retrying can help). Viewers see
 * "View only" instead. Nothing is shown for projects on this device.
 */
import { AlertTriangle, Check, CloudOff, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSyncStore } from './sync';

export function SaveStatus() {
  const { projectId, readOnly, status, queuedCount, error, canRetry, retry } = useSyncStore();
  if (!projectId) return null;
  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground" title="Ask a studio owner for edit access">
        <Eye className="size-3.5" /> View only
      </span>
    );
  }
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground" data-save-status={status}>
      {status === 'saved' && (
        <>
          <Check className="size-3.5" /> Saved
        </>
      )}
      {status === 'saving' && (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </>
      )}
      {status === 'offline' && (
        <>
          <CloudOff className="size-3.5" /> Offline (queued {queuedCount})
        </>
      )}
      {status === 'conflict' && (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <AlertTriangle className="size-3.5" /> Conflict
        </span>
      )}
      {status === 'error' && (
        <span className="inline-flex items-center gap-1 text-destructive" title={error?.message}>
          <AlertTriangle className="size-3.5" /> Couldn&apos;t save{error ? `: ${error.message}` : ''}
          {canRetry && (
            <Button variant="outline" size="sm" className="ml-1 h-6 px-2 text-xs" onClick={() => void retry()}>
              Retry
            </Button>
          )}
        </span>
      )}
    </span>
  );
}
