import { describe, expect, it } from 'vitest';
import { LIVE_MODEL } from '@/ai/live';
import { pcm16ToFloat, toBase64, fromBase64 } from './audio';
import { startLiveSession, type LiveCallbacks, type LiveMessage } from './session';

/** A scripted Live connection, microphone and player. */
function harness(options: { echoCancelled?: boolean; tokenStatus?: number } = {}) {
  const sent: { audio: number; toolResponses: unknown[]; context: string[]; streamEnd: number } = { audio: 0, toolResponses: [], context: [], streamEnd: 0 };
  let server!: { onmessage: (m: LiveMessage) => void; onclose: (e: { code: number; reason: string }) => void };
  let micChunk!: (b64: string) => void;
  const player = { echoCancelled: options.echoCancelled ?? true, onIdle: null as (() => void) | null, playing: false, queued: [] as string[], flushed: 0, closed: false, enqueue(d: string) { this.queued.push(d); this.playing = true; }, flush() { this.flushed++; this.playing = false; }, async suspend() {}, async resume() {}, close() { this.closed = true; }, async start() {} };
  const events: string[] = [];
  const calls: { name: string; userText: string }[] = [];
  let context = { key: '1', text: '<project_state>A</project_state>' };
  const cb: LiveCallbacks = {
    onPhase: (p) => events.push(`phase:${p}`),
    onUserSpeech: (t) => events.push(`user:${t}`),
    onModelSpeech: (t) => events.push(`model:${t}`),
    onToolCall: async (c, turn) => (calls.push({ name: c.name, userText: turn.userText }), { output: `ran ${c.name}` }),
    onTurnComplete: (t) => events.push(`turn:${t.userText}|${t.modelText}|${t.toolUsed}`),
    onClose: (r) => events.push(`close:${r.message}`),
    context: () => context,
  };
  const start = () =>
    startLiveSession('Puck', cb, {
      fetchImpl: (async () => new Response(JSON.stringify(options.tokenStatus ? { ok: false, error: { code: 'unavailable', message: 'Realtime voice needs GEMINI_API_KEY on the server.' } } : { ok: true, token: 'auth_tokens/t', model: LIVE_MODEL, voice: 'Puck', expiresAt: 'x' }), { status: options.tokenStatus ?? 200 })) as unknown as typeof fetch,
      connect: async (_token, _model, _config, handlers) => {
        server = handlers;
        return {
          sendRealtimeInput: (p) => (p.audio ? sent.audio++ : p.audioStreamEnd ? sent.streamEnd++ : undefined),
          sendToolResponse: (p) => sent.toolResponses.push(p),
          sendClientContent: (p) => sent.context.push(p.turns[0]!.parts[0]!.text),
          close: () => undefined,
        };
      },
      openMic: async (onChunk) => ((micChunk = onChunk), { paused: false, close: () => undefined }),
      createPlayer: () => player,
    });
  return { start, sent, player, events, calls, server: () => server, mic: (d = 'AAAA') => micChunk(d), setContext: (c: typeof context) => (context = c) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('realtime voice session', () => {
  it('streams microphone audio, plays the reply as it arrives, and captions both sides', async () => {
    const h = harness();
    const handle = await h.start();
    expect(handle.model).toBe(LIVE_MODEL);
    expect(h.sent.context).toEqual(['<project_state>A</project_state>']);
    h.mic();
    h.mic();
    expect(h.sent.audio).toBe(2);
    h.server().onmessage({ serverContent: { interimInputTranscription: { text: 'how many cab' } } });
    h.server().onmessage({ serverContent: { inputTranscription: { text: 'How many cabinets?' } } });
    h.server().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] }, outputTranscription: { text: 'There are ' } } });
    h.server().onmessage({ serverContent: { outputTranscription: { text: 'nine.' }, turnComplete: true } });
    expect(h.player.queued).toEqual(['AAA=']);
    expect(h.events).toEqual(['phase:connecting', 'phase:listening', 'user:how many cab', 'user:How many cabinets?', 'phase:speaking', 'model:There are', 'model:There are nine.', 'turn:How many cabinets?|There are nine.|false']);
  });

  it('flushes playback when the designer interrupts', async () => {
    const h = harness();
    await h.start();
    h.server().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] } } });
    h.server().onmessage({ serverContent: { interrupted: true } });
    expect(h.player.flushed).toBe(1);
    expect(h.events.at(-1)).toBe('phase:listening');
  });

  it('runs tool calls with the words heard so far and sends the results back', async () => {
    const h = harness();
    await h.start();
    h.server().onmessage({ serverContent: { inputTranscription: { text: 'apply it' } } });
    h.server().onmessage({ toolCall: { functionCalls: [{ id: 'c1', name: 'apply_pending_change', args: {} }] } });
    await flush();
    expect(h.calls).toEqual([{ name: 'apply_pending_change', userText: 'apply it' }]);
    expect(h.sent.toolResponses).toEqual([{ functionResponses: [{ id: 'c1', name: 'apply_pending_change', response: { output: 'ran apply_pending_change' } }] }]);
    h.server().onmessage({ serverContent: { turnComplete: true, outputTranscription: { text: 'Done.' } } });
    expect(h.events.slice(-2)).toEqual(['turn:apply it|Done.|true', 'phase:listening']);
  });

  it('resends the project between turns only when it changed', async () => {
    const h = harness();
    await h.start();
    h.server().onmessage({ serverContent: { inputTranscription: { text: 'hi' }, turnComplete: true } });
    expect(h.sent.context).toHaveLength(1);
    h.setContext({ key: '2', text: '<project_state>B</project_state>' });
    h.server().onmessage({ serverContent: { inputTranscription: { text: 'hi' }, turnComplete: true } });
    expect(h.sent.context).toEqual(['<project_state>A</project_state>', '<project_state>B</project_state>']);
  });

  it('without echo cancellation the microphone is muted while the reply plays', async () => {
    const h = harness({ echoCancelled: false });
    await h.start();
    h.server().onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] } } });
    h.mic();
    expect(h.sent.audio).toBe(0);
    h.player.playing = false;
    h.mic();
    expect(h.sent.audio).toBe(1);
  });

  it('hold stops sending audio; a dropped connection is reported; the token error is passed on', async () => {
    const h = harness();
    const handle = await h.start();
    handle.pause();
    h.mic();
    expect(h.sent.audio).toBe(0);
    expect(h.sent.streamEnd).toBe(1);
    handle.resume();
    h.mic();
    expect(h.sent.audio).toBe(1);
    h.server().onclose({ code: 1011, reason: 'internal' });
    expect(h.events.at(-1)).toBe('close:The realtime session closed (internal).');
    expect(h.player.closed).toBe(true);

    await expect(harness({ tokenStatus: 503 }).start()).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('GEMINI_API_KEY') });
  });
});

describe('PCM helpers', () => {
  it('round-trips base64 and converts 16-bit samples', () => {
    const bytes = new Uint8Array([0, 0, 0xff, 0x7f, 0x00, 0x80]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    const f = pcm16ToFloat(bytes);
    expect(f[0]).toBe(0);
    expect(f[1]).toBeCloseTo(1, 3);
    expect(f[2]).toBe(-1);
  });
});
