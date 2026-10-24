import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { toM, type ModelItem } from '@studio/core';
import { useModelUrl } from '../data/models';

/** Grey stand-in while a model loads, or when the file is missing or unreadable. */
function Placeholder({ item, missing }: { item: ModelItem; missing?: boolean }) {
  const { widthUm: w, depthUm: d, heightUm: h, elevationUm: z } = item.params;
  return (
    <mesh position={[0, toM(z + h / 2), 0]} castShadow>
      <boxGeometry args={[toM(w), toM(h), toM(d)]} />
      <meshStandardMaterial color={missing ? '#d9a7a0' : '#cfc8bc'} transparent opacity={0.6} roughness={0.9} />
    </mesh>
  );
}

function Gltf({ url, item }: { url: string; item: ModelItem }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    // Normalise: centre in plan, base on the floor, then stretch to the item's size.
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    o.position.set(-c.x, -box.min.y, -c.z);
    wrap.add(o);
    wrap.scale.set(toM(item.params.widthUm) / (size.x || 1), toM(item.params.heightUm) / (size.y || 1), toM(item.params.depthUm) / (size.z || 1));
    wrap.position.y = toM(item.params.elevationUm);
    return wrap;
  }, [scene, item.params]);
  return <primitive object={obj} />;
}

class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ModelMesh({ item }: { item: ModelItem }) {
  const { data: url, isLoading } = useModelUrl(item.modelId);
  if (isLoading) return <Placeholder item={item} />;
  if (!url) return <Placeholder item={item} missing />;
  return (
    <Guard fallback={<Placeholder item={item} missing />}>
      <Suspense fallback={<Placeholder item={item} />}>
        <Gltf url={url} item={item} />
      </Suspense>
    </Guard>
  );
}
