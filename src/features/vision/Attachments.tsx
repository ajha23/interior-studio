import { useRef } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVisionStore } from '@/state/visionStore';

/** Attach reference photos (up to 6) or a video to the next message. */
export function AttachButton() {
  const input = useRef<HTMLInputElement>(null);
  const preparing = useVisionStore((s) => s.preparing);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-testid="reference-input"
        aria-label="Reference photos or video"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void useVisionStore.getState().addFiles(files);
        }}
      />
      <Button size="icon-sm" variant="outline" type="button" aria-label="Attach reference photos or video" title="Attach photos or a video of a look you like: the assistant matches the finishes, colours and (if you ask) the layout or room size" onClick={() => input.current?.click()} disabled={preparing}>
        {preparing ? <Loader2 className="animate-spin" /> : <ImagePlus />}
      </Button>
    </>
  );
}

/** Thumbnails of what will be sent, with a way to remove them. */
export function AttachmentStrip() {
  const attachments = useVisionStore((s) => s.attachments);
  const error = useVisionStore((s) => s.attachError);
  if (!attachments && !error) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-1.5 text-[11px]" data-testid="attachment-strip">
      {attachments && (
        <div className="flex items-center gap-1">
          {attachments.items.map((it, i) => (
            <img key={i} src={it.thumb} alt={`${attachments.kind === 'video' ? 'Frame' : 'Photo'} ${i + 1}`} className="h-10 rounded object-cover" />
          ))}
          <span className="ml-1 text-muted-foreground">{attachments.kind === 'video' ? `${attachments.items.length} frames from the video` : `${attachments.items.length} photo${attachments.items.length === 1 ? '' : 's'}`}. Say what to take from it (finishes by default; or the layout, or the room size), then send.</span>
          <button type="button" className="ml-auto opacity-70 hover:opacity-100" aria-label="Remove attachments" onClick={() => useVisionStore.getState().clearAttachments()}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {error && <p className="text-destructive" role="alert">{error}</p>}
    </div>
  );
}
