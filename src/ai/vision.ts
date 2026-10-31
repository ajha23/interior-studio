/**
 * Photos and video as design input, and photoreal renders as output (Gemini, through the server).
 * A reference is read into structured data (`ReferenceAnalysis`); `referenceToResponse` turns it into
 * an ordinary assistant reply — new finishes plus where to use them, or a layout goal — which goes
 * through the same validation, preview and approval as anything typed.
 */
import { z } from 'zod';
import { MaterialTextureSchema, type KitchenProject, type MaterialCategory } from '@/domain';
import type { AssistantResponse, AssistantOperation } from './schema';

/** Vision and image models (Gemini API docs, Oct 2026). */
export const VISION_MODEL = 'gemini-3.8-flash';
export const IMAGE_MODEL = 'gemini-nano-banana-2.1';

const Base64Image = z.string().min(100).max(1_400_000).regex(/^[A-Za-z0-9+/=]+$/, 'not base64');

export const RenderRequestSchema = z
  .object({
    image: Base64Image.max(3_000_000),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    aspectRatio: z.enum(['16:9', '4:3', '3:2', '1:1', '3:4', '9:16']).default('16:9'),
    lighting: z.enum(['daylight', 'evening']).default('daylight'),
    style: z.string().trim().max(300).optional(),
  })
  .strict();

export const ReferenceRequestSchema = z
  .object({
    images: z.array(Base64Image).min(1).max(8),
    kind: z.enum(['photo', 'video']),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const FinishSeen = z.object({ name: z.string().trim().min(1).max(40), color: Hex, texture: MaterialTextureSchema, roughness: z.number().min(0).max(1) });

export const ReferenceAnalysisSchema = z.object({
  style: z.string().trim().max(60),
  summary: z.string().trim().max(400),
  finishes: z.object({ shutter: FinishSeen.optional(), countertop: FinishSeen.optional(), floor: FinishSeen.optional(), wall: FinishSeen.optional(), carcass: FinishSeen.optional() }),
  kitchenShape: z.enum(['straight', 'l-shaped', 'u-shaped', 'galley', 'island', 'none', 'unknown']),
  room: z.object({ widthMm: z.number().int().min(1500).max(12000).optional(), lengthMm: z.number().int().min(1500).max(12000).optional(), heightMm: z.number().int().min(2100).max(4000).optional(), confidence: z.enum(['low', 'medium', 'high']) }),
  features: z.array(z.string().trim().max(80)).max(10),
});
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;

const finishJson = {
  type: 'object',
  properties: { name: { type: 'string' }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, texture: { type: 'string', enum: MaterialTextureSchema.options }, roughness: { type: 'number', minimum: 0, maximum: 1 } },
  required: ['name', 'color', 'texture', 'roughness'],
};

/** The same shape as JSON Schema, for the model's structured output. */
export const REFERENCE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    style: { type: 'string', description: 'Design style in a few words, e.g. "Japandi", "Modern farmhouse"' },
    summary: { type: 'string', description: 'One or two sentences on what defines the look' },
    finishes: { type: 'object', properties: { shutter: finishJson, countertop: finishJson, floor: finishJson, wall: finishJson, carcass: finishJson } },
    kitchenShape: { type: 'string', enum: ['straight', 'l-shaped', 'u-shaped', 'galley', 'island', 'none', 'unknown'] },
    room: { type: 'object', properties: { widthMm: { type: 'integer' }, lengthMm: { type: 'integer' }, heightMm: { type: 'integer' }, confidence: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['confidence'] },
    features: { type: 'array', items: { type: 'string' }, description: 'Notable details: handles, open shelving, lighting…' },
  },
  required: ['style', 'summary', 'finishes', 'kitchenShape', 'room', 'features'],
};

const SURFACES: { key: MaterialCategory; label: string }[] = [
  { key: 'shutter', label: 'cabinet fronts' },
  { key: 'countertop', label: 'worktop' },
  { key: 'floor', label: 'floor' },
  { key: 'wall', label: 'walls' },
  { key: 'carcass', label: 'carcasses' },
];

/** What the designer asked for, read from their note (finishes by default). */
export function referenceIntent(note: string): { finishes: boolean; layout: boolean; size: boolean } {
  const t = note.toLowerCase();
  const layout = /\b(layout|shape|arrangement|same kitchen|plan)\b/.test(t);
  const size = /\b(size|dimension|measure|room size|same room)\b/.test(t);
  const finishesOnly = /\b(colou?rs?|finish|material|look|style|palette|skin|texture)\b/.test(t);
  return { finishes: finishesOnly || (!layout && !size), layout, size };
}

/**
 * The reply that applies a reference: finishes (new ones, applied to all cabinets and each surface),
 * the room size when asked and estimated with some confidence, or the kitchen shape as a layout goal.
 */
export function referenceToResponse(a: ReferenceAnalysis, note: string, project: KitchenProject): AssistantResponse {
  const want = referenceIntent(note);
  const ops: AssistantOperation[] = [];
  const said: string[] = [];
  if (want.finishes) {
    for (const { key, label } of SURFACES) {
      const f = a.finishes[key];
      if (!f) continue;
      const name = `${f.name}`.slice(0, 40);
      ops.push({ op: 'create_finish', name, category: key, color: f.color, texture: f.texture, roughness: f.roughness });
      if (key === 'shutter') {
        if (project.cabinets.length) ops.push({ op: 'set_finish', target: { query: { kind: 'cabinet', all: true } }, finish: name });
      } else ops.push({ op: 'set_surface_finish', surface: key, finish: name });
      said.push(`${label}: ${f.name.toLowerCase()}`);
    }
  }
  if (want.size && a.room.confidence !== 'low' && (a.room.widthMm || a.room.lengthMm)) {
    ops.push({ op: 'set_room', ...(a.room.widthMm ? { width: a.room.widthMm } : {}), ...(a.room.lengthMm ? { length: a.room.lengthMm } : {}), ...(a.room.heightMm ? { height: a.room.heightMm } : {}) });
    said.push(`room about ${a.room.widthMm ?? project.room.width} × ${a.room.lengthMm ?? project.room.length} mm (estimated, ${a.room.confidence} confidence)`);
  }
  const shape = a.kitchenShape;
  if (want.layout && !ops.length && (shape === 'straight' || shape === 'l-shaped' || shape === 'u-shaped' || shape === 'galley')) {
    return { kind: 'design', explanation: `A ${shape} layout like the reference (${a.style}).`, objective: { goal: `Match the reference: ${a.summary}`.slice(0, 200), topology: shape } as never };
  }
  if (!ops.length) {
    const sizeNote = want.size && a.room.confidence === 'low' ? ' I could not estimate the room size reliably from it, so I left the size alone.' : '';
    return { kind: 'answer', text: `${a.style}: ${a.summary}${a.features.length ? ` Details: ${a.features.join(', ')}.` : ''}${sizeNote}` };
  }
  return { kind: 'plan', explanation: `Match the ${a.style} reference — ${said.join('; ')}.${a.features.length ? ` Also in the reference: ${a.features.slice(0, 4).join(', ')}.` : ''}`.slice(0, 600), operations: ops };
}
