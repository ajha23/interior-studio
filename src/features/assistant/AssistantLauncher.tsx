import { useEffect, useRef } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAssistantStore } from '@/state/assistantStore';
import { useVoiceStore } from '@/state/voiceStore';
import { AssistantPanel } from './AssistantPanel';

/**
 * The design assistant as a chat window over the bottom-right corner, opened from a round button.
 * The panel stays mounted while closed so the conversation, a pending preview and a voice
 * conversation carry on; the button shows when something needs attention.
 */
export function AssistantLauncher() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const busy = useAssistantStore((s) => s.conversation.busy);
  const unread = useAssistantStore((s) => s.unread);
  const talking = useVoiceStore((s) => s.voice.conversation.active);
  const window_ = useRef<HTMLDivElement>(null);

  // Opening puts the cursor in the message box.
  useEffect(() => {
    if (open) window_.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, [open]);

  return (
    <>
      <div
        ref={window_}
        className={cn(
          'fixed right-4 bottom-[8.25rem] z-50 flex h-[min(680px,calc(100dvh-14.5rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl transition-[opacity,transform] duration-150',
          open ? 'translate-y-0 opacity-100' : 'pointer-events-none invisible translate-y-2 opacity-0',
        )}
        role="dialog"
        aria-label="Assistant window"
        aria-hidden={!open}
        data-testid="assistant-window"
      >
        <AssistantPanel onClose={() => setOpen(false)} />
      </div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Assistant"
        aria-expanded={open}
        title={open ? 'Hide the design assistant' : 'Design assistant: edit the design by describing changes'}
        className={cn(
          'fixed right-4 bottom-[4.5rem] z-50 grid size-12 place-items-center rounded-full bg-highlight text-white shadow-lg transition-transform outline-none hover:scale-105 focus-visible:ring-4 focus-visible:ring-highlight/40',
          (talking || busy) && !open && 'animate-pulse',
        )}
        data-testid="assistant-launcher"
      >
        {open ? <ChevronDown className="size-6" /> : <Bot className="size-6" />}
        {unread && !open && <span className="absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-card bg-destructive" aria-label="New reply" />}
      </button>
    </>
  );
}
