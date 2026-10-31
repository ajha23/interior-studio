import { Check, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistantStore } from '@/state/assistantStore';
import { useEditorStore } from '@/state/editorStore';

/**
 * Shown above the plan and 3D views while a layout option is previewed, so an uncommitted
 * proposal is never mistaken for the active design.
 */
export function CandidateBanner() {
  const preview = useEditorStore((s) => (s.preview?.kind === 'candidate' ? s.preview : null));
  const previewing = useAssistantStore((s) => s.previewing);
  const { previewLayout, applyLayout } = useAssistantStore.getState();
  if (!preview) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-highlight/40 bg-accent px-3 py-1.5 text-xs text-accent-foreground" data-testid="candidate-banner">
      <Eye className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <strong>{preview.readout}</strong> — the active design is unchanged until you apply it.
      </span>
      {previewing && (
        <Button size="xs" onClick={() => void applyLayout(previewing.messageId, previewing.candidateId)}>
          <Check /> Apply this option
        </Button>
      )}
      <Button size="xs" variant="ghost" onClick={() => (previewing ? previewLayout(previewing.messageId, null) : useEditorStore.getState().previewCandidate(null))}>
        <X /> Back to my design
      </Button>
    </div>
  );
}
