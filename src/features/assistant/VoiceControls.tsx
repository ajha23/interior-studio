import { useEffect, useState } from 'react';
import { AudioLines, Loader2, Mic, MicOff, Pause, Phone, PhoneOff, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import { IDLE_TIMEOUTS } from '@/voice/controller';
import { isPending } from '@/ai/conversation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAssistantStore } from '@/state/assistantStore';
import { browserVoices, useVoiceStore, VOICE_LANGUAGES } from '@/state/voiceStore';
import { ENGINE_LABELS, REMOTE_VOICES, VOICE_ENGINES, type VoiceEngine } from '@/voice/voices';

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
  if (voice.conversation.active) return null;
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

/** Starts a hands-free conversation: it keeps listening after each reply until ended. */
export function ConversationButton() {
  const voice = useVoiceStore((s) => s.voice);
  const busy = useAssistantStore((s) => s.conversation.busy);
  const realtime = useVoiceStore((s) => s.conversationEngine === 'realtime');
  // Realtime conversations stream audio themselves and work without the browser's speech recognition.
  if ((!voice.supported && !realtime) || voice.conversation.active) return null;
  return (
    <Button
      size="icon-sm"
      variant="outline"
      aria-label="Start voice conversation"
      title="Voice conversation — talk back and forth hands-free; it ends when you say goodbye, press End, or stop talking for a while"
      disabled={busy || voice.status === 'processing' || voice.status === 'listening'}
      onClick={() => useVoiceStore.getState().startConversation()}
      data-testid="conversation-button"
    >
      <AudioLines />
    </Button>
  );
}

const PHASE = { idle: 'Your turn', 'requesting-permission': 'Connecting…', listening: 'Listening', processing: 'Thinking', speaking: 'Speaking', error: 'Microphone problem' } as const;

/** The live conversation: who is talking, live captions, idle countdown, Hold / Resume and End. */
function ConversationBar() {
  const voice = useVoiceStore((s) => s.voice);
  const { hold, resume, endConversation, setPrefs, stopSpeaking } = useVoiceStore.getState();
  const { held, idleSecondsLeft, mode, reply, notice } = voice.conversation;
  const realtime = mode === 'realtime';
  const phase = held ? 'On hold' : PHASE[voice.status];
  return (
    <div className="flex flex-col gap-1.5 border-t bg-highlight/5 px-2 py-2 text-xs" aria-label="Voice conversation" data-testid="conversation-bar">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            held ? 'bg-muted-foreground' : voice.status === 'listening' ? 'animate-pulse bg-destructive' : voice.status === 'speaking' ? 'animate-pulse bg-highlight' : voice.status === 'processing' ? 'animate-spin rounded-[2px] bg-highlight' : 'bg-muted-foreground',
          )}
        />
        <span role="status" aria-live="polite" className="font-medium" data-testid="conversation-status">
          Voice conversation · {phase}
        </span>
        <span className="rounded border px-1 text-[10px] text-muted-foreground" title={realtime ? 'Streamed speech with Gemini Live: lowest latency, talk over it to interrupt' : 'Listen, reply, then speak the reply'} data-testid="conversation-mode">
          {realtime ? 'Realtime' : 'Standard'}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {!realtime && voice.status === 'speaking' && (
            <Button size="xs" variant="ghost" onClick={stopSpeaking} aria-label="Stop speaking">
              <Square /> Stop
            </Button>
          )}
          {!realtime && (
            <Button size="icon-sm" variant="ghost" className="size-7" aria-label={voice.speakReplies ? 'Mute spoken replies' : 'Turn on spoken replies'} aria-pressed={voice.speakReplies} onClick={() => setPrefs({ speakReplies: !voice.speakReplies })}>
              {voice.speakReplies ? <Volume2 /> : <VolumeX />}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={held ? resume : hold} aria-label={held ? 'Resume conversation' : 'Hold conversation'}>
            {held ? <Play /> : <Pause />} {held ? 'Resume' : 'Hold'}
          </Button>
          <Button size="xs" variant="destructive" onClick={endConversation} aria-label="End conversation">
            <PhoneOff /> End
          </Button>
        </div>
      </div>
      <p className="min-h-4 text-[13px] text-foreground italic" data-testid="conversation-caption">
        {voice.interim ||
          (voice.status === 'listening' && !held ? (
            <span className="text-muted-foreground not-italic">{realtime ? 'Speak whenever you are ready — you can talk over the assistant. Say “goodbye” to end.' : 'Speak whenever you are ready. Say “goodbye” to end.'}</span>
          ) : voice.heard ? (
            <span className="text-muted-foreground not-italic">You said: “{voice.heard}”</span>
          ) : null)}
      </p>
      {realtime && reply && (voice.status === 'speaking' || voice.status === 'processing') && (
        <p className="line-clamp-3 text-[12px] text-muted-foreground" data-testid="conversation-reply">
          <Volume2 className="mr-1 inline size-3" />
          {reply}
        </p>
      )}
      {notice && (
        <p className="text-amber-700 dark:text-amber-300" data-testid="conversation-notice">
          {notice}
        </p>
      )}
      {idleSecondsLeft !== null && !held && (
        <p className="text-amber-700 dark:text-amber-300" data-testid="conversation-idle">
          Ending in {idleSecondsLeft} s — say something to keep talking.
        </p>
      )}
      {voice.status === 'listening' && <p className="text-[10px] text-muted-foreground">{voice.notice}</p>}
    </div>
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

  if (voice.conversation.active) return <ConversationBar />;
  const ended = voice.conversation.ended;
  const show = active || display === 'awaiting-confirmation' || (voice.error && voice.supported) || voice.heard || ended;
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
      {ended && !voice.error && (
        <p className="flex items-start gap-1 text-muted-foreground" data-testid="conversation-ended">
          <Phone className="mt-px size-3 shrink-0" />
          <span className="flex-1">{ended.message}</span>
          <button type="button" onClick={dismissError} aria-label="Dismiss voice message" className="opacity-70 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </p>
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
      {voice.speakReplies && <ReplyVoicePicker />}
      <ConversationEngineSetting />
      <label className="flex items-center justify-between gap-2">
        <span>End a voice conversation after</span>
        <Select aria-label="End a voice conversation after" value={voice.idleTimeoutMs} onChange={(e) => setPrefs({ idleTimeoutMs: Number(e.target.value) })} className="h-7 w-40 text-xs">
          {IDLE_TIMEOUTS.map((ms) => (
            <option key={ms} value={ms}>
              {ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`} of silence
            </option>
          ))}
        </Select>
      </label>
      <p className="text-muted-foreground">{voice.notice} The microphone is on only while the button shows it is listening.</p>
    </div>
  );
}

/** Which voice speaks replies: the browser's own, or Gemini's / ChatGPT's (synthesised on the server). */
function ReplyVoicePicker() {
  const replyVoice = useVoiceStore((s) => s.replyVoice);
  const language = useVoiceStore((s) => s.language);
  const notice = useVoiceStore((s) => s.speechNotice);
  const status = useAssistantStore((s) => s.serverStatus);
  const { setPrefs, previewVoice } = useVoiceStore.getState();
  // Browsers load their voice list asynchronously.
  const [, voicesLoaded] = useState(0);
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const update = () => voicesLoaded((n) => n + 1);
    speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);
  const local = browserVoices(language);
  const configured = (engine: VoiceEngine) => engine === 'browser' || !status || status.providers.some((p) => p.id === engine && p.configured);
  const remote = replyVoice.engine === 'browser' ? null : REMOTE_VOICES[replyVoice.engine];
  return (
    <div className="flex flex-col gap-1.5 pl-5" aria-label="Reply voice">
      <label className="flex items-center justify-between gap-2">
        <span>Reply voice</span>
        <Select aria-label="Reply voice source" value={replyVoice.engine} onChange={(e) => setPrefs({ replyVoice: { engine: e.target.value as VoiceEngine, voice: '' } })} className="h-7 w-48 text-xs">
          {VOICE_ENGINES.map((id) => (
            <option key={id} value={id}>
              {ENGINE_LABELS[id]}
              {configured(id) ? '' : ' — not set up'}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex items-center justify-between gap-2">
        <span>Voice</span>
        <div className="flex items-center gap-1">
          <Select aria-label="Voice" value={replyVoice.voice} onChange={(e) => setPrefs({ replyVoice: { ...replyVoice, voice: e.target.value } })} className="h-7 w-40 text-xs">
            {remote
              ? remote.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id[0]!.toUpperCase() + v.id.slice(1)}
                    {v.note ? ` — ${v.note}` : ''}
                  </option>
                ))
              : [
                  <option key="" value="">
                    Browser default
                  </option>,
                  ...local.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  )),
                ]}
          </Select>
          <Button size="icon-sm" variant="ghost" aria-label="Preview voice" title="Preview voice" onClick={previewVoice}>
            <Play />
          </Button>
        </div>
      </div>
      {remote && !configured(replyVoice.engine) && (
        <span className="text-amber-700 dark:text-amber-300" data-testid="voice-not-configured">
          {remote.label} need {replyVoice.engine === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} on the server; the browser's voice will speak instead.
        </span>
      )}
      {remote && configured(replyVoice.engine) && <span className="text-muted-foreground">Spoken by {remote.model} on the server; the first time a line is said takes a few seconds.</span>}
      {notice && (
        <span className="text-amber-700 dark:text-amber-300" role="status" data-testid="voice-fallback-notice">
          {notice}
        </span>
      )}
    </div>
  );
}

/** Realtime (Gemini Live) or the standard loop for hands-free conversations. */
function ConversationEngineSetting() {
  const engine = useVoiceStore((s) => s.conversationEngine);
  const status = useAssistantStore((s) => s.serverStatus);
  const gemini = !status || status.providers.some((p) => p.id === 'gemini' && p.configured);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center justify-between gap-2">
        <span>Voice conversation</span>
        <Select aria-label="Voice conversation engine" value={engine} onChange={(e) => useVoiceStore.getState().setPrefs({ conversationEngine: e.target.value as 'realtime' | 'standard' })} className="h-7 w-48 text-xs">
          <option value="realtime">Realtime — Gemini Live{gemini ? '' : ' (not set up)'}</option>
          <option value="standard">Standard — chosen AI provider</option>
        </Select>
      </label>
      <span className="text-muted-foreground">
        {engine === 'realtime'
          ? 'Streams speech both ways (answers start in under a second) and you can talk over the assistant. Uses the Gemini key on the server; without it the standard loop is used.'
          : 'Uses the AI provider and reply voice above. The microphone pauses while a reply plays; press Stop to interrupt.'}
      </span>
    </div>
  );
}

