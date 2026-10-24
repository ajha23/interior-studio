import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Drag-to-look viewer for an equirectangular 360° image. Wheel or pinch zooms; arrow keys turn.
 * Plain three.js (no React Three Fiber) so it stays light on the client share page.
 */
export function PanoViewer({ url, className }: { url: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    const geo = new THREE.SphereGeometry(10, 64, 32);
    geo.scale(-1, 1, 1); // view from inside
    const mat = new THREE.MeshBasicMaterial({ color: '#888' });
    scene.add(new THREE.Mesh(geo, mat));
    let disposed = false;
    new THREE.TextureLoader().load(url, (t) => {
      if (disposed) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      mat.map = t;
      mat.color.set('#fff');
      mat.needsUpdate = true;
      draw();
    });

    let lon = 0;
    let lat = 0;
    const draw = () => {
      lat = Math.max(-85, Math.min(85, lat));
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      renderer.render(scene, camera);
    };
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let drag: { x: number; y: number; lon: number; lat: number } | null = null;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, lon, lat };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = camera.fov / el.clientHeight;
      lon = drag.lon - (e.clientX - drag.x) * k;
      lat = drag.lat + (e.clientY - drag.y) * k;
      draw();
    };
    const up = () => {
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = Math.max(35, Math.min(100, camera.fov + e.deltaY * 0.05));
      camera.updateProjectionMatrix();
      draw();
    };
    const key = (e: KeyboardEvent) => {
      const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key];
      if (!d) return;
      e.preventDefault();
      lon += d[0];
      lat += d[1];
      draw();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    return () => {
      disposed = true;
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
      mat.map?.dispose();
      mat.dispose();
      geo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);
  return <div ref={host} className={`pano ${className ?? ''}`} tabIndex={0} role="img" aria-label="360° view — drag to look around" />;
}
