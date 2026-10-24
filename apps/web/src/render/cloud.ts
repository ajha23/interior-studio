import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { LIGHTING_PRESETS } from '@studio/core';
import { supabase } from '../lib/supabase';
import { lightRig, prepareRenderScene, type RenderOptions } from './pathtrace';

/** Cloud Run URL of the Blender worker; empty when it isn't deployed yet. */
export const BLENDER_WORKER_URL = (import.meta.env.VITE_BLENDER_WORKER_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const cloudRenderAvailable = Boolean(BLENDER_WORKER_URL);

export type CloudStage = 'uploading' | 'starting' | 'preparing' | 'rendering' | 'denoising';

interface CloudLine {
  stage?: string;
  progress?: number;
  done?: boolean;
  mime?: string;
  image?: string;
  error?: string;
  message?: string;
}

/**
 * Render the current 3D view with Blender Cycles on the studio's Cloud Run worker. The browser
 * exports the same prepared scene the in-browser tracer uses, uploads it to the studio's private
 * `render-jobs` folder and streams progress while the worker renders.
 */
export async function renderInCloud(
  source: { scene: THREE.Scene; camera: THREE.PerspectiveCamera },
  opts: Omit<RenderOptions, 'onProgress'> & { orgId: string; onProgress?: (stage: CloudStage, fraction: number) => void },
): Promise<Blob> {
  if (!BLENDER_WORKER_URL) throw new Error('Cloud rendering is not set up yet.');
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('Sign in again to use cloud renders.');

  opts.onProgress?.('uploading', 0);
  const scene = prepareRenderScene(source.scene, opts);
  let glb: ArrayBuffer;
  try {
    glb = (await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false, maxTextureSize: 2048 })) as ArrayBuffer;
  } finally {
    scene.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  }
  const path = `${opts.orgId}/${crypto.randomUUID()}.glb`;
  const up = await supabase.storage.from('render-jobs').upload(path, new Blob([glb], { type: 'model/gltf-binary' }), { contentType: 'model/gltf-binary', upsert: false });
  if (up.error) throw up.error;
  opts.onProgress?.('uploading', 1);

  try {
    const spec = LIGHTING_PRESETS[opts.lighting.preset];
    const cam = source.camera;
    cam.updateMatrixWorld();
    const res = await fetch(`${BLENDER_WORKER_URL}/render`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify({
        orgId: opts.orgId,
        scenePath: path,
        width: opts.width,
        height: opts.height,
        samples: opts.samples,
        format: opts.format ?? 'png',
        camera: { matrixWorld: cam.matrixWorld.toArray(), fov: cam.fov },
        panorama: opts.panorama ?? null,
        lighting: opts.lighting,
        spec: { sky: spec.sky, sun: spec.sun, interior: spec.interior, exposure: spec.exposure, background: spec.preview.background[1] },
        rooms: opts.rooms,
        fixtures: lightRig(source.scene, opts).fixtures,
      }),
    });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => null)) as CloudLine | null;
      throw new Error(j?.message ?? `Render worker error (${res.status}).`);
    }
    opts.onProgress?.('starting', 0);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as CloudLine;
        if (msg.error) throw new Error(msg.message ?? 'The cloud render failed.');
        if (msg.done && msg.image) {
          const bin = atob(msg.image);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new Blob([bytes], { type: msg.mime ?? 'image/png' });
        }
        if (msg.stage === 'preparing' || msg.stage === 'rendering' || msg.stage === 'denoising') opts.onProgress?.(msg.stage, msg.progress ?? 0);
      }
    }
    throw new Error('The render worker stopped before finishing. Try again.');
  } finally {
    void supabase.storage.from('render-jobs').remove([path]);
  }
}
