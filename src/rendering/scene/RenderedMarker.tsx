import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

/**
 * Sets `data-rendered` on the canvas once a few frames have drawn, so end-to-end tests (and
 * anything else that needs pixels) can wait for real geometry instead of guessing timeouts.
 */
export function RenderedMarker() {
  const frames = useRef(0);
  useFrame(({ gl }) => {
    if (frames.current > 3) return;
    frames.current += 1;
    if (frames.current === 3) gl.domElement.setAttribute('data-rendered', 'true');
  });
  return null;
}
