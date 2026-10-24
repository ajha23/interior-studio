/**
 * Surface materials for floors, walls and furniture. Patterns are procedural (drawn from a few
 * numbers), so they render identically in the 2D plan, the 3D view and later the renderer.
 * Ids are stable: scenes store them. Never rename an id; deprecate and add a new one instead.
 */
export type MaterialCategory = 'floor' | 'wall' | 'surface';
export type Pattern = 'plain' | 'planks' | 'herringbone' | 'tiles' | 'marble' | 'brick' | 'stone' | 'stripes' | 'fabric';

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  /** Base colour. */
  color: string;
  pattern: Pattern;
  /** Second colour for joints, veins, grain or stripes. */
  accent?: string;
  /** Size of one pattern unit in mm (plank width, tile size, brick length…). */
  scaleMm?: number;
  /** 0 matte … 1 glossy. */
  gloss?: number;
}

export const MATERIALS: Material[] = [
  // Floors — ids from Phase 0 kept as-is.
  { id: 'oak-floor', name: 'Oak planks', category: 'floor', color: '#b89466', pattern: 'planks', accent: '#9c7a50', scaleMm: 190, gloss: 0.25 },
  { id: 'walnut-floor', name: 'Walnut planks', category: 'floor', color: '#6e4d34', pattern: 'planks', accent: '#5a3d28', scaleMm: 180, gloss: 0.3 },
  { id: 'teak-herringbone', name: 'Teak herringbone', category: 'floor', color: '#a5713f', pattern: 'herringbone', accent: '#8a5c31', scaleMm: 90, gloss: 0.3 },
  { id: 'ash-floor', name: 'Ash planks', category: 'floor', color: '#d2bc97', pattern: 'planks', accent: '#bba37c', scaleMm: 200, gloss: 0.2 },
  { id: 'marble', name: 'Statuario marble', category: 'floor', color: '#e7e4de', pattern: 'marble', accent: '#bdb8af', scaleMm: 1200, gloss: 0.7 },
  { id: 'italian-marble-beige', name: 'Botticino marble', category: 'floor', color: '#e2d5bd', pattern: 'marble', accent: '#c6b493', scaleMm: 1200, gloss: 0.7 },
  { id: 'kota-stone', name: 'Kota stone', category: 'floor', color: '#8f9a8e', pattern: 'tiles', accent: '#7c867b', scaleMm: 600, gloss: 0.35 },
  { id: 'vitrified-grey', name: 'Grey vitrified 600', category: 'floor', color: '#a9a7a2', pattern: 'tiles', accent: '#8e8c87', scaleMm: 600, gloss: 0.5 },
  { id: 'vitrified-white', name: 'White vitrified 800', category: 'floor', color: '#ecebe7', pattern: 'tiles', accent: '#cfcdc7', scaleMm: 800, gloss: 0.6 },
  { id: 'vitrified-beige', name: 'Beige vitrified 600', category: 'floor', color: '#d8c8ad', pattern: 'tiles', accent: '#bfae91', scaleMm: 600, gloss: 0.5 },
  { id: 'terrazzo', name: 'Terrazzo', category: 'floor', color: '#d6cec2', pattern: 'stone', accent: '#9d9285', scaleMm: 600, gloss: 0.45 },
  { id: 'granite-black', name: 'Black granite', category: 'floor', color: '#2f3032', pattern: 'stone', accent: '#55575a', scaleMm: 600, gloss: 0.8 },
  { id: 'cement-tile', name: 'Patterned cement tile', category: 'floor', color: '#c9c2b4', pattern: 'tiles', accent: '#5f7c86', scaleMm: 200, gloss: 0.2 },
  { id: 'anti-skid-grey', name: 'Anti-skid bath tile', category: 'floor', color: '#9fa3a3', pattern: 'tiles', accent: '#808585', scaleMm: 300, gloss: 0.1 },
  { id: 'vinyl-oak', name: 'Oak-look vinyl', category: 'floor', color: '#c4a57d', pattern: 'planks', accent: '#ad8f68', scaleMm: 180, gloss: 0.15 },
  { id: 'carpet-grey', name: 'Grey carpet', category: 'floor', color: '#8d8d8a', pattern: 'fabric', accent: '#7c7c79', scaleMm: 20, gloss: 0 },

  // Walls — ids from Phase 0 kept as-is.
  { id: 'warm-white', name: 'Warm white', category: 'wall', color: '#f1ece3', pattern: 'plain', gloss: 0.1 },
  { id: 'greige', name: 'Greige', category: 'wall', color: '#d9d1c4', pattern: 'plain', gloss: 0.1 },
  { id: 'sage-wall', name: 'Sage', category: 'wall', color: '#c4ccbb', pattern: 'plain', gloss: 0.1 },
  { id: 'clay', name: 'Clay', category: 'wall', color: '#dcc0a8', pattern: 'plain', gloss: 0.1 },
  { id: 'paint-navy', name: 'Deep navy', category: 'wall', color: '#2e3d55', pattern: 'plain', gloss: 0.1 },
  { id: 'paint-terracotta', name: 'Terracotta', category: 'wall', color: '#b9705a', pattern: 'plain', gloss: 0.1 },
  { id: 'paint-mustard', name: 'Mustard', category: 'wall', color: '#c99a3b', pattern: 'plain', gloss: 0.1 },
  { id: 'paint-charcoal', name: 'Charcoal', category: 'wall', color: '#45474a', pattern: 'plain', gloss: 0.1 },
  { id: 'paint-blush', name: 'Blush', category: 'wall', color: '#e5c7bf', pattern: 'plain', gloss: 0.1 },
  { id: 'wallpaper-stripe', name: 'Linen stripe wallpaper', category: 'wall', color: '#e8e0d2', pattern: 'stripes', accent: '#d6cbb7', scaleMm: 120, gloss: 0.05 },
  { id: 'wallpaper-sage-stripe', name: 'Sage stripe wallpaper', category: 'wall', color: '#d3dacb', pattern: 'stripes', accent: '#b9c3ae', scaleMm: 80, gloss: 0.05 },
  { id: 'exposed-brick', name: 'Exposed brick', category: 'wall', color: '#a65f45', pattern: 'brick', accent: '#d9cdbd', scaleMm: 230, gloss: 0.05 },
  { id: 'white-brick', name: 'Painted brick', category: 'wall', color: '#eeeae2', pattern: 'brick', accent: '#cfc9be', scaleMm: 230, gloss: 0.05 },
  { id: 'stone-cladding', name: 'Stone cladding', category: 'wall', color: '#a69c8d', pattern: 'stone', accent: '#7e7569', scaleMm: 300, gloss: 0.1 },
  { id: 'wood-fluted', name: 'Fluted oak panel', category: 'wall', color: '#b48d62', pattern: 'stripes', accent: '#93704a', scaleMm: 40, gloss: 0.2 },
  { id: 'wall-tile-white', name: 'White subway tile', category: 'wall', color: '#f3f2ee', pattern: 'brick', accent: '#d7d5cf', scaleMm: 150, gloss: 0.7 },
  { id: 'wall-tile-green', name: 'Green zellige tile', category: 'wall', color: '#5f8c78', pattern: 'tiles', accent: '#4c7461', scaleMm: 100, gloss: 0.8 },
  { id: 'marble-wall', name: 'Marble slab', category: 'wall', color: '#e9e6e0', pattern: 'marble', accent: '#c1bcb3', scaleMm: 1200, gloss: 0.7 },

  // Furniture surfaces (laminates, fabrics, metals).
  { id: 'oak-light', name: 'Light Oak laminate', category: 'surface', color: '#c9a77c', pattern: 'planks', accent: '#b8956a', scaleMm: 600, gloss: 0.2 },
  { id: 'walnut', name: 'Walnut laminate', category: 'surface', color: '#6b4a33', pattern: 'planks', accent: '#5a3e2a', scaleMm: 600, gloss: 0.25 },
  { id: 'teak', name: 'Teak veneer', category: 'surface', color: '#9a6a3c', pattern: 'planks', accent: '#845a31', scaleMm: 600, gloss: 0.3 },
  { id: 'white-matte', name: 'Frosty White matte', category: 'surface', color: '#ece9e2', pattern: 'plain', gloss: 0.1 },
  { id: 'graphite', name: 'Graphite suede', category: 'surface', color: '#4a4c4e', pattern: 'plain', gloss: 0.1 },
  { id: 'sage', name: 'Sage Green PU', category: 'surface', color: '#8f9e86', pattern: 'plain', gloss: 0.5 },
  { id: 'terracotta', name: 'Terracotta PU', category: 'surface', color: '#b86a4b', pattern: 'plain', gloss: 0.5 },
  { id: 'ivory', name: 'Ivory satin', category: 'surface', color: '#e6dcc7', pattern: 'plain', gloss: 0.3 },
  { id: 'fabric-beige', name: 'Beige linen', category: 'surface', color: '#cbbba1', pattern: 'fabric', accent: '#bba98d', scaleMm: 10, gloss: 0 },
  { id: 'fabric-grey', name: 'Grey boucle', category: 'surface', color: '#9a9893', pattern: 'fabric', accent: '#888680', scaleMm: 10, gloss: 0 },
  { id: 'fabric-teal', name: 'Teal velvet', category: 'surface', color: '#2f6a6a', pattern: 'fabric', accent: '#285b5b', scaleMm: 10, gloss: 0.15 },
  { id: 'fabric-mustard', name: 'Mustard velvet', category: 'surface', color: '#c1912f', pattern: 'fabric', accent: '#a87e28', scaleMm: 10, gloss: 0.15 },
  { id: 'leather-tan', name: 'Tan leather', category: 'surface', color: '#9c6a42', pattern: 'plain', gloss: 0.35 },
  { id: 'metal-black', name: 'Matte black metal', category: 'surface', color: '#2a2b2d', pattern: 'plain', gloss: 0.4 },
  { id: 'metal-brass', name: 'Brushed brass', category: 'surface', color: '#b8954f', pattern: 'plain', gloss: 0.8 },
  { id: 'steel', name: 'Brushed steel', category: 'surface', color: '#b9bcbf', pattern: 'plain', gloss: 0.8 },
  { id: 'ceramic-white', name: 'White ceramic', category: 'surface', color: '#f6f6f3', pattern: 'plain', gloss: 0.9 },
  { id: 'glass', name: 'Clear glass', category: 'surface', color: '#cfe3ea', pattern: 'plain', gloss: 1 },
  { id: 'cane', name: 'Natural cane', category: 'surface', color: '#c8a46b', pattern: 'fabric', accent: '#a9864f', scaleMm: 15, gloss: 0.1 },
  { id: 'plant-green', name: 'Foliage', category: 'surface', color: '#4f7a45', pattern: 'plain', gloss: 0.2 },
  { id: 'terracotta-pot', name: 'Terracotta pot', category: 'surface', color: '#b0623f', pattern: 'plain', gloss: 0.1 },
];

const byId = new Map(MATERIALS.map((m) => [m.id, m]));

const FALLBACK: Record<MaterialCategory, string> = { floor: 'oak-floor', wall: 'warm-white', surface: 'white-matte' };

/** Look up a material; unknown ids fall back to the category default so old scenes always render. */
export function materialById(id: string | undefined, category: MaterialCategory = 'surface'): Material {
  return (id && byId.get(id)) || byId.get(FALLBACK[category])!;
}

export function materialsIn(category: MaterialCategory): Material[] {
  return MATERIALS.filter((m) => m.category === category);
}

export function isMaterialId(id: string): boolean {
  return byId.has(id);
}
