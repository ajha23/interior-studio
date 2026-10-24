import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Recipe } from '@studio/core';
import { buildRecipe } from './build';

function Model({ recipe }: { recipe: Recipe }) {
  const group = useMemo(() => buildRecipe(recipe), [recipe]);
  useEffect(
    () => () => {
      group.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    },
    [group],
  );
  return <primitive object={group} />;
}

/** Orbit preview of a recipe before it goes into the library. */
export function RecipePreview({ recipe }: { recipe: Recipe }) {
  const s = recipe.size;
  const r = Math.max(s.w, s.d, s.h) / 1000;
  const target: [number, number, number] = [0, s.h / 2000, 0];
  return (
    <div className="recipe-preview">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [r * 1.3, r * 0.95, r * 1.6], fov: 35, near: 0.01, far: 100 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#f1efea']} />
        <hemisphereLight args={['#ffffff', '#b8b0a0', 1.1]} />
        <directionalLight position={[r * 2, r * 3, r * 2.5]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-r * 2, r, -r]} intensity={0.5} />
        <Model recipe={recipe} />
        <ContactShadows position={[0, 0.001, 0]} scale={r * 3} blur={2.2} opacity={0.45} far={r} />
        <OrbitControls target={target} makeDefault enableDamping />
      </Canvas>
      <span className="recipe-dims num">
        {Math.round(s.w)} W × {Math.round(s.d)} D × {Math.round(s.h)} H mm
      </span>
    </div>
  );
}
