import { useEffect } from 'react';
import { Loader2, Mic, MicOff, Square, Volume2, VolumeX, X } from 'lucide-react';
import { isPending } from '@/ai/conversation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAssistantStore } from '@/state/assistantStore';
import { useVoiceStore, VOICE_LANGUAGES } from '@/state/voiceStore';

const LABEL = {
  idle: 'Voice ready',
  'requesting-permission': 'Waiting for microphone permission…',
  listening: 'Listening…',
  processing: 'Working on it…',
  'awaiting-confirmation': 'Change ready: say “apply” or “reject”',
  speaking: 'Speaking…',
  error: 'Voice unavailable',
} as const;

/** The status the designer sees, including “awaiting confirmation” while a preview waits. */
export function useVoiceDisplayStatus(): keyof typeof LABEL {
  const status = useVoiceStore((s) => s.voice.status);
  const pending = useAssistantStore((s) => s.conversation.messages.some(isPending));
  return status === 'idle' && pending ? 'awaiting-confirmation' : status;
}

/** Microphone button for the composer: start, or stop while listening. */
export function MicButton() {
  const voice = useVoiceStore((s) => s.voice);
  const { start, stop } = useVoiceStore.getState();
  const busy = useAssistantStore((s) => s.conversation.busy);
  const listening = voice.status === 'listening' || voice.status === 'requesting-permission';
  if (!voice.supported) {
    return (
      <Button size="icon-sm" variant="ghost" disabled aria-label="Voice input is not supported in this browser" title="Voice input is not supported in this browser — type instead">
        <MicOff />
      </Button>
    );
  }
  return (
    <Button
      size="icon-sm"
      variant={listening ? 'destructive' : 'outline'}
      aria-label={listening ? 'Stop listening' : 'Speak a request'}
      aria-pressed={listening}
      title={listening ? 'Stop listening (Esc cancels)' : 'Speak a request — the microphone is used only while this is on'}
      disabled={!listening && (busy || voice.status === 'processing')}
      onClick={() => (listening ? stop() : start())}
      data-testid="mic-button"
      data-voice-status={voice.status}
      className={cn(listening && 'animate-pulse')}
    >
      {listening ? <Square /> : <Mic />}
    </Button>
  );
}

/** Live transcription, state, errors and controls; shown while voice is in use or has something to say. */
export function VoiceStatusBar() {
  const voice = useVoiceStore((s) => s.voice);
  const display = useVoiceDisplayStatus();
  const { stop, cancel, stopSpeaking, dismissError, setPrefs } = useVoiceStore.getState();
  const active = voice.status !== 'idle' && voice.status !== 'error';

  // Esc cancels listening anywhere in the app; release the microphone if the panel goes away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useVoiceStore.getState().voice.status;
      if (e.key === 'Escape' && (s === 'listening' || s === 'requesting-permission' || s === 'speaking' || s === 'processing')) {
        e.preventDefault();
        useVoiceStore.getState().cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      useVoiceStore.getState().cancel();
    };
  }, []);

  const show = active || display === 'awaiting-confirmation' || (voice.error && voice.supported) || voice.heard;
  return (
    <div className={cn('flex flex-col gap-1 border-t px-2 py-1.5 text-xs', !show && 'sr-only')} aria-label="Voice input" data-testid="voice-bar">
      <div className="flex items-center gap-1.5">
        <span role="status" aria-live="polite" className={cn('flex items-center gap-1 font-medium', voice.status === 'listening' ? 'text-destructive' : display === 'awaiting-confirmation' ? 'text-highlight' : 'text-muted-foreground')} data-testid="voice-status">
          {voice.status === 'processing' || voice.status === 'requesting-permission' ? <Loader2 className="size-3 animate-spin" /> : voice.status === 'listening' ? <Mic className="size-3" /> : null}
          {LABEL[display]}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {(voice.status === 'listening' || voice.status === 'requesting-permission') && (
            <Button size="xs" variant="ghost" onClick={stop}>
              Done
            </Button>
          )}
          {active && (
            <Button size="xs" variant="ghost" onClick={cancel} aria-label="Cancel voice request">
              Cancel
            </Button>
          )}
          {voice.status === 'speaking' && (
            <Button size="xs" variant="ghost" onClick={stopSpeaking} aria-label="Stop speaking">
              <Square /> Stop
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" className="size-7" aria-label={voice.speakReplies ? 'Mute spoken replies' : 'Turn on spoken replies'} aria-pressed={voice.speakReplies} title={voice.speakReplies ? 'Spoken replies on' : 'Spoken replies off'} onClick={() => setPrefs({ speakReplies: !voice.speakReplies })}>
            {voice.speakReplies ? <Volume2 /> : <VolumeX />}
          </Button>
        </div>
      </div>
      {voice.status === 'listening' || voice.status === 'requesting-permission' ? (
        <p className="min-h-4 text-[13px] text-foreground italic" data-testid="voice-interim">
          {voice.interim || <span className="text-muted-foreground not-italic">Speak now, e.g. “make this cabinet 900 millimetres wide”.</span>}
        </p>
      ) : (
        voice.heard && (
          <p className="text-muted-foreground" data-testid="voice-heard">
            Heard: “{voice.heard}”{voice.sent && voice.sent !== voice.heard ? <> → sent as “{voice.sent}”</> : null}
          </p>
        )
      )}
      {voice.error && voice.supported && (
        <p role="alert" className="flex items-start gap-1 text-destructive" data-testid="voice-error">
          <span className="flex-1">{voice.error.message}</span>
          <button type="button" onClick={dismissError} aria-label="Dismiss voice message" className="opacity-70 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </p>
      )}
      {voice.status === 'listening' && <p className="text-[10px] text-muted-foreground">{voice.notice}</p>}
    </div>
  );
}

/** Voice settings inside the assistant settings panel. */
export function VoiceSettings() {
  const voice = useVoiceStore((s) => s.voice);
  const language = useVoiceStore((s) => s.language);
  const { setPrefs } = useVoiceStore.getState();
  if (!voice.supported) return <p className="text-muted-foreground">Voice input is not supported in this browser. Chrome, Edge and Safari support it; the text box always works.</p>;
  return (
    <div className="flex flex-col gap-2" aria-label="Voice settings">
      <label className="flex items-center justify-between gap-2">
        <span>Voice language</span>
        <Select aria-label="Voice language" value={language} onChange={(e) => setPrefs({ language: e.target.value })} className="h-7 w-44 text-xs">
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={voice.reviewBeforeSending} onChange={(e) => setPrefs({ reviewBeforeSending: e.target.checked })} className="mt-0.5" aria-label="Review spoken requests before sending" />
        <span>Put what I say in the message box to edit before sending</span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={voice.speakReplies} onChange={(e) => setPrefs({ speakReplies: e.target.checked })} className="mt-0.5" aria-label="Speak replies to voice requests" />
        <span>Speak short replies to voice requests</span>
      </label>
      <p className="text-muted-foreground">{voice.notice} The microphone is on only while the button shows it is listening.</p>
    </div>
  );
}
