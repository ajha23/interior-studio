/** Starter finishes copied into every new project. Colours are sRGB; roughness/metalness are PBR. */
import type { KitchenMaterial, Surfaces } from '../schema';

const m = (id: string, name: string, category: KitchenMaterial['category'], color: string, roughness: number, metalness = 0): KitchenMaterial =>
  ({ id, name, category, color, roughness, metalness });

export const MATERIAL_LIBRARY: readonly KitchenMaterial[] = [
  m('shutter-white-matte', 'White matte', 'shutter', '#f1f0eb', 0.65),
  m('shutter-oak', 'Natural oak', 'shutter', '#b98c5d', 0.55),
  m('shutter-walnut', 'Walnut', 'shutter', '#6a4a34', 0.5),
  m('shutter-sage', 'Sage green', 'shutter', '#8ea38b', 0.6),
  m('shutter-navy', 'Deep navy', 'shutter', '#2e3c55', 0.5),
  m('shutter-graphite', 'Graphite', 'shutter', '#3b3c3f', 0.45),
  m('shutter-cashmere', 'Cashmere', 'shutter', '#d8cbb8', 0.6),
  m('carcass-white', 'White carcass', 'carcass', '#ebe8e1', 0.7),
  m('carcass-grey', 'Grey carcass', 'carcass', '#9c9c9a', 0.7),
  m('counter-quartz-white', 'White quartz', 'countertop', '#ebe9e4', 0.25),
  m('counter-black-granite', 'Black granite', 'countertop', '#27282b', 0.3),
  m('counter-oak', 'Oak butcher block', 'countertop', '#a97a4b', 0.5),
  m('counter-concrete', 'Concrete', 'countertop', '#9c9a95', 0.75),
  m('floor-oak', 'Oak planks', 'floor', '#c7a27b', 0.6),
  m('floor-grey-tile', 'Grey tile', 'floor', '#b8b6b1', 0.4),
  m('floor-terrazzo', 'Terrazzo', 'floor', '#d9d4ca', 0.45),
  m('wall-warm-white', 'Warm white', 'wall', '#f3f0e9', 0.9),
  m('wall-sage', 'Sage', 'wall', '#c8d2c2', 0.9),
  m('wall-greige', 'Greige', 'wall', '#d8d1c6', 0.9),
];

export const DEFAULT_SHUTTER = 'shutter-white-matte';

export const DEFAULT_SURFACES: Surfaces = {
  floor: 'floor-oak',
  wall: 'wall-warm-white',
  countertop: 'counter-quartz-white',
  carcass: 'carcass-white',
};

export function libraryMaterials(): Record<string, KitchenMaterial> {
  return Object.fromEntries(MATERIAL_LIBRARY.map((mat) => [mat.id, { ...mat }]));
}
