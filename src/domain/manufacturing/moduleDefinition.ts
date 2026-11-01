import { z } from 'zod';

export type ModuleCategory =
  | 'base'
  | 'wall'
  | 'tall'
  | 'drawer'
  | 'sink'
  | 'corner'
  | 'wardrobe'
  | 'vanity'
  | 'loose_furniture';

export interface ParametricPartFormula {
  name: string;
  role: 'carcass' | 'shutter' | 'back' | 'shelf' | 'stretcher' | 'drawer_box';
  grain: 'L' | 'W' | 'NONE';
  // Formulas evaluate against module width (W), height (H), depth (D), and rule pack (RP)
  lengthFormula: string; // e.g. "H" or "W - 2 * RP.carcassThickness"
  widthFormula: string;  // e.g. "D" or "D - RP.shelfSetback"
  thicknessFormula: string; // e.g. "RP.carcassThickness"
  edgeBanding: {
    l1?: 'exposed' | 'hidden'; // Top edge / length 1
    l2?: 'exposed' | 'hidden'; // Bottom edge / length 2
    w1?: 'exposed' | 'hidden'; // Front edge / width 1
    w2?: 'exposed' | 'hidden'; // Back edge / width 2
  };
}

export const ModuleDefinitionSchema = z.object({
  code: z.string(), // e.g. "B600-1D", "W900-2D", "WR900-2D"
  category: z.enum([
    'base',
    'wall',
    'tall',
    'drawer',
    'sink',
    'corner',
    'wardrobe',
    'vanity',
    'loose_furniture',
  ]),
  name: z.string(),
  description: z.string().optional(),
  defaultDimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    depth: z.number().int().positive(),
  }),
  allowedWidths: z.array(z.number().int().positive()).optional(),
  minWidth: z.number().int().positive(),
  maxWidth: z.number().int().positive(),
  minHeight: z.number().int().positive(),
  maxHeight: z.number().int().positive(),
  minDepth: z.number().int().positive(),
  maxDepth: z.number().int().positive(),
  hasShutters: z.boolean().default(true),
  shutterCount: z.number().int().min(0).max(4).default(1),
  shelfCount: z.number().int().min(0).max(10).default(1),
});

export type ModuleDefinition = z.infer<typeof ModuleDefinitionSchema>;

/**
 * Standard library of parametric module definitions.
 */
