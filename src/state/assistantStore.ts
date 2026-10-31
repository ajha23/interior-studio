/**
 * The assistant panel's state: one `Conversation` per open project, connected to the editor store
 * through `EditorPort`. Proposals are committed with `applyTransaction`, so a chat edit is one
 * undo step and the plan, 3D view and drawings all refresh from the same canonical project.
 */
import { create } from 'zustand';
import { Conversation, type ChatMessage, type ConversationState, type EditorPort, type SendOptions } from '@/ai/conversation';
import { DEFAULT_SETTINGS, type AssistantSettings } from '@/ai/policy';
import { AI_PROVIDERS, DEFAULT_PROVIDER, PROVIDER_CATALOG, type AiProviderId, type AiSelection, type ProviderStatus } from '@/ai/providers/catalog';
import { HttpAssistantProvider } from '@/ai/providers/http';
import { RuleBasedProvider } from '@/ai/providers/rules';
import type { AssistantProvider } from '@/ai/providers/types';
import { formatLength } from '@/engine/measurement/units';
import { deliverableReply } from './deliverableAssistant';
import { useEditorStore } from './editorStore';

/** The AI provider and model the designer picked; "rules" runs in the browser without a server. */
export interface AssistantPrefs extends AssistantSettings, AiSelection {}

const PREFS_KEY = 'interior-studio:assistant';

/** Reads saved preferences, upgrading the old `server`/`offline` choice and dropping unknown models. */
export function parsePrefs(raw: unknown): AssistantPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const provider: AiProviderId = r.provider === 'offline' ? 'rules' : (AI_PROVIDERS as readonly unknown[]).includes(r.provider) ? (r.provider as AiProviderId) : DEFAULT_PROVIDER;
  const catalog = PROVIDER_CATALOG[provider];
  const model = catalog.models.some((m) => m.id === r.model) ? (r.model as string) : catalog.defaultModel;
  return { autoApply: r.autoApply === true, provider, model };
}

function loadPrefs(): AssistantPrefs {
  try {
    return parsePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
  } catch {
    return parsePrefs({ ...DEFAULT_SETTINGS });
  }
}

function savePrefs(p: AssistantPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Preferences are a convenience; the defaults are safe.
  }
}

/** The editor as the conversation sees it. */
export function editorPort(): EditorPort {
  const editor = () => useEditorStore.getState();
  const step = (dir: 'undo' | 'redo', n: number) => {
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      const s = editor();
      const entry = dir === 'undo' ? s.past.at(-1) : s.future.at(-1);
      if (!entry) break;
      labels.push(entry.label);
      if (dir === 'undo') s.undo();
      else s.redo();
    }
    return labels;
  };
  return {
    getProject: () => editor().project,
    getRevision: () => editor().revision,
    getSelectedId: () => editor().selectedId,
    applyTransaction: (commands, label, expectedRevision) => editor().applyTransaction(commands, label, expectedRevision),
    undo: (n) => step('undo', n),
    redo: (n) => step('redo', n),
    select: (id) => editor().select(id),
    fmt: (mm) => formatLength(mm, editor().project?.preferences.unit ?? 'mm'),
    deliverable: (request) => deliverableReply(request),
  };
}

// One server client for every AI provider; it sends the current selection with each request.
const http = new HttpAssistantProvider('/api/assistant', 60_000, undefined, (): AiSelection => {
  const { provider, model }: AssistantPrefs = useAssistantStore.getState().prefs;
  return { provider, model };
});

export function providerFor(provider: AiProviderId): AssistantProvider {
  return provider === 'rules' ? new RuleBasedProvider() : http;
}

