/**
 * Reply voices. "browser" uses the voices built into the browser (free, offline, quality varies);
 * "gemini" and "openai" are the voices of Google's and OpenAI's assistants, synthesised on the
 * server (`POST /api/speech`) with the server's key. Lists as of 31 Oct 2026, from each vendor's
 * speech docs. Shared by the browser (pickers) and the server, which only accepts listed voices.
 */
import { z } from 'zod';

export const VOICE_ENGINES = ['browser', 'gemini', 'openai'] as const;
export type VoiceEngine = (typeof VOICE_ENGINES)[number];
export type RemoteVoiceEngine = Exclude<VoiceEngine, 'browser'>;

export interface VoiceOption {
  id: string;
  /** Character of the voice, as the vendor describes it ('' when it does not). */
  note: string;
}

export interface RemoteVoiceInfo {
  label: string;
  /** Speech model used on the server. */
  model: string;
  voices: VoiceOption[];
  defaultVoice: string;
}

const v = (id: string, note: string): VoiceOption => ({ id, note });

export const REMOTE_VOICES: Record<RemoteVoiceEngine, RemoteVoiceInfo> = {
  gemini: {
    label: 'Gemini voices',
    model: 'gemini-3.8-flash-tts',
    voices: [
      v('Kore', 'Firm'), v('Puck', 'Upbeat'), v('Zephyr', 'Bright'), v('Charon', 'Informative'), v('Aoede', 'Breezy'),
      v('Leda', 'Youthful'), v('Fenrir', 'Excitable'), v('Orus', 'Firm'), v('Callirrhoe', 'Easy-going'), v('Autonoe', 'Bright'),
      v('Enceladus', 'Breathy'), v('Iapetus', 'Clear'), v('Umbriel', 'Easy-going'), v('Algieba', 'Smooth'), v('Despina', 'Smooth'),
      v('Erinome', 'Clear'), v('Algenib', 'Gravelly'), v('Rasalgethi', 'Informative'), v('Laomedeia', 'Upbeat'), v('Achernar', 'Soft'),
      v('Alnilam', 'Firm'), v('Schedar', 'Even'), v('Gacrux', 'Mature'), v('Pulcherrima', 'Forward'), v('Achird', 'Friendly'),
      v('Zubenelgenubi', 'Casual'), v('Vindemiatrix', 'Gentle'), v('Sadachbia', 'Lively'), v('Sadaltager', 'Knowledgeable'), v('Sulafat', 'Warm'),
    ],
    defaultVoice: 'Kore',
  },
  openai: {
    label: 'ChatGPT voices (OpenAI)',
    model: 'gpt-audio-1.5',
    voices: [
      // OpenAI describes only marin and cedar (best quality); the rest have no published character.
      v('marin', 'Best quality'), v('cedar', 'Best quality'), v('alloy', ''), v('ash', ''), v('ballad', ''),
      v('coral', ''), v('echo', ''), v('sage', ''), v('shimmer', ''), v('verse', ''),
    ],
    defaultVoice: 'marin',
  },
};

export const ENGINE_LABELS: Record<VoiceEngine, string> = { browser: 'Browser voices (offline)', gemini: REMOTE_VOICES.gemini.label, openai: REMOTE_VOICES.openai.label };

/** The reply voice the designer picked. For "browser", `voice` is a browser voice name ('' = the browser's default). */
export interface ReplyVoice {
  engine: VoiceEngine;
  voice: string;
}

export const DEFAULT_REPLY_VOICE: ReplyVoice = { engine: 'gemini', voice: REMOTE_VOICES.gemini.defaultVoice };

/** Reads a saved choice, dropping unknown engines and voices. */
export function parseReplyVoice(raw: unknown): ReplyVoice {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const engine = (VOICE_ENGINES as readonly unknown[]).includes(r.engine) ? (r.engine as VoiceEngine) : DEFAULT_REPLY_VOICE.engine;
  if (engine === 'browser') return { engine, voice: typeof r.voice === 'string' ? r.voice.slice(0, 200) : '' };
  const info = REMOTE_VOICES[engine];
  return { engine, voice: info.voices.some((x) => x.id === r.voice) ? (r.voice as string) : info.defaultVoice };
}

export const SPEECH_MAX_CHARS = 300;

/** What the browser sends to `/api/speech`; validated against the lists above on the server. */
export const SpeechRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(SPEECH_MAX_CHARS),
    engine: z.enum(['gemini', 'openai']),
    voice: z.string().min(1).max(40),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  })
  .strict()
  .refine((r) => REMOTE_VOICES[r.engine].voices.some((x) => x.id === r.voice), { message: 'That voice is not offered.' });
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
