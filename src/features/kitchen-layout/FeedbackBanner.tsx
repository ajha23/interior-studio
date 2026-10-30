import { X } from 'lucide-react';
import { useEditorStore } from '@/state/editorStore';

/** The latest command error, shown above the inspector until dismissed or replaced. */
export function FeedbackBanner() {
  const feedback = useEditorStore((s) => s.feedback);
  const clear = useEditorStore((s) => s.clearFeedback);
  if (feedback?.kind !== 'error') return null;
  return (
    <div role="alert" className="m-3 mb-0 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive" data-testid="command-error">
      <ul className="flex-1 space-y-0.5">{feedback.messages.map((m) => <li key={m}>{m}</li>)}</ul>
      <button type="button" onClick={clear} aria-label="Dismiss" className="self-start opacity-70 hover:opacity-100">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
