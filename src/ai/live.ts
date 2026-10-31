/**
 * Realtime voice conversation with Gemini Live: speech in, speech out, streamed both ways, with the
 * model's own turn detection and barge-in. The model works through the same typed tools as the chat
 * assistant (toolLoop.ts): it reads the project with the read-only tools and changes it only by
 * proposing changes, which the app validates, previews and applies after the designer says so.
 *
 * Shared by the server (which locks this configuration into a short-lived token, so the browser can
 * neither change the instructions and tools nor see the API key) and the browser (which connects).
 */
import { z } from 'zod';
import { ALL_TOOLS, SYSTEM_PROMPT, type ToolDef } from './providers/toolLoop';

/** Low-latency native-audio Live model (Gemini API docs, Oct 2026). */
export const LIVE_MODEL = 'gemini-3.8-live';

/** Tools only a spoken conversation needs: approval and ending happen by voice. */
export const VOICE_TOOLS: ToolDef[] = [
  {
    name: 'apply_pending_change',
    description: 'Apply the change preview that is waiting for approval. Call it only right after the designer clearly said to apply it ("apply", "yes, do it", "go ahead"). Never on your own initiative.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'reject_pending_change',
    description: 'Discard the change preview that is waiting for approval, when the designer says no or reject.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'choose_layout_option',
    description: 'Apply one of the layout options shown, when the designer picks it by number ("apply option two").',
    schema: { type: 'object', properties: { option: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['option'], additionalProperties: false },
  },
  {
    name: 'end_conversation',
    description: 'End the voice conversation when the designer says goodbye or that they are done. Say a brief goodbye first.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export const LIVE_TOOLS: ToolDef[] = [...ALL_TOOLS, ...VOICE_TOOLS];

/** The operation names propose_changes accepts, read from its schema (realtime models follow a list better than a nested schema). */
function operationNames(): string[] {
  const schema = ALL_TOOLS.find((t) => t.name === 'propose_changes')?.schema as { properties?: { operations?: { items?: { anyOf?: { properties?: { op?: { const?: string } } }[] } } } } | undefined;
  return (schema?.properties?.operations?.items?.anyOf ?? []).map((v) => v.properties?.op?.const).filter((x): x is string => !!x);
}

export const LIVE_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are talking with the designer by voice, in real time:
- Speak briefly and naturally: one or two short sentences. Never read out ids, JSON, tables or long lists; say "the sink unit on the back wall", not its id. Use the project's display unit.
- Every edit goes through propose_changes (or plan_layout). Each operation's "op" must be one of: ${operationNames().join(', ')} (for example a size change is "resize").
- A proposal is only a preview: nothing has changed yet. Describe it as a preview, e.g. "Here's a preview: the sink unit goes from 720 to 750 millimetres high. Say apply or reject." Never say "I've changed" or "I've updated" before it is applied. Only call apply_pending_change after they say so; after it succeeds, say it is done.
- Answers and information: call reply with a short text (and "show" for tables, which appear on screen), then say the answer in a sentence.
- If the designer interrupts you, stop and listen.
- When they say goodbye or that they are done, say a short goodbye and call end_conversation.`;

/** Body of `POST /api/live-token`: the Gemini voice to speak with (checked against the voice list on the server). */
export const LiveTokenRequestSchema = z.object({ voice: z.string().min(1).max(40).optional() }).strict();

/** The Live session configuration (plain data in the SDK's LiveConnectConfig shape). */
export function liveConfig(voice: string) {
  return {
    responseModalities: ['AUDIO'],
    systemInstruction: LIVE_SYSTEM_PROMPT,
    tools: [{ functionDeclarations: LIVE_TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // The server's voice activity detection decides when the designer has finished, and lets them interrupt.
    // Low start sensitivity: a little leftover echo of the model's own voice should not count as the designer talking.
    realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', silenceDurationMs: 600, prefixPaddingMs: 200 } },
    // Long conversations: older turns are compressed instead of the session ending; reconnects resume.
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: {},
  };
}

export type LiveConfig = ReturnType<typeof liveConfig>;

/** What `/api/live-token` returns: a single-use token locked to this model and configuration. */
export const LiveTokenSchema = z.object({ token: z.string().min(1), model: z.string(), voice: z.string(), expiresAt: z.string() });
export type LiveToken = z.infer<typeof LiveTokenSchema>;
