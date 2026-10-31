// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ProviderError } from '@/ai/providers/types';
import { referenceToResponse, type ReferenceAnalysis } from '@/ai/vision';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { createReferenceHandler, createRenderHandler, referenceAnalyser } from './vision';

const post = (path: string, b: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost:5173${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b) });
const quiet = () => undefined;
const img = 'A'.repeat(400);
const analysis: ReferenceAnalysis = {
  style: 'Japandi',
  summary: 'Warm minimal oak and stone.',
  finishes: { shutter: { name: 'Light oak', color: '#c8a77e', texture: 'wood', roughness: 0.5 }, floor: { name: 'Pale concrete', color: '#bdb8b0', texture: 'concrete', roughness: 0.7 }, wall: { name: 'Chalk white', color: '#f1eee8', texture: 'plaster', roughness: 0.9 } },
  kitchenShape: 'l-shaped',
  room: { widthMm: 3600, lengthMm: 3000, confidence: 'medium' },
  features: ['handleless fronts'],
};

describe('/api/render', () => {
  it('returns the rendered image and validates the request', async () => {
    const handler = createRenderHandler({ env: {}, log: quiet, run: async () => ({ data: new Uint8Array([255, 216, 255]), mimeType: 'image/jpeg' }) });
    const res = await handler(post('/api/render', { image: img, mimeType: 'image/jpeg', aspectRatio: '16:9' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect((await handler(post('/api/render', { image: 'not base64!', mimeType: 'image/jpeg' }))).status).toBe(400);
    expect((await handler(post('/api/render', { image: img, mimeType: 'image/gif' }))).status).toBe(400);
    expect((await handler(post('/api/render', { image: img, mimeType: 'image/jpeg' }, { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('says when the key is missing and maps quota errors', async () => {
    const missing = await createRenderHandler({ env: {}, log: quiet })(post('/api/render', { image: img, mimeType: 'image/jpeg' }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: { message: expect.stringContaining('GEMINI_API_KEY') } });
    const limited = await createRenderHandler({ env: {}, log: quiet, run: () => Promise.reject(new ProviderError('rate_limited', 'slow', true, 9)) })(post('/api/render', { image: img, mimeType: 'image/jpeg' }));
    expect(limited.status).toBe(429);
  });
});

describe('/api/reference', () => {
  it('returns the structured reading of photos or video frames', async () => {
    const handler = createReferenceHandler({ env: {}, log: quiet, run: async () => analysis });
    const res = await handler(post('/api/reference', { images: [img, img], kind: 'video', note: 'like this' }));
    expect(await res.json()).toMatchObject({ ok: true, analysis: { style: 'Japandi' } });
    expect((await handler(post('/api/reference', { images: Array(9).fill(img), kind: 'photo' }))).status).toBe(400);
  });

  it('asks Gemini for JSON in the agreed shape and rejects anything else', async () => {
    const reply = (text: string) => (async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] }), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const ok = await referenceAnalyser({ GEMINI_API_KEY: 'k' }, reply(JSON.stringify(analysis)))({ images: [img], kind: 'photo' });
    expect(ok.finishes.shutter?.texture).toBe('wood');
    await expect(referenceAnalyser({ GEMINI_API_KEY: 'k' }, reply('{"style": 3}'))({ images: [img], kind: 'photo' })).rejects.toMatchObject({ code: 'malformed_output' });
  });
});

describe('reference → proposal', () => {
  const project = createProject({ name: 'Ref', room: DEFAULT_ROOM, layout: 'straight' }, sequentialIds());

  it('creates the finishes and applies them to every cabinet and surface by default', () => {
    const r = referenceToResponse(analysis, 'make it look like this', project);
    expect(r.kind).toBe('plan');
    const ops = r.kind === 'plan' ? r.operations : [];
    expect(ops).toEqual(expect.arrayContaining([
      { op: 'create_finish', name: 'Light oak', category: 'shutter', color: '#c8a77e', texture: 'wood', roughness: 0.5 },
      { op: 'set_finish', target: { query: { kind: 'cabinet', all: true } }, finish: 'Light oak' },
      { op: 'set_surface_finish', surface: 'floor', finish: 'Pale concrete' },
    ]));
    expect(ops.some((o) => o.op === 'set_room')).toBe(false);
  });

  it('uses the room size only when asked and estimated with some confidence; the shape as a layout goal', () => {
    const sized = referenceToResponse(analysis, 'use the same room size and colours', project);
    expect(sized.kind === 'plan' && sized.operations.find((o) => o.op === 'set_room')).toMatchObject({ width: 3600, length: 3000 });
    const unsure = referenceToResponse({ ...analysis, room: { confidence: 'low' }, finishes: {} }, 'same room size', project);
    expect(unsure).toMatchObject({ kind: 'answer', text: expect.stringContaining('could not estimate the room size') });
    expect(referenceToResponse({ ...analysis, finishes: {} }, 'copy this layout', project)).toMatchObject({ kind: 'design', objective: { topology: 'l-shaped' } });
  });
});
