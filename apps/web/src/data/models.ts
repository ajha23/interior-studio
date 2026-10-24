import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type * as THREEtypes from 'three';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export interface StudioModel {
  id: string;
  name: string;
  category: string;
  storagePath: string;
  thumbUrl: string | null;
  widthUm: number;
  depthUm: number;
  heightUm: number;
  bytes: number;
  createdAt: string;
}

const BUCKET = 'models';
const SIGNED_TTL_S = 60 * 60;
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

export function useModels() {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['models', activeOrg?.orgId ?? 'none'],
    enabled: Boolean(activeOrg),
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<StudioModel[]> => {
      const { data, error } = await supabase.from('catalog_models').select('*').eq('org_id', activeOrg!.orgId).order('created_at', { ascending: false });
      if (error) throw error;
      const thumbs = data.map((r) => r.thumb_path).filter((x): x is string => Boolean(x));
      const signed = thumbs.length ? await supabase.storage.from(BUCKET).createSignedUrls(thumbs, SIGNED_TTL_S) : { data: [] };
      const urlOf = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
      return data.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        storagePath: r.storage_path,
        thumbUrl: r.thumb_path ? (urlOf.get(r.thumb_path) ?? null) : null,
        widthUm: r.width_um,
        depthUm: r.depth_um,
        heightUm: r.height_um,
        bytes: r.bytes,
        createdAt: r.created_at,
      }));
    },
  });
}

/** Signed download URL for a model file, kept stable for most of its lifetime so the 3D cache hits. */
export function useModelUrl(modelId: string | undefined) {
  return useQuery({
    queryKey: ['model-url', modelId],
    enabled: Boolean(modelId),
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data: row, error } = await supabase.from('catalog_models').select('storage_path').eq('id', modelId!).maybeSingle();
      if (error) throw error;
      if (!row) return null;
      const { data, error: e2 } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, SIGNED_TTL_S);
      if (e2) throw e2;
      return data.signedUrl;
    },
  });
}

/** Read a GLB in the browser: bounding size (glTF metres, Y up) and a small thumbnail. */
export async function inspectGlb(file: File): Promise<{ widthUm: number; depthUm: number; heightUm: number; thumb: Blob | null }> {
  // three.js loads only when someone uploads, keeping it out of the editor's first paint.
  const [THREE, { GLTFLoader }] = await Promise.all([import('three'), import('three/examples/jsm/loaders/GLTFLoader.js')]);
  const buf = await file.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.x <= 0 || size.y <= 0 || size.z <= 0) throw new Error('This file has no visible geometry.');
  const toUm = (m: number) => Math.max(1000, Math.round(m * 1e6));
  let thumb: Blob | null = null;
  try {
    thumb = await renderThumb(THREE, gltf.scene, box);
  } catch {
    thumb = null; // thumbnails are a convenience; the upload still works without WebGL
  }
  return { widthUm: toUm(size.x), depthUm: toUm(size.z), heightUm: toUm(size.y), thumb };
}

async function renderThumb(THREE: typeof THREEtypes, scene: THREEtypes.Object3D, box: THREEtypes.Box3): Promise<Blob | null> {
  const S = 256;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(S, S, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const root = new THREE.Scene();
    root.add(new THREE.HemisphereLight('#ffffff', '#8a8070', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(2, 4, 3);
    root.add(sun);
    root.add(scene);
    const centre = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const cam = new THREE.PerspectiveCamera(35, 1, r / 100, r * 100);
    const dir = new THREE.Vector3(1, 0.8, 1.2).normalize();
    cam.position.copy(centre).addScaledVector(dir, r / Math.sin((35 * Math.PI) / 360));
    cam.lookAt(centre);
    renderer.render(root, cam);
    return await new Promise((res) => renderer.domElement.toBlob((b) => res(b), 'image/png'));
  } finally {
    renderer.dispose();
  }
}

export function useUploadModel() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, name, category }: { file: File; name: string; category: string }) => {
      if (!activeOrg) throw new Error('No studio selected.');
      if (!/\.glb$/i.test(file.name)) throw new Error('Upload a .glb file (binary glTF). SketchUp/FBX conversion comes later.');
      if (file.size > MAX_MODEL_BYTES) throw new Error('Files up to 50 MB.');
      const info = await inspectGlb(file);
      const id = crypto.randomUUID();
      const base = `${activeOrg.orgId}/${id}`;
      const up = await supabase.storage.from(BUCKET).upload(`${base}.glb`, file, { contentType: 'model/gltf-binary', upsert: false });
      if (up.error) throw up.error;
      let thumbPath: string | null = null;
      if (info.thumb) {
        const t = await supabase.storage.from(BUCKET).upload(`${base}.png`, info.thumb, { contentType: 'image/png', upsert: false });
        if (!t.error) thumbPath = `${base}.png`;
      }
      const { error } = await supabase.from('catalog_models').insert({
        id,
        org_id: activeOrg.orgId,
        name: name.trim().slice(0, 120) || file.name.replace(/\.glb$/i, ''),
        category,
        storage_path: `${base}.glb`,
        thumb_path: thumbPath,
        width_um: info.widthUm,
        depth_um: info.depthUm,
        height_um: info.heightUm,
        bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([`${base}.glb`, ...(thumbPath ? [thumbPath] : [])]);
        throw error;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: StudioModel) => {
      const { error } = await supabase.from('catalog_models').delete().eq('id', m.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([m.storagePath, m.storagePath.replace(/\.glb$/, '.png')]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  });
}
