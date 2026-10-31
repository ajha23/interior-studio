/**
 * Voice → transcript → the shared conversation → validated preview → approval → editor, with a
 * fake speech engine (no microphone, no network) and the deterministic assistant provider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/ai/conversation';
import { allElements, createProject, DEFAULT_ROOM, offsetAlongWall, type KitchenProject } from '@/domain';
import { elementBox } from '@/engine/geometry/box';
import { buildParts } from '@/engine/geometry/parts';
import { localToRoom } from '@/engine/geometry/transform';
import { sequentialIds } from '@/test/ids';
import type { VoiceController } from '@/voice/controller';
import { createSpeechProvider, SpeechError, SPEECH_MESSAGES, type SpeechStartOptions, type SpeechToTextProvider } from '@/voice/speech';
import type { TextToSpeech } from '@/voice/synthesis';
import { assistantConversation, useAssistantStore } from './assistantStore';
import { useEditorStore } from './editorStore';
import { createVoiceController } from './voiceStore';

class FakeSpeech implements SpeechToTextProvider {
  readonly id = 'fake';
  readonly notice = 'Fake engine';
  opts: SpeechStartOptions | null = null;
  starts = 0;
  stops = 0;
  failStart: SpeechError | null = null;
  async start(o: SpeechStartOptions) {
    this.starts++;
    if (this.failStart) throw this.failStart;
    this.opts = o;
  }
  async stop() {
    this.stops++;
  }
  async cancel() {
    this.opts?.onEnd();
  }
  open() {
    this.opts!.onStart?.();
  }
  interim(t: string) {
    this.opts!.onResult({ transcript: t, isFinal: false });
  }
  final(t: string) {
    this.opts!.onResult({ transcript: t, isFinal: true, confidence: 0.9 });
  }
  end() {
    this.opts!.onEnd();
  }
  error(code: SpeechError['code']) {
    this.opts!.onError(new SpeechError(code, SPEECH_MESSAGES[code]));
  }
  /** A whole utterance: permission → listening → interim → final → end. */
  async say(text: string, voice: VoiceController) {
    await voice.start();
    this.open();
    this.interim(text.split(' ').slice(0, 2).join(' '));
    this.final(text);
    this.end();
    await settle();
  }
}

