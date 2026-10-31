/**
 * Screen-space ambient occlusion (N8AO) for the realistic style at high quality: contact shadows
 * in corners, gaps and under units. Loaded on demand (the post-processing libraries are large).
 */
import { EffectComposer, N8AO } from '@react-three/postprocessing';

export default function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.45} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes />
    </EffectComposer>
  );
}
