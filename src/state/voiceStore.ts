/**
 * Voice input state for the assistant panel. The controller feeds finished utterances into the
 * same conversation (`Conversation.send`) as the text box, so voice and text share validation,
 * previews, approval, undo and persistence.
 */
import { create } from 'zustand';
import { DEFAULT_IDLE_TIMEOUT, IDLE_TIMEOUTS, VoiceController, type VoiceState } from '@/voice/controller';
import { createSpeechProvider } from '@/voice/speech';
import { BrowserTextToSpeech, RemoteTextToSpeech } from '@/voice/synthesis';
import { DEFAULT_REPLY_VOICE, parseReplyVoice, REMOTE_VOICES, type ReplyVoice } from '@/voice/voices';
import { startLiveSession } from '@/voice/live/session';
import { LIVE_MODEL } from '@/ai/live';
import { liveContext, runLiveTool } from './liveTools';
import { assistantConversation, useAssistantStore } from './assistantStore';
import { useEditorStore } from './editorStore';

export const VOICE_LANGUAGES = [
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'en-CA', label: 'English (Canada)' },
] as const;

interface VoicePrefs {
  language: string;
  speakReplies: boolean;
  reviewBeforeSending: boolean;
  /** Which voice speaks replies: the browser's, or Gemini's / ChatGPT's from the server. */
  replyVoice: ReplyVoice;
  /** A hands-free conversation ends after this long without speech. */
  idleTimeoutMs: number;
  /** Realtime (Gemini Live, streamed speech) or the standard listen → reply → speak loop. */
  conversationEngine: 'realtime' | 'standard';
}

const KEY = 'interior-studio:voice';

function defaultLanguage(): string {
  const nav = typeof navigator === 'undefined' ? 'en-GB' : navigator.language;
  return VOICE_LANGUAGES.find((l) => l.id === nav)?.id ?? 'en-GB';
}

function loadPrefs(): VoicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VoicePrefs>;
    return {
      language: VOICE_LANGUAGES.some((l) => l.id === raw.language) ? raw.language! : defaultLanguage(),
      speakReplies: raw.speakReplies !== false,
      reviewBeforeSending: raw.reviewBeforeSending === true,
      replyVoice: parseReplyVoice(raw.replyVoice),
      idleTimeoutMs: (IDLE_TIMEOUTS as readonly number[]).includes(raw.idleTimeoutMs as number) ? raw.idleTimeoutMs! : DEFAULT_IDLE_TIMEOUT,
      conversationEngine: raw.conversationEngine === 'standard' ? 'standard' : 'realtime',
    };
  } catch {
    return { language: defaultLanguage(), speakReplies: true, reviewBeforeSending: false, replyVoice: DEFAULT_REPLY_VOICE, idleTimeoutMs: DEFAULT_IDLE_TIMEOUT, conversationEngine: 'realtime' };
  }
}

interface VoiceStore {
  voice: VoiceState;
  language: string;
  replyVoice: ReplyVoice;
  conversationEngine: VoicePrefs['conversationEngine'];
  /** Why a server voice was not used for the last reply (the browser's voice spoke instead). */
  speechNotice: string | null;
  /** Speaks a sample line in the chosen voice. */
  previewVoice: () => void;
  start: () => void;
  /** Hands-free conversation: listens again after every reply until ended. */
  startConversation: () => void;
  endConversation: () => void;
  hold: () => void;
  resume: () => void;
  stop: () => void;
  cancel: () => void;
  stopSpeaking: () => void;
  dismissError: () => void;
  setPrefs: (patch: Partial<VoicePrefs>) => void;
}

type Deps = ConstructorParameters<typeof VoiceController>[0];

/** Builds a controller wired to the shared conversation; exported for tests. */
export function createVoiceController(options: Partial<Pick<Deps, 'provider' | 'tts' | 'language' | 'maxListenMs' | 'maxConversationMs' | 'relistenDelayMs' | 'now' | 'live'>> = {}) {
  const prefs = loadPrefs();
  const { provider, tts, language, ...timing } = options;
  return new VoiceController(makeDeps({ provider: provider === undefined ? createSpeechProvider() : provider, tts: tts ?? new BrowserTextToSpeech(), language: language ?? (() => prefs.language), ...timing }), prefs);
}

