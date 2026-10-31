/**
 * Voice input state for the assistant panel. The controller feeds finished utterances into the
 * same conversation (`Conversation.send`) as the text box, so voice and text share validation,
 * previews, approval, undo and persistence.
 */
import { create } from 'zustand';
import { VoiceController, type VoiceState } from '@/voice/controller';
import { createSpeechProvider } from '@/voice/speech';
import { BrowserTextToSpeech } from '@/voice/synthesis';
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
    };
  } catch {
    return { language: defaultLanguage(), speakReplies: true, reviewBeforeSending: false };
  }
}

interface VoiceStore {
  voice: VoiceState;
  language: string;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  stopSpeaking: () => void;
  dismissError: () => void;
  setPrefs: (patch: Partial<VoicePrefs>) => void;
}

type Deps = ConstructorParameters<typeof VoiceController>[0];

/** Builds a controller wired to the shared conversation; exported for tests. */
export function createVoiceController(options: { provider?: Deps['provider']; tts?: Deps['tts']; language?: () => string; maxListenMs?: number } = {}) {
  const prefs = loadPrefs();
  return new VoiceController(makeDeps({ provider: options.provider === undefined ? createSpeechProvider() : options.provider, tts: options.tts ?? new BrowserTextToSpeech(), language: options.language ?? (() => prefs.language), maxListenMs: options.maxListenMs }), prefs);
}

function makeDeps(o: { provider: Deps['provider']; tts: Deps['tts']; language: () => string; maxListenMs?: number }): Deps {
  const conversation = assistantConversation;
  return {
    provider: o.provider,
    tts: o.tts,
    language: o.language,
    maxListenMs: o.maxListenMs,
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
const controller = createVoiceController({ language: () => prefs.language });

export const useVoiceStore = create<VoiceStore>()((set) => ({
  voice: controller.state,
  language: prefs.language,
  start: () => void controller.start(),
  stop: () => void controller.stop(),
  cancel: () => void controller.cancel(),
  stopSpeaking: () => controller.stopSpeaking(),
  dismissError: () => controller.dismissError(),
  setPrefs: (patch) => {
    prefs = { ...prefs, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Preferences are a convenience.
    }
    controller.setPrefs({ speakReplies: prefs.speakReplies, reviewBeforeSending: prefs.reviewBeforeSending });
    set({ language: prefs.language });
  },
}));

controller.subscribe((voice) => useVoiceStore.setState({ voice }));

// Opening or closing a project ends any listening session: nothing carries over.
let projectId: string | null = null;
useEditorStore.subscribe((s) => {
  const id = s.project?.id ?? null;
  if (id !== projectId) {
    projectId = id;
    void controller.cancel();
  }
});
