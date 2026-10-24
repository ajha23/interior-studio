import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Recipe, RecipePart } from '@studio/core';
import { threeMaterial } from '../materials/three';

const M = (mm: number) => mm / 1000;
const DEG = Math.PI / 180;

function geometryFor(p: RecipePart): THREE.BufferGeometry {
  switch (p.shape) {
    case 'box':
      return new THREE.BoxGeometry(M(p.size[0]), M(p.size[1]), M(p.size[2]));
    case 'roundedBox': {
      const r = Math.min(M(p.radius), M(Math.min(...p.size)) / 2 - 1e-5);
      return new RoundedBoxGeometry(M(p.size[0]), M(p.size[1]), M(p.size[2]), 3, Math.max(0, r));
    }
    case 'cylinder':
      return new THREE.CylinderGeometry(M(p.radiusTop), M(p.radiusBottom), M(p.height), 24);
    case 'sphere':
      return new THREE.SphereGeometry(M(p.radius), 24, 16);
    case 'torus': {
      const g = new THREE.TorusGeometry(M(p.radius), M(p.tube), 12, 32);
      g.rotateX(Math.PI / 2); // ring lies flat in xz
      return g;
    }
    case 'lathe': {
      // Profile y is measured from the part's base; centre it on the part position like the other shapes.
      const ys = p.profile.map(([, y]) => y);
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      return new THREE.LatheGeometry(p.profile.map(([r, y]) => new THREE.Vector2(M(r), M(y - mid))), 32);
    }
    case 'extrude': {
      const shape = new THREE.Shape(p.outline.map(([x, y]) => new THREE.Vector2(M(x), M(y))));
      for (const h of p.holes ?? []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(M(x), M(y)))));
      const bevel = M(p.bevel ?? 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, M(p.depth) - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      // Centre the outline's box on the part position (outline coords are relative to it).
      g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
      return g;
    }
    case 'tube': {
      const curve = new THREE.CatmullRomCurve3(p.path.map(([x, y, z]) => new THREE.Vector3(M(x), M(y), M(z))), Boolean(p.closed));
      return new THREE.TubeGeometry(curve, Math.max(24, p.path.length * 12), M(p.radius), 10, Boolean(p.closed));
    }
  }
}

/** Build a recipe as a three.js group in metres, resting on the floor (y = 0), centred in plan. */
export function buildRecipe(recipe: Recipe): THREE.Group {
  const group = new THREE.Group();
  group.name = recipe.name;
  for (const p of recipe.parts) {
    let geo: THREE.BufferGeometry;
    try {
      geo = geometryFor(p);
    } catch {
      continue; // a malformed outline shouldn't sink the whole model
    }
    const id = recipe.materials[p.material] ?? 'white-matte';
    const count = p.repeat?.count ?? 1;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, threeMaterial(id, 'surface', { plain: true }));
      mesh.name = count > 1 ? `${p.id}-${i + 1}` : p.id;
      const off = p.repeat?.offset ?? [0, 0, 0];
      mesh.position.set(M(p.position[0] + off[0] * i), M(p.position[1] + off[1] * i), M(p.position[2] + off[2] * i));
      if (p.rotation) mesh.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  // Rest on the floor and centre in plan, whatever origin the recipe used.
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3());
    for (const ch of group.children) ch.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  }
  return group;
}

/** Export a built recipe to GLB. Materials are cloned so the shared editor materials aren't touched. */
export async function recipeToGlb(recipe: Recipe): Promise<Blob> {
  const group = buildRecipe(recipe);
  const scene = new THREE.Scene();
  scene.add(group);
  const buf = (await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true })) as ArrayBuffer;
  group.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  return new Blob([buf], { type: 'model/gltf-binary' });
}

/** Actual built size in mm (after building), to compare with what the recipe claims. */
export function measureRecipe(recipe: Recipe): { w: number; d: number; h: number } {
  const g = buildRecipe(recipe);
  const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  g.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  return { w: Math.round(s.x * 1000), d: Math.round(s.z * 1000), h: Math.round(s.y * 1000) };
}