function makeDeps(o: Pick<Deps, 'provider' | 'tts' | 'language'> & Partial<Pick<Deps, 'maxListenMs' | 'maxConversationMs' | 'relistenDelayMs' | 'now' | 'live'>>): Deps {
  const conversation = assistantConversation;
  return {
    ...o,
    submit: (text) => conversation().send(text, { source: 'voice' }),
    cancelRequest: () => conversation().cancel(),
    pendingProposal: () => conversation().pendingProposalId(),
    approve: (id) => conversation().approve(id),
    reject: (id) => conversation().reject(id),
    message: (id) => conversation().state.messages.find((m) => m.id === id),
    projectId: () => useEditorStore.getState().project?.id ?? null,
    draft: (text) => useAssistantStore.getState().setDraft(text),
  };
}

let prefs = loadPrefs();
const browserVoice = new BrowserTextToSpeech();
const replyTts = new RemoteTextToSpeech({
  choice: () => prefs.replyVoice,
  fallback: browserVoice,
  onFallback: (message) => useVoiceStore.setState({ speechNotice: `${message} The browser's voice spoke instead.` }),
});
const controller = createVoiceController({
  language: () => prefs.language,
  tts: replyTts,
  live: {
    enabled: () => prefs.conversationEngine === 'realtime' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    // The realtime model speaks with the chosen Gemini voice (or the default one).
    start: (callbacks) => startLiveSession(prefs.replyVoice.engine === 'gemini' ? prefs.replyVoice.voice : REMOTE_VOICES.gemini.defaultVoice, callbacks),
    runTool: (call, turn) => runLiveTool(call.name, call.args, turn),
    context: liveContext,
    logExchange: (userText, modelText) => {
      const conversation = assistantConversation();
      if (!conversation.state.busy) void conversation.send(userText, { source: 'voice', response: { value: { kind: 'answer', text: modelText.slice(0, 1500) }, servedBy: { provider: 'gemini-live', model: LIVE_MODEL } } });
    },
  },
});

/** The browser's own voices for the current language (for the voice picker). */
export const browserVoices = (language = prefs.language) => browserVoice.voices(language);

export const useVoiceStore = create<VoiceStore>()((set) => ({
  voice: controller.state,
  language: prefs.language,
  replyVoice: prefs.replyVoice,
  conversationEngine: prefs.conversationEngine,
  speechNotice: null,
  previewVoice: () => {
    useVoiceStore.setState({ speechNotice: null });
    replyTts.speak('Hi! I can read out previews and confirmations, like: the sink is now 750 millimetres high.', { language: prefs.language });
  },
  start: () => void controller.start(),
  startConversation: () => void controller.startConversation(),
  endConversation: () => controller.endConversation('user'),
  hold: () => controller.hold(),
  resume: () => controller.resume(),
  stop: () => void controller.stop(),
  cancel: () => void controller.cancel(),
  stopSpeaking: () => controller.stopSpeaking(),
  dismissError: () => controller.dismissError(),
  setPrefs: (patch) => {
    prefs = { ...prefs, ...patch, replyVoice: parseReplyVoice(patch.replyVoice ?? prefs.replyVoice) };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Preferences are a convenience.
    }
    controller.setPrefs({ speakReplies: prefs.speakReplies, reviewBeforeSending: prefs.reviewBeforeSending, idleTimeoutMs: prefs.idleTimeoutMs });
    if (patch.replyVoice) replyTts.stop();
    set({ language: prefs.language, replyVoice: prefs.replyVoice, conversationEngine: prefs.conversationEngine, ...(patch.replyVoice ? { speechNotice: null } : {}) });
  },
}));

controller.subscribe((voice) => useVoiceStore.setState({ voice }));

// Opening or closing a project ends any listening session: nothing carries over.
let projectId: string | null = null;
useEditorStore.subscribe((s) => {
  const id = s.project?.id ?? null;
  if (id !== projectId) {
    projectId = id;
    controller.endConversation('project');
    void controller.cancel();
  }
});

// Like Gemini Live: leaving the tab puts a conversation on hold instead of listening in the background.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') controller.hold();
  });
}
