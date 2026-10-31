/**
 * Audio for the realtime conversation, in the browser.
 *
 * Microphone: captured with the browser's echo cancellation, noise suppression and gain control,
 * converted to 16 kHz 16-bit mono PCM in an AudioWorklet and handed over in 40 ms chunks.
 *
 * Playback: the model's 24 kHz PCM is scheduled gap-free with Web Audio as it streams in. Chrome's
 * echo canceller only subtracts audio that arrives over WebRTC, so the output is routed through a
 * local RTCPeerConnection loopback into an <audio> element: the assistant's voice then becomes the
 * echo reference and is removed from the microphone signal, so it cannot interrupt itself. Where
 * the loopback cannot be set up, audio plays directly and the session falls back to half-duplex.
 */

const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;

// Downsamples the device rate to 16 kHz and posts 40 ms Int16 frames.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / ${INPUT_RATE}; this.pos = 0; this.out = new Int16Array(${INPUT_RATE / 25}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos), f = this.pos - i;
      const a = ch[i], b = i + 1 < ch.length ? ch[i + 1] : a;
      const v = Math.max(-1, Math.min(1, a + (b - a) * f));
      this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === this.out.length) { this.port.postMessage(this.out.buffer, [this.out.buffer]); this.out = new Int16Array(${INPUT_RATE / 25}); this.n = 0; }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** 16-bit little-endian PCM → floats in [-1, 1]. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

export interface MicCapture {
  /** Stops delivering chunks (the microphone stays open). */
  paused: boolean;
  close(): void;
}

/** Opens the microphone with echo cancellation and calls `onChunk` with base64 PCM (16 kHz). */
export async function openMicrophone(onChunk: (base64: string) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-capture');
  const mic: MicCapture = {
    paused: false,
    close: () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const t of stream.getTracks()) t.stop();
      void ctx.close();
    },
  };
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!mic.paused) onChunk(toBase64(new Uint8Array(e.data)));
  };
  source.connect(node);
  // The worklet must be pulled by the graph; a muted gain keeps it running without playing the mic.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);
  await ctx.resume();
  return mic;
}

/** Routes a local MediaStream through two RTCPeerConnections so Chrome treats it as remote (AEC reference). */
async function loopback(stream: MediaStream): Promise<{ element: HTMLAudioElement; close: () => void }> {
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  a.onicecandidate = (e) => e.candidate && void b.addIceCandidate(e.candidate);
  b.onicecandidate = (e) => e.candidate && void a.addIceCandidate(e.candidate);
  const element = new Audio();
  element.autoplay = true;
  const received = new Promise<void>((resolve) => {
    b.ontrack = (e) => {
      element.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      resolve();
    };
  });
  for (const track of stream.getAudioTracks()) a.addTrack(track, stream);
  const offer = await a.createOffer();
  await a.setLocalDescription(offer);
  await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer);
  await a.setRemoteDescription(answer);
  await Promise.race([received, new Promise((_, reject) => setTimeout(() => reject(new Error('loopback timeout')), 3000))]);
  // play() can stay pending without an output device; it must never hold up the session.
  await Promise.race([element.play(), new Promise((resolve) => setTimeout(resolve, 1000))]);
  return {
    element,
    close: () => {
      element.pause();
      element.srcObject = null;
      a.close();
      b.close();
    },
  };
}

/** Plays streamed 24 kHz PCM without gaps; `flush` drops what is queued (barge-in). */
export class PcmPlayer {
  /** True when the output is an echo reference for the microphone (full duplex is safe). */
  echoCancelled = false;
  onIdle: (() => void) | null = null;
  private readonly ctx: AudioContext;
  private readonly out: AudioNode;
  private sources = new Set<AudioBufferSourceNode>();
  private endsAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private route: { close: () => void } | null = null;

  /** Create from a click handler so the browser allows playback. */
  constructor() {
    this.ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
    this.out = this.ctx.createGain();
  }

  /** Connects the output through the loopback when possible. */
  async start(): Promise<void> {
    await this.ctx.resume();
    try {
      if (typeof RTCPeerConnection === 'undefined') throw new Error('no WebRTC');
      const dest = this.ctx.createMediaStreamDestination();
      this.out.connect(dest);
      this.route = await loopback(dest.stream);
      this.echoCancelled = true;
    } catch {
      this.out.disconnect();
      this.out.connect(this.ctx.destination);
      this.echoCancelled = false;
    }
  }

  get playing(): boolean {
    return this.endsAt > this.ctx.currentTime + 0.01;
  }

  /** Queues one chunk of base64 16-bit PCM at 24 kHz. */
  enqueue(base64: string): void {
    const samples = pcm16ToFloat(fromBase64(base64));
    if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);
    // A small lead on the first chunk absorbs network jitter.
    const at = Math.max(this.endsAt, this.ctx.currentTime + 0.05);
    src.start(at);
    this.endsAt = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    this.scheduleIdle();
  }

  /** Stops everything queued at once. */
  flush(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.endsAt = 0;
    this.scheduleIdle();
  }

  async suspend(): Promise<void> {
    await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    await this.ctx.resume();
  }

  close(): void {
    this.flush();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.route?.close();
    void this.ctx.close();
  }

  private scheduleIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const ms = Math.max(0, (this.endsAt - this.ctx.currentTime) * 1000) + 30;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.playing) this.onIdle?.();
    }, ms);
  }
}
