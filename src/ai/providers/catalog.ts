/**
 * AI providers and the models offered for each: the five strongest current text models with tool
 * calling, best first (as of 31 Oct 2026, from each vendor's model list). Shared by the browser
 * (pickers) and the server, which only accepts models listed here — a request cannot choose an
 * arbitrary or unlisted model. "rules" is the built-in deterministic assistant (no AI, no key).
 */
import { z } from 'zod';

export const AI_PROVIDERS = ['gemini', 'anthropic', 'openai', 'rules'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export interface ProviderInfo {
  id: AiProviderId;
  label: string;
  /** Server environment variables that enable it (any one). */
  keyEnv: string[];
  models: ModelOption[];
  defaultModel: string;
}

export const PROVIDER_CATALOG: Record<AiProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    models: [
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'Flagship reasoning model' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Fast; strongest Flash for agent work' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'Previous Pro generation' },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Previous Flash generation' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fastest, lowest cost' },
    ],
    defaultModel: 'gemini-3.8-flash',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    keyEnv: ['ANTHROPIC_API_KEY'],
    models: [
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable; slower and highest cost' },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Frontier model; recommended' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Fast and capable' },
      { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'Previous Opus generation' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest, lowest cost' },
    ],
    defaultModel: 'claude-opus-5-5',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    keyEnv: ['OPENAI_API_KEY'],
    models: [
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', note: 'Most capable; highest cost' },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: 'Near-Astra at lower cost; recommended' },
      { id: 'gpt-6-sol', label: 'GPT-6 Sol', note: 'Complex coding and agent work' },
      { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', note: 'Fast and efficient' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', note: 'Lowest cost' },
    ],
    defaultModel: 'gpt-6.1-sol',
  },
  rules: {
    id: 'rules',
    label: 'Built-in rules (no AI)',
    keyEnv: [],
    models: [{ id: 'rules-v1', label: 'Deterministic rules', note: 'No key needed; common phrasings only' }],
    defaultModel: 'rules-v1',
  },
};

export const DEFAULT_PROVIDER: AiProviderId = 'gemini';

/** What the browser asks for; validated against the catalog on the server. */
export const AiSelectionSchema = z
  .object({ provider: z.enum(AI_PROVIDERS), model: z.string().trim().min(1).max(60) })
  .strict()
  .refine((s) => PROVIDER_CATALOG[s.provider].models.some((m) => m.id === s.model), { message: 'That model is not offered for this provider.' });
export type AiSelection = z.infer<typeof AiSelectionSchema>;

export const defaultSelection = (provider: AiProviderId = DEFAULT_PROVIDER): AiSelection => ({ provider, model: PROVIDER_CATALOG[provider].defaultModel });

/** Provider availability reported by GET /api/assistant (never the keys themselves). */
export const ProviderStatusSchema = z.object({
  defaultProvider: z.enum(AI_PROVIDERS),
  providers: z.array(z.object({ id: z.enum(AI_PROVIDERS), configured: z.boolean() })),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