export const STANDARD_MODULES: Record<string, ModuleDefinition> = {
  'BASE-STD': {
    code: 'BASE-STD',
    category: 'base',
    name: 'Standard Base Unit',
    description: 'Single or double shutter base cabinet with 1 adjustable shelf',
    defaultDimensions: { width: 600, height: 720, depth: 560 },
    minWidth: 300,
    maxWidth: 1200,
    minHeight: 600,
    maxHeight: 900,
    minDepth: 300,
    maxDepth: 700,
    hasShutters: true,
    shutterCount: 1, // 1 for <=600, 2 for >600
    shelfCount: 1,
  },
  'DRAWER-3B': {
    code: 'DRAWER-3B',
    category: 'drawer',
    name: '3-Drawer Base Unit',
    description: '1 shallow cutlery drawer + 2 deep pot drawers',
    defaultDimensions: { width: 600, height: 720, depth: 560 },
    minWidth: 400,
    maxWidth: 1200,
    minHeight: 600,
    maxHeight: 900,
    minDepth: 450,
    maxDepth: 650,
    hasShutters: false,
    shutterCount: 0,
    shelfCount: 0,
  },
  'SINK-BASE': {
    code: 'SINK-BASE',
    category: 'sink',
    name: 'Sink Base Unit',
    description: 'Open-top base cabinet with aluminium bottom liner support',
    defaultDimensions: { width: 900, height: 720, depth: 560 },
    minWidth: 600,
    maxWidth: 1200,
    minHeight: 600,
    maxHeight: 900,
    minDepth: 500,
    maxDepth: 700,
    hasShutters: true,
    shutterCount: 2,
    shelfCount: 0,
  },
  'WALL-STD': {
    code: 'WALL-STD',
    category: 'wall',
    name: 'Standard Wall Unit',
    description: 'Wall cabinet with 2 adjustable shelves',
    defaultDimensions: { width: 600, height: 720, depth: 350 },
    minWidth: 300,
    maxWidth: 1200,
    minHeight: 300,
    maxHeight: 1000,
    minDepth: 250,
    maxDepth: 450,
    hasShutters: true,
    shutterCount: 1,
    shelfCount: 2,
  },
  'TALL-PANTRY': {
    code: 'TALL-PANTRY',
    category: 'tall',
    name: 'Tall Pantry Unit',
    description: 'Full height tall cabinet with split shutters and 4 shelves',
    defaultDimensions: { width: 600, height: 2100, depth: 560 },
    minWidth: 450,
    maxWidth: 900,
    minHeight: 1800,
    maxHeight: 2400,
    minDepth: 450,
    maxDepth: 700,
    hasShutters: true,
    shutterCount: 2,
    shelfCount: 4,
  },
  'WARDROBE-2D': {
    code: 'WARDROBE-2D',
    category: 'wardrobe',
    name: '2-Door Hinged Wardrobe',
    description: 'Full height 2-door wardrobe with upper loft shelf and hanging rail space',
    defaultDimensions: { width: 900, height: 2100, depth: 600 },
    minWidth: 600,
    maxWidth: 1200,
    minHeight: 1800,
    maxHeight: 2700,
    minDepth: 500,
    maxDepth: 700,
    hasShutters: true,
    shutterCount: 2,
    shelfCount: 2,
  },
  'WARDROBE-SLIDE': {
    code: 'WARDROBE-SLIDE',
    category: 'wardrobe',
    name: '2-Door Sliding Wardrobe',
    description: 'Wide bedroom wardrobe with top and bottom slider track allowances',
    defaultDimensions: { width: 1500, height: 2100, depth: 650 },
    minWidth: 1200,
    maxWidth: 2400,
    minHeight: 1800,
    maxHeight: 2700,
    minDepth: 600,
    maxDepth: 750,
    hasShutters: true,
    shutterCount: 2,
    shelfCount: 3,
  },
  'VANITY-BWP': {
    code: 'VANITY-BWP',
    category: 'vanity',
    name: 'Washroom Vanity (BWP Plywood)',
    description: 'Moisture-resistant carcass in BWP plywood with basin plumbing clearance',
    defaultDimensions: { width: 800, height: 800, depth: 500 },
    minWidth: 500,
    maxWidth: 1200,
    minHeight: 600,
    maxHeight: 900,
    minDepth: 450,
    maxDepth: 600,
    hasShutters: true,
    shutterCount: 2,
    shelfCount: 1,
  },
  'LOOSE-TABLE-4P': {
    code: 'LOOSE-TABLE-4P',
    category: 'loose_furniture',
    name: 'Dining Table (4-Seater)',
    description: 'Parametric solid top dining table with perimeter aprons and 4 corner legs',
    defaultDimensions: { width: 1200, height: 750, depth: 800 },
    minWidth: 900,
    maxWidth: 2400,
    minHeight: 700,
    maxHeight: 800,
    minDepth: 600,
    maxDepth: 1200,
    hasShutters: false,
    shutterCount: 0,
    shelfCount: 0,
  },
  'LOOSE-STUDY-DESK': {
    code: 'LOOSE-STUDY-DESK',
    category: 'loose_furniture',
    name: 'Executive Study Desk',
    description: 'Work desk with modesty panel and storage pedestal',
    defaultDimensions: { width: 1200, height: 750, depth: 600 },
    minWidth: 900,
    maxWidth: 1800,
    minHeight: 700,
    maxHeight: 800,
    minDepth: 500,
    maxDepth: 800,
    hasShutters: false,
    shutterCount: 0,
    shelfCount: 1,
  },
};