interface AssistantStore {
  conversation: ConversationState;
  prefs: AssistantPrefs;
  open: boolean;
  /** The message box contents (shared so a voice transcript can be placed there for review). */
  draft: string;
  setDraft: (text: string) => void;
  /** The shared submission path for typed and spoken requests. */
  send: (text: string, options?: SendOptions) => Promise<ChatMessage | null>;
  approve: (messageId: string) => void;
  reject: (messageId: string) => void;
  refresh: (messageId: string) => void;
  choose: (messageId: string, option: number) => void;
  useAlternative: (messageId: string, index: number) => void;
  cancel: () => void;
  /** Layout options: preview one in the plan and 3D views (uncommitted), apply one, reject all. */
  previewing: { messageId: string; candidateId: string } | null;
  previewLayout: (messageId: string, candidateId: string | null) => void;
  applyLayout: (messageId: string, candidateId: string) => Promise<boolean>;
  rejectLayouts: (messageId: string) => void;
  setPrefs: (patch: Partial<AssistantPrefs>) => void;
  /** Which providers the server has keys for (null until loaded or when there is no server). */
  serverStatus: ProviderStatus | null;
  loadServerStatus: () => Promise<void>;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

const prefs = loadPrefs();
const conversation = new Conversation(editorPort(), providerFor(prefs.provider), prefs);

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  conversation: conversation.state,
  prefs,
  // Open by default where there is room for it beside the side panels.
  open: typeof window !== 'undefined' && window.innerWidth >= 1600,
  draft: '',
  setDraft: (draft) => set({ draft }),
  send: (text, options) => conversation.send(text, options),
  approve: (id) => conversation.approve(id),
  reject: (id) => conversation.reject(id),
  refresh: (id) => conversation.refresh(id),
  choose: (id, option) => conversation.choose(id, option),
  useAlternative: (id, index) => conversation.useAlternative(id, index),
  cancel: () => conversation.cancel(),
  previewing: null,
  previewLayout: (messageId, candidateId) => {
    const m = conversation.state.messages.find((x) => x.id === messageId);
    const c = m && m.role === 'assistant' && m.kind === 'layouts' ? m.result.candidates.find((x) => x.id === candidateId) : undefined;
    const index = c && m && m.role === 'assistant' && m.kind === 'layouts' ? m.result.candidates.indexOf(c) + 1 : 0;
    useEditorStore.getState().previewCandidate(c ? { id: c.id, name: `Option ${index}: ${c.name}`, project: c.after } : null);
    // A preview shows the option in the plan and in 3D side by side.
    if (c && (useEditorStore.getState().view === '3d' || useEditorStore.getState().view === 'plan')) useEditorStore.getState().setView('split');
    set({ previewing: c ? { messageId, candidateId: c.id } : null });
  },
  applyLayout: async (messageId, candidateId) => {
    useEditorStore.getState().previewCandidate(null);
    set({ previewing: null });
    return conversation.applyLayout(messageId, candidateId);
  },
  rejectLayouts: (messageId) => {
    if (get().previewing?.messageId === messageId) {
      useEditorStore.getState().previewCandidate(null);
      set({ previewing: null });
    }
    conversation.rejectLayouts(messageId);
  },
  setPrefs: (patch) => {
    // Switching provider picks that provider's recommended model unless one is given.
    const switched = patch.provider !== undefined && patch.provider !== get().prefs.provider;
    const next = parsePrefs({ ...get().prefs, ...(switched && !patch.model ? { model: undefined } : {}), ...patch });
    savePrefs(next);
    if (switched || next.model !== get().prefs.model) conversation.setProvider(providerFor(next.provider));
    conversation.setSettings(next);
    set({ prefs: next });
  },
  serverStatus: null,
  loadServerStatus: async () => set({ serverStatus: await http.status() }),
  setOpen: (open) => set({ open }),
  reset: () => conversation.reset(),
}));

/** The conversation behind the panel, for the voice controller (same instance, same pipeline). */
export const assistantConversation = () => conversation;

conversation.subscribe((state) => useAssistantStore.setState({ conversation: state }));

useEditorStore.subscribe((s) => {
  if (s.preview?.kind !== 'candidate' && useAssistantStore.getState().previewing) useAssistantStore.setState({ previewing: null });
});

// A new project starts a new conversation: references to another project's objects are meaningless.
let projectId: string | null = null;
useEditorStore.subscribe((s) => {
  const id = s.project?.id ?? null;
  if (id !== projectId) {
    projectId = id;
    conversation.reset();
  }
});