class FakeTts implements TextToSpeech {
  readonly supported = true;
  spoken: string[] = [];
  speaking = false;
  private done: (() => void) | undefined;
  speak(text: string, o?: { onEnd?: () => void }) {
    this.spoken.push(text);
    this.speaking = true;
    this.done = o?.onEnd;
  }
  stop() {
    this.speaking = false;
  }
  finish() {
    this.speaking = false;
    this.done?.();
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const editor = () => useEditorStore.getState();
const project = () => editor().project!;
const messages = () => assistantConversation().state.messages;
const last = (): ChatMessage => messages().at(-1)!;
const proposals = () => messages().filter((m) => m.role === 'assistant' && m.kind === 'proposal');

let speech: FakeSpeech;
let tts: FakeTts;
let voice: VoiceController;
let states: string[];

function open(p: KitchenProject) {
  editor().openProject(p);
  speech = new FakeSpeech();
  tts = new FakeTts();
  voice = createVoiceController({ provider: speech, tts, language: () => 'en-GB' });
  states = [];
  voice.subscribe((s) => {
    if (states.at(-1) !== s.status) states.push(s.status);
  });
}

beforeEach(() => {
  localStorage.clear();
  // The deterministic provider in the browser: same pipeline, no network.
  useAssistantStore.getState().setPrefs({ provider: 'offline', autoApply: false });
  useAssistantStore.getState().setDraft('');
  assistantConversation().reset();
  open(createProject({ name: 'Voice', room: DEFAULT_ROOM, layout: 'empty' }, sequentialIds()));
});
afterEach(() => voice.dispose());

describe('voice lifecycle', () => {
  it('moves through requesting permission, listening, processing and speaking, then idles', async () => {
    await voice.start();
    expect(voice.state.status).toBe('requesting-permission');
    speech.open();
    expect(voice.state.status).toBe('listening');
    speech.interim('create a nine');
    expect(voice.state.interim).toBe('create a nine');
    speech.final('create a nine hundred millimetre base cabinet');
    speech.end();
    await settle();
    expect(states).toEqual(['requesting-permission', 'listening', 'processing', 'speaking']);
    expect(tts.spoken).toEqual([expect.stringMatching(/^The change is ready to preview\. .* Say apply, or reject\.$/)]);
    tts.finish();
    expect(voice.state.status).toBe('idle');
    expect(voice.state).toMatchObject({ heard: 'create a nine hundred millimetre base cabinet', sent: 'create a 900 mm base cabinet' });
  });

  it('falls back to text when the browser has no speech recognition', async () => {
    expect(createSpeechProvider({})).toBeNull();
    const v = createVoiceController({ provider: null, tts });
    expect(v.state).toMatchObject({ supported: false, status: 'error', error: { code: 'unsupported', message: expect.stringMatching(/Type your request instead/) } });
    await v.start();
    expect(v.state.status).toBe('error');
    // Text keeps working.
    await assistantConversation().send('Create a 900 mm base cabinet');
    expect(last()).toMatchObject({ kind: 'proposal', status: 'proposed' });
  });

  it('explains a denied microphone and a missing one', async () => {
    await voice.start();
    speech.error('permission-denied');
    expect(voice.state).toMatchObject({ status: 'error', error: { code: 'permission-denied', message: expect.stringMatching(/Microphone access is blocked/) } });
    speech.failStart = new SpeechError('no-microphone', SPEECH_MESSAGES['no-microphone']);
    await voice.start();
    expect(voice.state.error).toMatchObject({ code: 'no-microphone', message: expect.stringMatching(/No microphone/) });
    expect(messages()).toHaveLength(0);
  });

  it('interim results never submit; a partial utterance is offered for editing, not sent', async () => {
    await voice.start();
    speech.open();
    speech.interim('delete the');
    speech.interim('delete the fridge');
    speech.end();
    await settle();
    expect(messages()).toHaveLength(0);
    expect(useAssistantStore.getState().draft).toBe('delete the fridge');
    expect(voice.state.error?.message).toMatch(/only caught part/);
  });

  it('submits a final transcript exactly once, even when the engine repeats or revises it', async () => {
    await voice.start();
    speech.open();
    speech.final('create a 900 mm base cabinet');
    speech.final('create a 900 mm base cabinet');
    speech.final('create a 600 mm base cabinet');
    speech.end();
    await settle();
    expect(messages().filter((m) => m.role === 'user')).toEqual([expect.objectContaining({ text: 'create a 900 mm base cabinet', source: 'voice' })]);
    expect(proposals()).toHaveLength(1);
    expect(speech.stops).toBe(1);
  });

  it('a cancelled session submits nothing, even if a final result arrives afterwards', async () => {
    await voice.start();
    speech.open();
    speech.interim('delete everything');
    const opts = speech.opts!;
    await voice.cancel();
    opts.onResult({ transcript: 'delete the cabinet', isFinal: true });
    await settle();
    expect(messages()).toHaveLength(0);
    expect(voice.state.status).toBe('idle');
  });

  it('“stop listening” and “cancel” are controls, never requests', async () => {
    await speech.say('Stop listening.', voice);
    await speech.say('never mind', voice);
    expect(messages()).toHaveLength(0);
  });

  it('stops listening after the time limit', async () => {
    vi.useFakeTimers();
    try {
      const v = createVoiceController({ provider: speech, tts, maxListenMs: 1000 });
      await v.start();
      speech.open();
      vi.advanceTimersByTime(1001);
      expect(speech.stops).toBe(1);
      v.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('review mode puts the transcript in the text box instead of sending it', async () => {
    voice.setPrefs({ reviewBeforeSending: true });
    await speech.say('make the room twelve feet wide', voice);
    expect(messages()).toHaveLength(0);
    expect(useAssistantStore.getState().draft).toBe('make the room 12 ft wide');
  });
});

describe('voice uses the Phase 2 pipeline', () => {
  it('spoken dimensions keep their units; the change waits for approval; “apply” commits; undo and redo work', async () => {
    await speech.say('create a base cabinet nine hundred millimetres wide', voice);
    expect(project().cabinets).toHaveLength(0);
    expect(last()).toMatchObject({ kind: 'proposal', status: 'proposed' });
    tts.finish();
    await speech.say('Apply.', voice);
    expect(project().cabinets).toEqual([expect.objectContaining({ dimensions: { width: 900, height: 720, depth: 560 } })]);
    expect(tts.spoken.at(-1)).toBe('The change was applied.');
    const id = project().cabinets[0]!.id;

    await speech.say('make it two foot six high', voice); // 30 in = 762 mm
    await speech.say('apply', voice);
    expect(project().cabinets[0]!.dimensions.height).toBe(762);

    await speech.say('undo that last change', voice);
    expect(project().cabinets[0]!.dimensions.height).toBe(720);
    await speech.say('redo', voice);
    expect(project().cabinets[0]!.dimensions.height).toBe(762);
    expect(project().cabinets[0]!.id).toBe(id);
  });

  it('“reject” leaves the project unchanged; “apply” with nothing pending does nothing', async () => {
    await speech.say('add a 600 mm base cabinet', voice);
    await speech.say('reject', voice);
    expect(proposals().at(-1)).toMatchObject({ status: 'rejected' });
    expect(project().cabinets).toHaveLength(0);
    await speech.say('apply', voice);
    expect(voice.state.error).toMatchObject({ code: 'nothing-pending' });
    expect(project().cabinets).toHaveLength(0);
  });

  it('ambiguous instructions ask instead of guessing', async () => {
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'base', id: 'a', placement: { wallId: 'back', offset: 0 } });
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'base', id: 'b', placement: { wallId: 'left', offset: 1200 } });
    editor().select(null);
    await speech.say('move this base cabinet one hundred millimetres to the left', voice);
    expect(last()).toMatchObject({ kind: 'clarify' });
    expect(tts.spoken.at(-1)).toMatch(/Which/);
  });

  it('invalid geometry is rejected with the reason, and the model is unchanged', async () => {
    editor().dispatch({ type: 'add_opening', kind: 'door', id: 'door', wallId: 'back', offset: 1500 });
    const before = project();
    await speech.say('add a cabinet that overlaps the door', voice);
    expect(last()).toMatchObject({ kind: 'proposal', status: 'failed' });
    expect(tts.spoken.at(-1)).toMatch(/^That change can't be made\. .*door/);
    expect(project()).toBe(before);
  });

  it('“this” is the selection at the time of speaking; plan and 3D stay in sync', async () => {
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'base', id: 'a', placement: { wallId: 'back', offset: 0 } });
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'base', id: 'b', placement: { wallId: 'back', offset: 1200 } });
    editor().select('b');
    await speech.say('move this base cabinet three hundred millimetres to the left', voice);
    await speech.say('apply', voice);
    const b = allElements(project()).find((e) => e.id === 'b')!;
    expect(offsetAlongWall(b)).toBe(900);
    for (const el of allElements(project())) {
      const pts = buildParts(el).filter((p) => p.body).flatMap((p) => [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => localToRoom(el, { x: p.center.x + (sx * p.size.x) / 2, y: p.center.y + (sy * p.size.y) / 2, z: p.center.z + (sz * p.size.z) / 2 })))));
      expect(Math.min(...pts.map((q) => q.x))).toBeCloseTo(elementBox(el).minX);
      expect(Math.max(...pts.map((q) => q.z))).toBeCloseTo(elementBox(el).maxZ);
    }
  });

  it('a selection change while the request is processed does not retarget it', async () => {
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'base', id: 'a', placement: { wallId: 'back', offset: 0 } });
    editor().dispatch({ type: 'add_cabinet', cabinetType: 'base', id: 'b', placement: { wallId: 'back', offset: 1200 } });
    editor().select('a');
    // Hold the provider's reply until the selection has changed.
    const conversation = assistantConversation();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const provider = (conversation as unknown as { provider: { respond: (...a: unknown[]) => Promise<unknown> } }).provider;
    const respond = provider.respond.bind(provider);
    const slow = vi.spyOn(provider, 'respond').mockImplementation(async (...a: unknown[]) => {
      await gate;
      return respond(...a);
    });
    const done = speech.say('make the selected cabinet 750 mm high', voice);
    await settle();
    editor().select('b');
    release();
    await done;
    await settle();
    expect(last()).toMatchObject({ kind: 'proposal', status: 'proposed', note: expect.stringMatching(/was selected when you asked/) });
    expect((last() as Extract<ChatMessage, { kind: 'proposal' }>).proposal.named).toEqual(['a']);
    slow.mockRestore();
  });

  it('switching projects while a spoken request is processed discards the stale reply', async () => {
    const conversation = assistantConversation();
    const provider = (conversation as unknown as { provider: { respond: (...a: unknown[]) => Promise<unknown> } }).provider;
    const respond = provider.respond.bind(provider);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = vi.spyOn(provider, 'respond').mockImplementation(async (...a: unknown[]) => {
      await gate;
      return respond(...a);
    });
    const done = speech.say('create a 900 mm base cabinet', voice);
    await settle();
    const other = createProject({ name: 'Other', room: DEFAULT_ROOM, layout: 'empty' }, () => `x${Math.random().toString(36).slice(2, 8)}`);
    editor().openProject(other);
    release();
    await done;
    await settle();
    expect(project().id).toBe(other.id);
    expect(project().cabinets).toHaveLength(0);
    expect(proposals()).toHaveLength(0);
    expect(voice.state.status).toBe('idle');
    slow.mockRestore();
  });

  it('a project switch while speaking sends nothing', async () => {
    await voice.start();
    speech.open();
    const opts = speech.opts!;
    editor().openProject(createProject({ name: 'Other', room: DEFAULT_ROOM, layout: 'empty' }, () => `y${Math.random().toString(36).slice(2, 8)}`));
    opts.onResult({ transcript: 'create a 900 mm base cabinet', isFinal: true });
    await settle();
    expect(messages()).toHaveLength(0);
    expect(voice.state.error).toMatchObject({ code: 'project-changed' });
  });
});
