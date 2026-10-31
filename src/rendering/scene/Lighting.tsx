/**
 * Lighting for the 3D view. The realistic style lights the room like an interior photograph:
 * image-based light from a neutral studio room (three.js RoomEnvironment, generated on the GPU, no
 * download) for soft fill and reflections in metal and glass, a warm sun for shadows, AgX tone
 * mapping, and ambient occlusion (N8AO) to darken corners, gaps and contact points. The CAD styles
 * (edges, x-ray) keep flat, even light.
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { AgXToneMapping, NeutralToneMapping, PCFShadowMap, PCFSoftShadowMap, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { VisualStyle } from '@/state/editorStore';
import { toWorld } from '../units';

export function Lighting({ style, room, high = true }: { style: VisualStyle; room: { width: number; length: number; height: number }; high?: boolean }) {
  // Fast quality keeps the plain lights: image-based light is costly per pixel on slow GPUs.
  const realistic = style === 'realistic' && high;
  const get = useThree((s) => s.get);

  useEffect(() => {
    // The renderer and scene are three.js objects owned by the canvas; configure them here.
    const { gl, scene } = get();
    gl.toneMapping = realistic ? AgXToneMapping : NeutralToneMapping;
    gl.toneMappingExposure = realistic ? 0.82 : 1;
    gl.shadowMap.type = realistic ? PCFSoftShadowMap : PCFShadowMap;
    if (!realistic) {
      scene.environment = null;
      return;
    }
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.42;
    return () => {
      if (scene.environment === env) scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [get, realistic]);

  const { width, length, height } = room;
  return (
    <>
      <ambientLight intensity={realistic ? 0.05 : 0.9} />
      <hemisphereLight args={['#ffffff', '#b9ad9c', realistic ? 0.18 : 0.8]} />
      <directionalLight
        castShadow
        color={realistic ? '#fff4e6' : '#ffffff'}
        intensity={realistic ? 1.6 : 1.3}
        position={[toWorld(width) * 0.7, toWorld(height) + 2.5, toWorld(length) + 2]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
        shadow-radius={realistic ? 4 : 1}
      />
    </>
  );
}
