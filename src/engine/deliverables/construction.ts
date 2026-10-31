/**
 * Construction rule sets for workshop outputs. A cut list is produced only for cabinet types a
 * chosen rule set lists as verified; other types get the schedule and an explicit "no cut-list
 * rules" flag. Rule sets describe what the generator actually does, so they cannot drift from the
 * geometry: the panel sizes come from the same procedural parts as the 3D model (engine/geometry/parts.ts).
 */
import type { CabinetType } from '@/domain';

export interface ConstructionRules {
  id: string;
  name: string;
  /** What the rules are and where they come from. */
  description: string;
  carcassThickness: number;
  backThickness: number;
  frontThickness: number;
  /** Gap between fronts and around them (mm). */
  frontGap: number;
  /** Kickboard thickness; the 3D plinth block is cut as a kickboard of this thickness. */
  plinthThickness: number;
  joinery: string;
  edgeBanding: { fronts: 'all 4'; carcassFrontEdge: '1 long'; shelvesAndDividers: '1 long'; thickness: number } | null;
  hinges: string;
  legs: string;
  /** Cabinet types whose cut list these rules produce and that a fixture test verifies. */
  verified: CabinetType[];
  /** Types the rules do not yet cover, with the reason. */
  unsupported: Partial<Record<CabinetType, string>>;
  defaultWastePercent: number;
  board: { length: number; width: number };
}

export const CONSTRUCTIONS: Record<string, ConstructionRules> = {
  'frameless-18': {
    id: 'frameless-18',
    name: 'Frameless box, 18 mm carcass, 8 mm back',
    description:
      'Each unit is its own box (no shared sides): 18 mm sides with top and bottom between them, 8 mm back, 18 mm full-overlay fronts with 3 mm gaps, 12 mm drawer boxes, 18 mm kickboard. Matches the geometry builder and the cut-list fixture tests.',
    carcassThickness: 18,
    backThickness: 8,
    frontThickness: 18,
    frontGap: 3,
    plinthThickness: 18,
    joinery: 'Butt joints (screws/dowels). No joinery allowances are added to panel sizes.',
    edgeBanding: { fronts: 'all 4', carcassFrontEdge: '1 long', shelvesAndDividers: '1 long', thickness: 1 },
    hinges: '2 concealed hinges per door up to 900 mm tall, 3 up to 1500 mm, 4 above.',
    legs: '4 adjustable legs per floor unit, 6 over 900 mm wide; 2 hanging brackets per wall unit.',
    verified: ['base', 'drawer', 'sink', 'wall', 'tall'],
    unsupported: { corner: 'Blind corner units need a blind panel, door stop and corner filler rule that this rule set does not define yet.' },
    defaultWastePercent: 15,
    board: { length: 2440, width: 1220 },
  },
};

export function constructionOf(id: string | undefined): ConstructionRules | null {
  return id ? (CONSTRUCTIONS[id] ?? null) : null;
}
