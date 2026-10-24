import type * as THREE from 'three';

/** The live 3D scene and camera, for the photoreal renderer. Set while the 3D view is mounted. */
export const liveView: { current: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null } = { current: null };
